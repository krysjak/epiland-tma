import os
import sys
import re
import json
import urllib.request
import urllib.parse
from bs4 import BeautifulSoup

# Ensure stdout handles Cyrillic characters properly on Windows
sys.stdout.reconfigure(encoding='utf-8')

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def sanitize_filename(name):
    """Sanitizes string to be a safe filename for Windows/Linux."""
    name = name.strip().lower()
    name = re.sub(r'[\s\-\+\"\']+', '_', name)
    name = re.sub(r'[\\/:*?<>|]', '', name)
    name = re.sub(r'_+', '_', name)
    return name.strip('_')

def get_file_extension(url):
    """Extracts file extension from URL, defaulting to .jpg for images."""
    parsed = urllib.parse.urlparse(url)
    path = parsed.path
    ext = os.path.splitext(path)[1].lower()
    if not ext:
        return '.jpg'
    ext = ext.split('?')[0]
    return ext

def fetch_html(url, local_path, use_local=False):
    """
    Fetches HTML from URL. Falls back to reading from local_path if use_local is True 
    or if live fetching encounters a network error.
    """
    if use_local:
        if os.path.exists(local_path):
            print(f"Offline Mode: Reading cached file from {local_path}")
            with open(local_path, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            print(f"Warning: Offline file {local_path} not found. Attempting live fetch...")

    try:
        print(f"Fetching live URL: {url} ...")
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"Network error fetching {url}: {e}")
        if os.path.exists(local_path):
            print(f"Falling back to local cached file: {local_path}")
            with open(local_path, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            raise Exception(f"Failed to fetch {url} and no local cache available.")

def download_asset(url, download_dir, subfolder, name_prefix, skip_download=False):
    """
    Downloads media file (image/PDF) from URL to download_dir/subfolder/name_prefix.ext.
    Returns relative path to the downloaded asset.
    """
    if not url or not url.startswith('http'):
        return None

    ext = get_file_extension(url)
    safe_name = sanitize_filename(name_prefix)
    rel_path = f"{download_dir}/{subfolder}/{safe_name}{ext}"
    dest_path = os.path.join(os.getcwd(), rel_path.replace('/', os.sep))

    if skip_download:
        return rel_path

    # Ensure output directories exist
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    # Check if already downloaded
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        return rel_path

    # Avoid downloading transparent 1x1 pixels or tracking pixels
    if 'pixel.webp' in url or 'tr?id=' in url:
        return None

    try:
        print(f"Downloading {url} -> {rel_path} ...")
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as response:
            content = response.read()
            with open(dest_path, 'wb') as f:
                f.write(content)
        return rel_path
    except Exception as e:
        print(f"Error downloading asset {url}: {e}")
        return None

def parse_attractions(soup, location, download_dir, skip_download):
    """Parses attractions page (/entertainment/)."""
    attractions = []
    items = soup.select('.loop-item')
    print(f"[{location}] Parsing attractions: found {len(items)} items.")

    for idx, item in enumerate(items):
        title_a = item.select_one('.item-title')
        if not title_a:
            continue
        title = title_a.text.strip()
        href = title_a.get('href')

        # Description
        desc_div = item.select_one('.item-description')
        description = desc_div.text.strip() if desc_div else ""

        # Image
        img_tag = item.select_one('.item-thumbnail img')
        img_src = None
        if img_tag:
            img_src = img_tag.get('data-src') or img_tag.get('src')
            if img_src and 'pixel.webp' in img_src:
                img_src = img_tag.get('data-src') or img_src

        # Download image
        local_img = None
        if img_src:
            local_img = download_asset(img_src, download_dir, f"{location}/images/attractions", title, skip_download)

        # Specs: parse from the custom columns row
        price_weekdays = None
        price_weekends = None
        duration = None
        restrictions = None

        cols = item.select('.row.mt-auto > .column, .row.mt-auto .column.col')
        if not cols:
            cols = item.select('.item-specs .spec-item, div.flex-grow-1 > div.flex > div')

        for col in cols:
            col_text = " ".join([t.strip() for t in col.find_all(string=True) if t.strip()])
            col_text = " ".join(col_text.split())

            # 1. Price check
            prices = [p.text.strip() for p in col.select('.price-value')]
            if prices:
                if len(prices) >= 2:
                    price_weekdays = f"{prices[0]} грн"
                    price_weekends = f"{prices[1]} грн"
                else:
                    if "Пн-Пт" in col_text and "Сб-Нд" in col_text:
                        price_weekdays = f"{prices[0]} грн"
                        price_weekends = f"{prices[0]} грн"
                    else:
                        price_weekdays = f"{prices[0]} грн"
                        price_weekends = f"{prices[0]} грн"
            elif "грн" in col_text:
                match = re.findall(r'(\d+[\s\-]*\d*)\s*грн', col_text)
                if len(match) >= 2:
                    price_weekdays = f"{match[0]} грн"
                    price_weekends = f"{match[1]} грн"
                elif len(match) == 1:
                    price_weekdays = f"{match[0]} грн"
                    price_weekends = f"{match[0]} грн"

            # 2. Duration check
            elif any(w in col_text.lower() for w in ["хв", "сеанс", "безліміт", "год"]):
                duration = col_text

            # 3. Restrictions/limits
            elif any(w in col_text.lower() for w in ["років", "кг", "см", "до "]):
                restrictions = col_text

        attractions.append({
            "title": title,
            "link": href,
            "description": description,
            "image_url": img_src,
            "local_image_path": local_img,
            "price_weekdays": price_weekdays,
            "price_weekends": price_weekends,
            "duration": duration,
            "restrictions": restrictions
        })

    return attractions

def parse_prices(soup, location, download_dir, skip_download):
    """Parses pricing page (/prices/) or specials category page and filters out birthday items."""
    parsed_items = {
        "attractions_prices": [],
        "promotions_tariffs": [],
        "products": []
    }
    items = soup.select('.loop-item')
    print(f"[{location}] Parsing page items: found {len(items)} items.")

    for idx, item in enumerate(items):
        title_el = item.select_one('.item-title')
        if not title_el:
            continue
        title = title_el.text.strip()
        if title == "Назва" or not title:
            continue

        # Filter out birthday/event-themed cards
        title_lower = title.lower()
        if any(k in title_lower for k in ["день народження", "дня народження", "іменин", "випускн", "birthday"]):
            print(f"[{location}] Filtering out birthday/event item: {title}")
            continue

        desc_el = item.select_one('.item-description')
        desc = desc_el.text.strip() if desc_el else ""

        img_el = item.select_one('img')
        img_src = ""
        if img_el:
            img_src = img_el.get('data-src') or img_el.get('src') or ""
            if 'pixel.webp' in img_src:
                img_src = img_el.get('data-src') or img_src

        classes = item.get('class', [])
        classes_str = " ".join(classes)

        item_type = "attraction"
        if "product-item" in classes_str or "product-" in classes_str:
            item_type = "product"
        elif "post-item" in classes_str or "post-" in classes_str or "loop-item-tpl-content" in classes_str or "category-spetspropozytsiyi" in classes_str:
            item_type = "tariff"

        price_elements = item.select('.price-value')
        prices = [p.text.strip() for p in price_elements]

        if item_type == "product":
            price_str = f"{prices[0]} грн" if prices else "30 грн"
            if not prices:
                txt = item.text
                match = re.search(r'(\d+)\s*грн', txt)
                if match:
                    price_str = f"{match.group(1)} грн"
            
            local_img = download_asset(img_src, download_dir, f"{location}/images/products", title, skip_download) if img_src else None

            parsed_items["products"].append({
                "title": title,
                "description": desc,
                "price": price_str,
                "image_url": img_src if img_src else None,
                "local_image_path": local_img
            })

        elif item_type == "tariff":
            price_str = None
            match = re.search(r'(\d+)\s*грн', desc + " " + title)
            if match:
                price_str = f"{match.group(1)} грн"

            local_img = download_asset(img_src, download_dir, f"{location}/images/tariffs", title, skip_download) if img_src else None

            parsed_items["promotions_tariffs"].append({
                "title": title,
                "description": desc,
                "price_details": price_str,
                "image_url": img_src if img_src else None,
                "local_image_path": local_img
            })

        else: # attraction
            price_weekdays = None
            price_weekends = None

            if len(prices) >= 2:
                price_weekdays = f"{prices[0]} грн"
                price_weekends = f"{prices[1]} грн"
            elif len(prices) == 1:
                price_weekdays = f"{prices[0]} грн"
                price_weekends = f"{prices[0]} грн"
            else:
                txt = item.text
                match = re.search(r'(\d+\s*-\s*\d+)\s*грн', txt)
                if match:
                    price_weekdays = f"{match.group(1)} грн"
                    price_weekends = f"{match.group(1)} грн"

            local_img = download_asset(img_src, download_dir, f"{location}/images/attractions_prices", title, skip_download) if img_src else None

            parsed_items["attractions_prices"].append({
                "title": title,
                "description": desc,
                "price_weekdays": price_weekdays,
                "price_weekends": price_weekends,
                "image_url": img_src if img_src else None,
                "local_image_path": local_img
            })

    return parsed_items

def parse_nanny(soup, location):
    """Parses nanny services page (/nyanya-servis/)."""
    nanny_data = {
        "title": "Няня-сервіс",
        "description": "",
        "rates": "",
        "rules": []
    }

    h1_el = soup.find('h1')
    if h1_el:
        nanny_data["title"] = h1_el.text.strip()

    content_divs = soup.select('.entry-content, .service-template-content, .page-content, article')
    if not content_divs:
        content_divs = [soup]

    paragraphs = []
    rules = []
    rates = ""

    for div in content_divs:
        for el in div.find_all(['p', 'li', 'h2', 'h3']):
            txt = " ".join(el.text.strip().split())
            if not txt:
                continue
            
            if "вартість" in txt.lower() or "грн/год" in txt.lower():
                rates = txt
            elif txt.startswith('*') or txt.startswith('•'):
                for part in re.split(r'[*•]', txt):
                    part_clean = part.strip()
                    if part_clean:
                        rules.append(part_clean)
            else:
                paragraphs.append(txt)

    nanny_data["description"] = "\n".join(paragraphs[:4])
    nanny_data["rates"] = rates
    nanny_data["rules"] = rules

    if not nanny_data["rates"]:
        nanny_data["rates"] = "Пн. – Пт.: 400 грн/год за 1 дитину*, Сб. – Нд.: 550 грн/год за 1 дитину*"
    if not nanny_data["rules"]:
        nanny_data["rules"] = [
            "Розваги сплачуються окремо",
            "На 1 няню – не більше 2 дітей віком від 3-х років"
        ]

    return nanny_data

def parse_lazertag_peyntbol(soup, location, download_dir, skip_download, use_local):
    """Parses /lazertag-peyntbol/ page items and queries subpages for details."""
    items = soup.select('.loop-item')
    print(f"[{location}] Parsing lazertag/peyntbol: found {len(items)} items.")
    results = []

    for item in items:
        title_el = item.select_one('.item-title')
        if not title_el:
            continue
        title = title_el.text.strip()
        link = title_el.get('href')

        # Main image extraction
        img_el = item.select_one('img')
        img_src = ""
        if img_el:
            img_src = img_el.get('data-src') or img_el.get('src') or ""
            if 'pixel.webp' in img_src:
                img_src = img_el.get('data-src') or img_src

        local_img = None
        if img_src:
            local_img = download_asset(img_src, download_dir, f"{location}/images/lazertag", title, skip_download)

        description = ""
        prices = []
        contact_info = ""

        # Map detail page to local cached HTML if use_local is True
        parsed_url = urllib.parse.urlparse(link)
        path_strip = parsed_url.path.strip('/')
        suffix = path_strip.split('/')[-1] if path_strip else ""
        
        cache_name = suffix.replace('-', '_')
        if suffix == 'peyntbol-2':
            cache_name = 'peyntbol-2'
            
        local_detail_path = f"scratch/{location}_{cache_name}.html"

        try:
            detail_html = fetch_html(link, local_detail_path, use_local)
            detail_soup = BeautifulSoup(detail_html, 'html.parser')
            
            # Extract detailed description
            desc_p = detail_soup.select_one('.entry-content p, .service-template-content p, p')
            if desc_p:
                description = desc_p.text.strip()
            
            # Extract prices and contacts from table
            table = detail_soup.find('table')
            if table:
                for td in table.find_all('td'):
                    lines = [l.strip() for l in td.get_text('\n').split('\n') if l.strip()]
                    for line in lines:
                        if any(w in line.lower() for w in ['грн', 'куль', 'захист']):
                            prices.append(line)
                        elif 'уточнюйте' in line.lower() or 'телефон' in line.lower():
                            contact_info = line
            else:
                for p in detail_soup.find_all('p'):
                    txt = p.text.strip()
                    if 'уточнюйте' in txt or 'телефон' in txt:
                        contact_info = txt
                        
        except Exception as e:
            print(f"Error parsing detail page {link} for {location}: {e}")

        results.append({
            "title": title,
            "link": link,
            "description": description,
            "image_url": img_src if img_src else None,
            "local_image_path": local_img,
            "prices": prices,
            "contact_info": contact_info
        })

    return results

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Epiland Website Scraper & Resource Downloader")
    parser.add_argument("--local", action="store_true", help="Parse cached HTML files in scratch/ instead of live fetching")
    parser.add_argument("--no-download", action="store_true", help="Scrape text/data only without downloading media files")
    parser.add_argument("--output", default="epiland_data.json", help="Path to write the consolidated JSON output")
    parser.add_argument("--download-dir", default="downloads", help="Directory where assets (images, PDFs) will be stored")
    args = parser.parse_args()

    output_data = {
        "metadata": {
            "scraped_at": "",
            "scraper_version": "1.1"
        },
        "locations": {}
    }

    if not args.no_download:
        os.makedirs(args.download_dir, exist_ok=True)

    # Config contains only the non-birthday pages. Birthday pages are excluded completely.
    locations = {
        "kyiv": {
            "name": "EPILAND Obolon (Kyiv)",
            "base_url": "https://kyiv.epiland.com",
            "restaurant_menu_url": "https://pestocafe21.choiceqr.com/",
            "pages": {
                "attractions": {
                    "url": "https://kyiv.epiland.com/entertainment/",
                    "local": "scratch/kyiv_entertainment.html"
                },
                "prices": {
                    "url": "https://kyiv.epiland.com/prices/",
                    "local": "scratch/kyiv_prices.html"
                },
                "specials": {
                    "url": "https://kyiv.epiland.com/category/spetspropozytsiyi/",
                    "local": "scratch/kyiv_specials.html"
                },
                "nanny": {
                    "url": "https://kyiv.epiland.com/nyanya-servis/",
                    "local": "scratch/kyiv_nyanya.html"
                }
            }
        },
        "chabany": {
            "name": "EPILAND Chabany",
            "base_url": "https://chabany.epiland.com",
            "restaurant_menu_url": "https://pestocafe22.choiceqr.com/",
            "pages": {
                "attractions": {
                    "url": "https://chabany.epiland.com/entertainment/",
                    "local": "scratch/chabany_entertainment.html"
                },
                "prices": {
                    "url": "https://chabany.epiland.com/prices/",
                    "local": "scratch/chabany_prices.html"
                },
                "specials": {
                    "url": "https://chabany.epiland.com/category/spetspropozytsiyi/",
                    "local": "scratch/chabany_specials.html"
                },
                "nanny": {
                    "url": "https://chabany.epiland.com/nyanya-servis/",
                    "local": "scratch/chabany_nyanya.html"
                },
                "lazertag_peyntbol": {
                    "url": "https://chabany.epiland.com/lazertag-peyntbol/",
                    "local": "scratch/chabany_lazertag_peyntbol.html"
                }
            }
        },
        "obukhiv": {
            "name": "EPILAND Obukhiv",
            "base_url": "https://obukhiv.epiland.com",
            "restaurant_menu_url": None,
            "pages": {
                "attractions": {
                    "url": "https://obukhiv.epiland.com/entertainment/",
                    "local": "scratch/obukhiv_entertainment.html"
                },
                "prices": {
                    "url": "https://obukhiv.epiland.com/prices/",
                    "local": "scratch/obukhiv_prices.html"
                },
                "specials": {
                    "url": "https://obukhiv.epiland.com/category/spetspropozytsiyi/",
                    "local": "scratch/obukhiv_specials.html"
                },
                "nanny": {
                    "url": "https://obukhiv.epiland.com/nyanya-servis/",
                    "local": "scratch/obukhiv_nyanya.html"
                }
            }
        }
    }

    import datetime
    output_data["metadata"]["scraped_at"] = datetime.datetime.now().isoformat()

    for loc_key, loc_info in locations.items():
        print(f"\n==========================================")
        print(f"PROCESSING LOCATION: {loc_info['name']}")
        print(f"==========================================")

        loc_data = {
            "name": loc_info["name"],
            "url": loc_info["base_url"],
            "restaurant_menu_url": loc_info["restaurant_menu_url"],
            "attractions": [],
            "prices_grid": {},
            "nanny": {}
        }

        # 1. Attractions
        page = loc_info["pages"]["attractions"]
        try:
            html = fetch_html(page["url"], page["local"], args.local)
            soup = BeautifulSoup(html, 'html.parser')
            loc_data["attractions"] = parse_attractions(soup, loc_key, args.download_dir, args.no_download)
        except Exception as e:
            print(f"Error parsing attractions for {loc_key}: {e}")

        # 2. Prices
        page = loc_info["pages"]["prices"]
        try:
            html = fetch_html(page["url"], page["local"], args.local)
            soup = BeautifulSoup(html, 'html.parser')
            loc_data["prices_grid"] = parse_prices(soup, loc_key, args.download_dir, args.no_download)
        except Exception as e:
            print(f"Error parsing prices for {loc_key}: {e}")

        # 2.1 Specials (merge with prices_grid)
        if "specials" in loc_info["pages"]:
            page = loc_info["pages"]["specials"]
            try:
                html = fetch_html(page["url"], page["local"], args.local)
                soup = BeautifulSoup(html, 'html.parser')
                specials_grid = parse_prices(soup, loc_key, args.download_dir, args.no_download)
                
                # Merge categories, keeping unique titles
                for category in ["attractions_prices", "promotions_tariffs", "products"]:
                    existing_titles = {item["title"] for item in loc_data["prices_grid"].get(category, [])}
                    for item in specials_grid.get(category, []):
                        if item["title"] not in existing_titles:
                            loc_data["prices_grid"][category].append(item)
                            existing_titles.add(item["title"])
            except Exception as e:
                print(f"Error parsing specials for {loc_key}: {e}")

        # 3. Nanny Service
        page = loc_info["pages"]["nanny"]
        try:
            html = fetch_html(page["url"], page["local"], args.local)
            soup = BeautifulSoup(html, 'html.parser')
            loc_data["nanny"] = parse_nanny(soup, loc_key)
        except Exception as e:
            print(f"Error parsing nanny service for {loc_key}: {e}")

        # 4. Laser tag & Paintball (if available)
        if "lazertag_peyntbol" in loc_info["pages"]:
            page = loc_info["pages"]["lazertag_peyntbol"]
            try:
                html = fetch_html(page["url"], page["local"], args.local)
                soup = BeautifulSoup(html, 'html.parser')
                loc_data["lazertag_paintball"] = parse_lazertag_peyntbol(soup, loc_key, args.download_dir, args.no_download, args.local)
            except Exception as e:
                print(f"Error parsing lazertag/paintball for {loc_key}: {e}")

        output_data["locations"][loc_key] = loc_data

    # Save to JSON
    output_path = os.path.join(os.getcwd(), args.output)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n==========================================")
    print(f"SCRAPING COMPLETE!")
    print(f"Consolidated data saved to: {output_path}")
    print(f"==========================================")

if __name__ == "__main__":
    main()

import os
import json
import threading
import urllib.request

DATA_DIR = os.environ.get("DATA_DIR", ".")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
lock = threading.Lock()

def init_users_file():
    """Initializes the users.json database if it doesn't exist."""
    if not os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Error initializing users database: {e}")

def fetch_telegram_avatar(bot, telegram_id):
    """
    Downloads the user's Telegram profile photo and saves it to downloads/avatars/.
    Returns the local served URL path upon success, or None.
    """
    if not bot or not telegram_id:
        return None
        
    avatar_dir = os.path.join(DATA_DIR, "downloads", "avatars")
    os.makedirs(avatar_dir, exist_ok=True)
    
    # Check if already cached
    for ext in [".svg", ".jpg"]:
        local_path = os.path.join(avatar_dir, f"{telegram_id}{ext}")
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            return f"/downloads/avatars/{telegram_id}{ext}"
            
    try:
        photos = bot.get_user_profile_photos(telegram_id)
        if photos and photos.total_count > 0:
            # Get largest version of first photo
            file_id = photos.photos[0][-1].file_id
            file_info = bot.get_file(file_id)
            file_path = file_info.file_path
            
            download_url = f"https://api.telegram.org/file/bot{bot.token}/{file_path}"
            
            req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                content = response.read()
                
                is_svg = b"<svg" in content or b"<?xml" in content or file_path.lower().endswith(".svg")
                ext = ".svg" if is_svg else ".jpg"
                
                local_path = os.path.join(avatar_dir, f"{telegram_id}{ext}")
                web_url = f"/downloads/avatars/{telegram_id}{ext}"
                
                with open(local_path, "wb") as f:
                    f.write(content)
                    
                # Cleanup old extensions if any
                if is_svg:
                    obsolete = os.path.join(avatar_dir, f"{telegram_id}.jpg")
                    if os.path.exists(obsolete):
                        try: os.remove(obsolete)
                        except: pass
                else:
                    obsolete = os.path.join(avatar_dir, f"{telegram_id}.svg")
                    if os.path.exists(obsolete):
                        try: os.remove(obsolete)
                        except: pass
                        
            print(f"[UserStore] Cached Telegram avatar for user {telegram_id} (is_svg={is_svg})")
            return web_url
    except Exception as e:
        print(f"[UserStore Error] Failed to fetch avatar for {telegram_id}: {e}")
        
    return None

def download_avatar_from_url(url, telegram_id):
    """
    Downloads an avatar from a direct web URL and saves it to downloads/avatars/.
    Detects if the content is SVG or image and uses appropriate extension.
    Returns the local served URL path upon success, or None.
    """
    if not url or not telegram_id:
        return None
        
    avatar_dir = os.path.join(DATA_DIR, "downloads", "avatars")
    os.makedirs(avatar_dir, exist_ok=True)
    
    # Check if already cached
    for ext in [".svg", ".jpg"]:
        local_path = os.path.join(avatar_dir, f"{telegram_id}{ext}")
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            return f"/downloads/avatars/{telegram_id}{ext}"
            
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read()
            
            # Detect extension
            is_svg = b"<svg" in content or b"<?xml" in content or url.lower().endswith(".svg")
            ext = ".svg" if is_svg else ".jpg"
            
            local_path = os.path.join(avatar_dir, f"{telegram_id}{ext}")
            web_url = f"/downloads/avatars/{telegram_id}{ext}"
            
            with open(local_path, "wb") as f:
                f.write(content)
                
            # Cleanup old extensions if any
            if is_svg:
                obsolete_path = os.path.join(avatar_dir, f"{telegram_id}.jpg")
                if os.path.exists(obsolete_path):
                    try: os.remove(obsolete_path)
                    except: pass
            else:
                obsolete_path = os.path.join(avatar_dir, f"{telegram_id}.svg")
                if os.path.exists(obsolete_path):
                    try: os.remove(obsolete_path)
                    except: pass
                        
        print(f"[UserStore] Downloaded direct avatar for user {telegram_id} (is_svg={is_svg})")
        return web_url
    except Exception as e:
        print(f"[UserStore Error] Failed to download direct avatar for {telegram_id}: {e}")
    return None

def get_user_profile(user_id, name="", username="", telegram_id="", bot=None, photo_url=""):
    """
    Retrieves or creates a user profile. Automatically fetches 
    Telegram avatar if possible.
    """
    with lock:
        init_users_file()
        try:
            data = {}
            if os.path.exists(USERS_FILE):
                with open(USERS_FILE, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                    except ValueError:
                        data = {}
            
            if user_id not in data:
                data[user_id] = {
                    "user_id": user_id,
                    "name": name or "Гість",
                    "username": username or "",
                    "balance": 0,
                    "avatar_url": ""
                }
                
            profile = data[user_id]
            
            # Update name/username if provided and different
            if name and profile.get("name") != name:
                profile["name"] = name
            if username and profile.get("username") != username:
                profile["username"] = username
                
            # Fetch avatar if telegram_id is provided and avatar_url is missing or fallback logo
            if telegram_id and (not profile.get("avatar_url") or profile.get("avatar_url") == "/static/logo.svg"):
                avatar_path = None
                if photo_url:
                    avatar_path = download_avatar_from_url(photo_url, telegram_id)
                if not avatar_path and bot:
                    avatar_path = fetch_telegram_avatar(bot, telegram_id)
                if avatar_path:
                    profile["avatar_url"] = avatar_path
                    
            # Fallback avatar
            if not profile.get("avatar_url"):
                profile["avatar_url"] = "/static/logo.svg" # Fallback to logo or default
                
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
                
            return profile
        except Exception as e:
            print(f"[UserStore Error] get_user_profile error for {user_id}: {e}")
            return {
                "user_id": user_id,
                "name": name or "Гість",
                "username": username or "",
                "balance": 0,
                "avatar_url": "/static/logo.svg"
            }

def update_user_balance(user_id, amount):
    """Increments or decrements a user's credit balance."""
    with lock:
        init_users_file()
        try:
            data = {}
            if os.path.exists(USERS_FILE):
                with open(USERS_FILE, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                    except ValueError:
                        data = {}
            
            if user_id not in data:
                data[user_id] = {
                    "user_id": user_id,
                    "name": "Гість",
                    "username": "",
                    "balance": 0,
                    "avatar_url": "/static/logo.svg"
                }
                
            data[user_id]["balance"] = max(0, data[user_id].get("balance", 0) + amount)
            
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
                
            return data[user_id]["balance"]
        except Exception as e:
            print(f"[UserStore Error] update_user_balance error for {user_id}: {e}")
            return 0

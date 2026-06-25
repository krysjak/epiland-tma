#!/bin/bash
set -e

# Path to the data file inside the volume
DATA_FILE="${DATA_DIR:-/app/data}/epiland_data.json"
DOWNLOADS_DIR="${DATA_DIR:-/app/data}/downloads"

if [ ! -f "$DATA_FILE" ]; then
    echo "===================================================="
    echo "  INITIAL STARTUP: epiland_data.json NOT FOUND      "
    echo "  Running live web scraping to build the catalog... "
    echo "===================================================="
    python scraper.py --download-dir "$DOWNLOADS_DIR" --output "$DATA_FILE"
    
    echo "===================================================="
    echo "  Syncing cafe items with ChoiceQR images...        "
    echo "===================================================="
    python scratch/sync_cafe_images.py
    
    echo "===================================================="
    echo "  Scraping completed successfully!                  "
    echo "===================================================="
else
    echo "===================================================="
    echo "  Catalog file found at $DATA_FILE. Skipping scrape."
    echo "===================================================="
fi

# Execute the main container command (e.g. gunicorn)
exec "$@"

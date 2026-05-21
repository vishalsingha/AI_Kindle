# 1. First launch creates ~/.config/ai-kindle/, then quit
ai-kindle &
sleep 5
pkill -f "ai-kindle"
sleep 2

# 2. Move the empty DB out of the way (just in case)
DEST="$HOME/.config/ai-kindle"
mv "$DEST/ai-kindle.db" "$DEST/ai-kindle.db.bak" 2>/dev/null || true
rm -f "$DEST/ai-kindle.db-wal" "$DEST/ai-kindle.db-shm" 2>/dev/null

# 3. Extract your data (replace path with wherever you downloaded the tgz)
tar -xzvf ~/Downloads/ai-kindle-data.tgz -C "$DEST"

# 4. Launch — every book should be there, all annotations intact
ai-kindle
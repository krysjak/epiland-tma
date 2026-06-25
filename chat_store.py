import os
import json
import datetime
import threading

DATA_DIR = os.environ.get("DATA_DIR", ".")
CHATS_FILE = os.path.join(DATA_DIR, "chats.json")
lock = threading.Lock()

def init_chats_file():
    """Initializes the chats.json file if it doesn't exist."""
    if not os.path.exists(CHATS_FILE):
        try:
            with open(CHATS_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Error initializing chats file: {e}")

def get_chat_history(user_id):
    """Returns chat messages for a specific user ID."""
    with lock:
        init_chats_file()
        try:
            if not os.path.exists(CHATS_FILE):
                return []
            with open(CHATS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get(user_id, {}).get("messages", [])
        except Exception as e:
            print(f"Error reading chat history for {user_id}: {e}")
            return []

def save_chat_message(user_id, sender, text, name="", username=""):
    """Saves a message from a user or admin to the chat store."""
    with lock:
        init_chats_file()
        try:
            data = {}
            if os.path.exists(CHATS_FILE):
                with open(CHATS_FILE, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                    except ValueError:
                        data = {}
            
            if user_id not in data:
                data[user_id] = {
                    "user_id": user_id,
                    "name": name or "Анонімний користувач",
                    "username": username or "",
                    "updated_at": "",
                    "messages": [],
                    "needs_manager": False
                }
            
            # Update metadata if provided
            if name:
                data[user_id]["name"] = name
            if username:
                data[user_id]["username"] = username
                
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            data[user_id]["updated_at"] = timestamp
            
            message_obj = {
                "sender": sender,
                "text": text,
                "timestamp": timestamp,
                "name": name if sender == "user" else ("Система" if sender == "system" else "Адміністратор")
            }
            
            data[user_id]["messages"].append(message_obj)
            
            with open(CHATS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
                
            return True
        except Exception as e:
            print(f"Error saving chat message for {user_id}: {e}")
            return False

def get_chat_needs_manager(user_id):
    """Checks if a chat session is flagged as needing a human manager."""
    with lock:
        init_chats_file()
        try:
            if not os.path.exists(CHATS_FILE):
                return False
            with open(CHATS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get(user_id, {}).get("needs_manager", False)
        except Exception as e:
            print(f"Error getting needs_manager status for {user_id}: {e}")
            return False

def set_needs_manager(user_id, status=True):
    """Sets the needs_manager flag for a specific chat session."""
    with lock:
        init_chats_file()
        try:
            data = {}
            if os.path.exists(CHATS_FILE):
                with open(CHATS_FILE, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                    except ValueError:
                        data = {}
            if user_id in data:
                data[user_id]["needs_manager"] = status
                with open(CHATS_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=4, ensure_ascii=False)
                return True
        except Exception as e:
            print(f"Error setting needs_manager for {user_id}: {e}")
    return False

def get_active_chats_list():
    """Returns all active chats list with metadata and last message snippet."""
    with lock:
        init_chats_file()
        try:
            if not os.path.exists(CHATS_FILE):
                return []
            with open(CHATS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            chats_list = []
            for user_id, info in data.items():
                messages = info.get("messages", [])
                # Filter out system logs from being displayed as chat snippet
                display_messages = [m for m in messages if m["sender"] != "system"]
                last_msg = display_messages[-1] if display_messages else (messages[-1] if messages else None)
                chats_list.append({
                    "user_id": user_id,
                    "name": info.get("name") or "Анонімний користувач",
                    "username": info.get("username") or "",
                    "updated_at": info.get("updated_at") or "",
                    "last_message_text": last_msg["text"] if last_msg else "",
                    "last_message_sender": last_msg["sender"] if last_msg else "",
                    "needs_manager": info.get("needs_manager", False)
                })
            
            # Sort chats by updated_at descending
            chats_list.sort(key=lambda x: x["updated_at"], reverse=True)
            return chats_list
        except Exception as e:
            print(f"Error listing active chats: {e}")
            return []

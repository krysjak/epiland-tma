import os
import json
import telebot
from flask import Flask, render_template, jsonify, request, send_from_directory
from booking_store import book_items, get_booked_slots, get_all_bookings, update_booking_status
from chat_store import get_chat_history, save_chat_message, get_active_chats_list, get_chat_needs_manager, set_needs_manager
from ai_support import trigger_ai_response
from user_store import get_user_profile, update_user_balance

app = Flask(__name__, template_folder='templates', static_folder='static')

CATALOG_FILE = "epiland_data.json"

# Load Telegram Bot token and ADMIN details
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
ADMIN_TELEGRAM_IDS = os.environ.get("ADMIN_TELEGRAM_IDS", "")

if not TOKEN:
    try:
        if os.path.exists(".env"):
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        if k == "TELEGRAM_BOT_TOKEN" and not TOKEN:
                            TOKEN = v
                        elif k == "ADMIN_TELEGRAM_IDS" and not ADMIN_TELEGRAM_IDS:
                            ADMIN_TELEGRAM_IDS = v
    except Exception as e:
        print(f"Error loading .env in app.py: {e}")

try:
    bot = telebot.TeleBot(TOKEN) if TOKEN else None
except Exception as e:
    print(f"Failed to initialize telebot in app: {e}")
    bot = None

@app.route('/')
def index():
    """Serves the main Telegram Mini App HTML page."""
    return render_template('index.html')

@app.route('/downloads/<path:filename>')
def serve_downloads(filename):
    """Serves the locally downloaded media assets (images, PDFs)."""
    data_dir = os.environ.get("DATA_DIR", ".")
    return send_from_directory(os.path.join(data_dir, 'downloads'), filename)

@app.route('/api/catalog', methods=['GET'])
def get_catalog():
    """Returns the full catalog of attractions, tariffs, and products."""
    if not os.path.exists(CATALOG_FILE):
        return jsonify({"error": "Catalog database file not found"}), 404
        
    try:
        with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": f"Failed to load catalog: {str(e)}"}), 500

@app.route('/api/booked_slots', methods=['GET'])
def api_booked_slots():
    """Returns already booked items for a given location and date."""
    location = request.args.get('location')
    date_str = request.args.get('date')
    
    if not location or not date_str:
        return jsonify({"error": "Missing 'location' or 'date' parameters"}), 400
        
    slots = get_booked_slots(location, date_str)
    return jsonify(slots)

@app.route('/api/book', methods=['POST'])
def api_book():
    """
    Handles a booking request. Validates input fields and invokes 
    the booking store with conflict resolution.
    """
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "Неправильний запит"}), 400
        
    location = data.get('location')
    name = data.get('customer_name')
    lastname = data.get('customer_lastname')
    phone = data.get('customer_phone')
    telegram = data.get('customer_telegram')
    telegram_id = data.get('telegram_id', '')
    date_str = data.get('date')
    time_slot = data.get('time_slot')
    items = data.get('items')
    total_price = data.get('total_price', 0)
    
    # Extra optional fields
    birthday_name = data.get('birthday_name', '')
    birthday_age = data.get('birthday_age', '')
    kids_count = data.get('kids_count', '')
    kids_age_range = data.get('kids_age_range', '')
    comments = data.get('comments', '')
    
    # 1. Validation (required fields)
    if not all([location, name, lastname, phone, telegram, date_str, time_slot, items]):
        return jsonify({"success": False, "message": "Усі обов'язкові поля форми мають бути заповнені"}), 400
        
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"success": False, "message": "Потрібно обрати хоча б одну послугу"}), 400
        
    # 2. Card Balance Check and Deduction
    pay_from_balance = data.get('pay_from_balance', False)
    status = "Очікує дзвінка"
    
    if pay_from_balance and telegram_id:
        try:
            price_val = int(total_price)
        except ValueError:
            price_val = 0
            
        profile = get_user_profile(telegram_id, name=name, username=telegram, telegram_id=telegram_id, bot=bot)
        if profile["balance"] < price_val:
            return jsonify({"success": False, "message": f"Недостатньо коштів на балансі вашої карти. Ваш баланс: {profile['balance']} грн, потрібно: {price_val} грн."}), 400
            
        # Deduct balance
        update_user_balance(telegram_id, -price_val)
        status = "Оплачено з балансу картки"

    # 3. Call booking store
    success, message, booking_id = book_items(
        location=location,
        name=name,
        lastname=lastname,
        phone=phone,
        telegram=telegram,
        telegram_id=telegram_id,
        date_str=date_str,
        time_slot_str=time_slot,
        items_list=items,
        total_price=total_price,
        birthday_name=birthday_name,
        birthday_age=birthday_age,
        kids_count=kids_count,
        kids_age_range=kids_age_range,
        comments=comments,
        status=status
    )
    
    if success:
        # Send Telegram booking summary to client if possible
        if bot and telegram_id:
            try:
                date_formatted = date_str
                try:
                    parts = date_str.split("-")
                    if len(parts) == 3:
                        date_formatted = f"{parts[2]}.{parts[1]}.{parts[0]}"
                except Exception:
                    pass
                
                services_str = ", ".join(items)
                summary = (
                    "🔔 **Заявка на святкування прийнята!**\n\n"
                    "Дякуємо! Наш менеджер вже опрацьовує вашу заявку та зв'яжеться з вами в цьому чаті найближчим часом.\n\n"
                    "📋 **Резюме вашої заявки:**\n"
                    f"• **ID Бронювання:** `{booking_id}`\n"
                    f"• **Замовник:** {name} {lastname}\n"
                    f"• **Телефон:** {phone}\n"
                    f"• **Локація:** {location}\n"
                    f"• **Дата та час:** {date_formatted} о {time_slot}\n"
                )
                
                if birthday_name:
                    summary += f"• **Іменинник:** {birthday_name} ({birthday_age} р.)\n"
                if kids_count:
                    summary += f"• **Дітей:** {kids_count} ос. (вік: {kids_age_range or '-'})\n"
                
                summary += f"• **Обрані послуги:** {services_str}\n"
                summary += f"• **Загальна вартість:** {total_price} грн\n"
                
                if comments:
                    summary += f"• **Побажання:** {comments}\n"
                
                summary += "\nБудь ласка, залишайтеся на зв'язку! 🎪"
                
                bot.send_message(telegram_id, summary, parse_mode="Markdown")
                print(f"[Bot] Sent booking summary notification to user {telegram_id}")
            except Exception as tg_err:
                print(f"[Bot Error] Failed to send message to user {telegram_id}: {tg_err}")

        return jsonify({
            "success": True, 
            "message": message, 
            "booking_id": booking_id
        }), 200
    else:
        return jsonify({
            "success": False, 
            "message": message
        }), 400

# --- Admin Panel Endpoints ---
ADMIN_PASSCODE = os.environ.get("ADMIN_PASSCODE", "1234")

def verify_admin_request(req):
    """
    Verifies that the request has either:
    1. X-Admin-Passcode header matching ADMIN_PASSCODE
    2. X-Admin-Telegram-Id header matching an authorized admin ID
    """
    auth_pass = req.headers.get("X-Admin-Passcode")
    tg_id = req.headers.get("X-Admin-Telegram-Id")
    
    if auth_pass == ADMIN_PASSCODE:
        return True
        
    allowed_ids = [x.strip() for x in ADMIN_TELEGRAM_IDS.split(",") if x.strip()]
    if tg_id and str(tg_id) in allowed_ids:
        return True
        
    return False

@app.route('/admin')
def admin_page():
    """Serves the Admin Panel HTML page."""
    return render_template('admin.html')

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """Validates the passcode entered by the administrator."""
    data = request.get_json() or {}
    passcode = data.get("passcode")
    if passcode == ADMIN_PASSCODE:
        return jsonify({"success": True, "message": "Авторизація успішна"}), 200
    else:
        return jsonify({"success": False, "message": "Неправильний пароль"}), 401

@app.route('/api/admin/bookings', methods=['GET'])
def api_admin_bookings():
    """Returns all bookings. Requires validation header."""
    if not verify_admin_request(request):
        return jsonify({"error": "Unauthorized"}), 403
        
    bookings = get_all_bookings()
    return jsonify(bookings)

@app.route('/api/admin/update_status', methods=['POST'])
def api_admin_update_status():
    """Updates status for a specific booking. Requires validation header."""
    if not verify_admin_request(request):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json() or {}
    booking_id = data.get("booking_id")
    status = data.get("status")
    
    if not booking_id or not status:
        return jsonify({"success": False, "message": "Неповні дані для оновлення"}), 400
        
    success, message = update_booking_status(booking_id, status)
    if success:
        return jsonify({"success": True, "message": message}), 200
    else:
        return jsonify({"success": False, "message": message}), 400

# --- Support Chat Endpoints ---

@app.route('/api/chat/history', methods=['GET'])
def api_chat_history():
    """Returns chat history for a specific user ID."""
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "Missing 'user_id' parameter"}), 400
    history = get_chat_history(user_id)
    return jsonify(history)

@app.route('/api/chat/send', methods=['POST'])
def api_chat_send():
    """Saves a message from the client or admin."""
    data = request.get_json() or {}
    user_id = data.get('user_id')
    sender = data.get('sender')
    text = data.get('text')
    name = data.get('name', '')
    username = data.get('username', '')

    if not user_id or not sender or not text:
        return jsonify({"success": False, "message": "Missing required fields"}), 400

    if sender == 'admin':
        if not verify_admin_request(request):
            return jsonify({"error": "Unauthorized"}), 403
        # Disable AI auto-reply when a human manager sends a response
        set_needs_manager(user_id, True)

    success = save_chat_message(user_id, sender, text, name, username)
    if success:
        # If the user sent a message and is NOT in manager mode, trigger AI reply
        if sender == 'user' and not get_chat_needs_manager(user_id):
            trigger_ai_response(user_id)
        return jsonify({"success": True}), 200
    else:
        return jsonify({"success": False, "message": "Failed to save message"}), 500

@app.route('/api/chat/call_manager', methods=['POST'])
def api_chat_call_manager():
    """Manually switches the chat mode to human manager and alerts support."""
    data = request.get_json() or {}
    user_id = data.get('user_id')
    name = data.get('name', '')
    username = data.get('username', '')
    
    if not user_id:
        return jsonify({"success": False, "message": "Missing user_id"}), 400
        
    set_needs_manager(user_id, True)
    
    # Save system log and a polite operator transition message
    save_chat_message(user_id, "system", "🔔 Користувач покликав менеджера. Очікуйте на відповідь.", name=name, username=username)
    save_chat_message(user_id, "admin", "Я покликав менеджера. Він незабаром приєднається до чату! 👨‍💼", name="ШІ Асистент")
    
    return jsonify({"success": True}), 200

@app.route('/api/chat/admin/toggle_ai', methods=['POST'])
def api_chat_admin_toggle_ai():
    """Allows admin to toggle AI support mode back on/off for a user."""
    if not verify_admin_request(request):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json() or {}
    user_id = data.get('user_id')
    enable_ai = data.get('enable_ai') # boolean
    
    if not user_id or enable_ai is None:
        return jsonify({"success": False, "message": "Missing required fields"}), 400
        
    # If enabling AI, set needs_manager to False
    set_needs_manager(user_id, not enable_ai)
    
    status_str = "ввімкнено" if enable_ai else "вимкнено"
    save_chat_message(user_id, "system", f"🤖 Режим ШІ-асистента було {status_str} адміністратором.", name="Система")
    
    return jsonify({"success": True}), 200

@app.route('/api/chat/admin/list', methods=['GET'])
def api_chat_admin_list():
    """Returns all active chats for the admin dashboard. Requires validation header."""
    if not verify_admin_request(request):
        return jsonify({"error": "Unauthorized"}), 403
        
    chats = get_active_chats_list()
    return jsonify(chats)


# --- User Profile & Payments Simulation ---

@app.route('/api/user/profile', methods=['GET'])
def api_user_profile():
    """Fetches or registers a user profile."""
    user_id = request.args.get('user_id')
    telegram_id = request.args.get('telegram_id')
    name = request.args.get('name', '')
    username = request.args.get('username', '')
    photo_url = request.args.get('photo_url', '')
    
    if not user_id:
        return jsonify({"error": "Missing 'user_id' parameter"}), 400
        
    profile = get_user_profile(user_id, name=name, username=username, telegram_id=telegram_id, bot=bot, photo_url=photo_url)
    return jsonify(profile)

@app.route('/api/user/refill', methods=['POST'])
def api_user_refill():
    """Simulates card top-up deposit."""
    data = request.get_json() or {}
    user_id = data.get('user_id')
    amount = data.get('amount', 0)
    
    if not user_id or amount <= 0:
        return jsonify({"success": False, "message": "Invalid user_id or amount"}), 400
        
    # Simulate processing delay on client, here we just save and credit the balance
    new_balance = update_user_balance(user_id, amount)
    return jsonify({"success": True, "new_balance": new_balance}), 200

@app.route('/api/user/bookings', methods=['GET'])
def api_user_bookings():
    """Retrieves all bookings made by this user."""
    user_id = request.args.get('user_id')
    telegram_id = request.args.get('telegram_id')
    
    if not user_id and not telegram_id:
        return jsonify({"error": "Missing 'user_id' or 'telegram_id' parameter"}), 400
        
    all_bookings = get_all_bookings()
    user_bookings = []
    
    for b in all_bookings:
        # Match bookings by telegram_id or guest user_id (Col F / Col 6 in spreadsheet)
        col_tg_id = b.get("telegram_id", "")
        if (telegram_id and col_tg_id == str(telegram_id)) or (user_id and col_tg_id == str(user_id)):
            user_bookings.append(b)
            
    return jsonify(user_bookings)


if __name__ == '__main__':
    print("====================================================")
    print("EPILAND Telegram Mini App Booking server starting...")
    print("Local URL: http://127.0.0.1:5000")
    print("====================================================")
    # Enable debugging and host on all interfaces for local network access
    app.run(host='127.0.0.1', port=5000, debug=True)

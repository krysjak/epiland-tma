import os
import sys
import telebot
from telebot import types

# Load token and WebApp URL from environment or fallback
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
WEBAPP_URL = os.environ.get("WEBAPP_URL")

# Try loading from local config if environment is missing
if not TOKEN or not WEBAPP_URL:
    try:
        # Check if .env file exists
        if os.path.exists(".env"):
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        if k == "TELEGRAM_BOT_TOKEN" and not TOKEN:
                            TOKEN = v
                        elif k == "WEBAPP_URL" and not WEBAPP_URL:
                            WEBAPP_URL = v
    except Exception as e:
        print(f"[Warning] Failed to read .env file: {e}")

# Output startup instructions if variables are missing
if not TOKEN or not WEBAPP_URL:
    print("====================================================")
    print("      EPILAND TELEGRAM BOT INITIALIZATION ERROR      ")
    print("====================================================")
    print("Please set the environment variables or create a '.env' file in this directory:")
    print("Example '.env' content:")
    print("TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather")
    print("WEBAPP_URL=https://your-ngrok-subdomain.ngrok-free.app")
    print("====================================================")
    
    # Use placeholders for demonstration so the script can compile
    if not TOKEN:
        TOKEN = "PLACEHOLDER_TOKEN"
    if not WEBAPP_URL:
        WEBAPP_URL = "http://127.0.0.1:5000"

# Initialize bot
bot = telebot.TeleBot(TOKEN)

def get_webapp_keyboard():
    """Generates the inline keyboard with the WebApp button."""
    markup = types.InlineKeyboardMarkup()
    # Create the web app button
    webapp_info = types.WebAppInfo(url=WEBAPP_URL)
    btn = types.InlineKeyboardButton(text="🎪 Відкрити EPILAND App", web_app=webapp_info)
    markup.add(btn)
    return markup

def get_faq_keyboard():
    """Generates the main reply keyboard with FAQ topics."""
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    btn_prices = types.KeyboardButton("💰 Ціни та тарифи")
    btn_birthday = types.KeyboardButton("🎂 День народження")
    btn_locations = types.KeyboardButton("📍 Локації та контакти")
    btn_hours = types.KeyboardButton("🕒 Години роботи")
    btn_age = types.KeyboardButton("👶 Вікові обмеження")
    btn_manager = types.KeyboardButton("📞 Зв'язок з менеджером")
    
    markup.add(btn_prices, btn_birthday, btn_locations, btn_hours, btn_age, btn_manager)
    return markup

@bot.message_handler(commands=['start'])
def send_welcome(message):
    """Sends greeting and configures WebApp Menu Button and FAQ keyboard."""
    chat_id = message.chat.id
    
    # Try setting the bot menu button (bottom-left button in chat) dynamically
    try:
        webapp_info = types.WebAppInfo(url=WEBAPP_URL)
        menu_button = types.MenuButtonWebApp(type="web_app", text="EPILAND", web_app=webapp_info)
        bot.set_chat_menu_button(chat_id=chat_id, menu_button=menu_button)
    except Exception as e:
        print(f"[Error] Failed to set menu button: {e}")
        
    welcome_text = (
        "🎪 **Вітаємо у сімейному парку розваг EPILAND!** 🎪\n\n"
        "Цей бот допоможе вам швидко дізнатися інформацію про наші парки розваг "
        "та оформити швидке бронювання святкування Дня народження!\n\n"
        "👇 **Оберіть тему запитання в меню нижче** або натисніть кнопку **Відкрити EPILAND App**, щоб перейти до вибору послуг."
    )
    
    bot.send_message(
        chat_id, 
        welcome_text, 
        parse_mode="Markdown", 
        reply_markup=get_webapp_keyboard()
    )
    bot.send_message(
        chat_id,
        "Скористайтеся швидким меню для відповідей на часті запитання 👇",
        reply_markup=get_faq_keyboard()
    )

@bot.message_handler(commands=['admin'])
def send_admin_link(message):
    """Checks user Telegram ID and provides direct WebApp access to the Admin Panel."""
    chat_id = message.chat.id
    user_id = str(message.from_user.id)
    
    # Read allowed admin IDs
    admin_ids_str = ""
    if os.path.exists(".env"):
        try:
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        if k == "ADMIN_TELEGRAM_IDS":
                            admin_ids_str = v
                            break
        except Exception:
            pass
            
    if not admin_ids_str:
        admin_ids_str = os.environ.get("ADMIN_TELEGRAM_IDS", "")
        
    allowed_ids = [x.strip() for x in admin_ids_str.split(",") if x.strip()]
    
    # Grant access only if the user's Telegram ID is in the allowed list
    if user_id in allowed_ids:
        markup = types.InlineKeyboardMarkup()
        webapp_info = types.WebAppInfo(url=f"{WEBAPP_URL}/admin")
        btn = types.InlineKeyboardButton(text="🛠 Відкрити Адмін Панель", web_app=webapp_info)
        markup.add(btn)
        bot.send_message(
            chat_id,
            "Вітаємо в панелі керування EPILAND! 🛠\n\n"
            "Ваш Telegram ID авторизовано. Натисніть кнопку нижче, щоб відкрити панель.",
            reply_markup=markup
        )
    else:
        bot.send_message(
            chat_id,
            f"Вибачте, у вас немає доступу до адмін-панелі.\n\n"
            f"Ваш Telegram ID: `{user_id}`.\n\n"
            "Будь ласка, зверніться до розробника або додайте ваш ID до змінної `ADMIN_TELEGRAM_IDS` у файлі `.env`.",
            parse_mode="Markdown"
        )

@bot.message_handler(func=lambda message: True)
def handle_all_messages(message):
    """Answers common FAQ queries automatically or falls back to welcome message."""
    text = message.text.strip() if message.text else ""
    text_lower = text.lower()
    
    is_faq = True
    
    # 1. Check direct button matches
    if text == "💰 Ціни та тарифи":
        reply_text = (
            "💰 **Ціни на вхід в ігрову зону EPILAND (Безліміт на весь день):**\n\n"
            "• **EPILAND Чабани**:\n"
            "  - Будні: `400 грн`\n"
            "  - Вихідні/Свята: `600 грн`\n\n"
            "• **EPILAND Київ (Оболонь)**:\n"
            "  - Будні: `400 грн`\n"
            "  - Вихідні/Свята: `600 грн`\n\n"
            "• **EPILAND Обухів**:\n"
            "  - Будні: `300 грн`\n"
            "  - Вихідні/Свята: `500 грн`\n\n"
            "👶 *Діти до 1,5 року — безкоштовно!*\n"
            "💼 Детальні тарифи на няню, лазертаг та інші послуги дивіться у нашому додатку."
        )
    elif text == "🎂 День народження":
        reply_text = (
            "🎂 **Святкування Дня народження в EPILAND!** 🥳\n\n"
            "Ми допоможемо створити ідеальне свято:\n"
            "• 🎪 Яскраві тематичні кімнати для святкування\n"
            "• 🦸‍♂️ Професійні аніматори, шоу-програми та майстер-класи\n"
            "• 🍰 Неймовірні дитячі торти та декор на вибір\n\n"
            "👉 Ви можете вибрати локацію, дату, забронювати кімнату та розрахувати точну вартість свята у нашому Mini App!"
        )
    elif text == "📍 Локації та контакти":
        reply_text = (
            "📍 **Наші сімейні парки розваг EPILAND:**\n\n"
            "1️⃣ **EPILAND Чабани**\n"
            "🏡 смт Чабани, Одеське шосе, 8\n"
            "📞 +38 (067) 444-55-66\n\n"
            "2️⃣ **EPILAND Київ (Оболонь)**\n"
            "🏡 пр-т Степана Бандери, 11-А\n"
            "📞 +38 (067) 111-22-33\n\n"
            "3️⃣ **EPILAND Обухів**\n"
            "🏡 м. Обухів, вул. Київська, 119\n"
            "📞 +38 (067) 777-88-99"
        )
    elif text == "🕒 Години роботи":
        reply_text = (
            "🕒 **Режим роботи парків EPILAND:**\n\n"
            "Всі наші локації працюють для вас:\n"
            "• **Щодня з 10:00 до 21:00** без вихідних!\n\n"
            "Чекаємо на вас! 🎪"
        )
    elif text == "👶 Вікові обмеження":
        reply_text = (
            "👶 **Вікові правила у парку EPILAND:**\n\n"
            "• Наш ігровий майданчик розрахований на дітей віком **від 0 до 14 років**.\n"
            "• Діти до 6 років мають перебувати під наглядом батьків.\n"
            "• Ви також можете замовити послугу «Няня» прямо в Mini App, щоб наші кваліфіковані бебісітери погралися з малюком."
        )
    elif text == "📞 Зв'язок з менеджером":
        reply_text = (
            "📞 **Контакти наших менеджерів для зв'язку:**\n\n"
            "• **Київ (Оболонь)**: [дзвінок](tel:+380671112233) (+380671112233)\n"
            "• **Чабани**: [дзвінок](tel:+380674445566) (+380674445566)\n"
            "• **Обухів**: [дзвінок](tel:+380677778899) (+380677778899)\n\n"
            "Наші менеджери радо допоможуть вам з усіма питаннями!"
        )
    else:
        is_faq = False

    # 2. Check keyword matching if it wasn't a direct button click
    if not is_faq:
        if any(kw in text_lower for kw in ["цін", "кошт", "скільки", "тариф", "вхід"]):
            reply_text = (
                "💰 **Ціни на вхід в ігрову зону EPILAND (Безліміт на весь день):**\n\n"
                "• **EPILAND Чабани**:\n"
                "  - Будні: `400 грн`\n"
                "  - Вихідні/Свята: `600 грн`\n\n"
                "• **EPILAND Київ (Оболонь)**:\n"
                "  - Будні: `400 грн`\n"
                "  - Вихідні/Свята: `600 грн`\n\n"
                "• **EPILAND Обухів**:\n"
                "  - Будні: `300 грн`\n"
                "  - Вихідні/Свята: `500 грн`\n\n"
                "👶 *Діти до 1,5 року — безкоштовно!*\n"
                "💼 Детальні тарифи на няню, лазертаг та інші послуги дивіться у нашому додатку."
            )
            is_faq = True
        elif any(kw in text_lower for kw in ["де ", "адрес", "локац", "вул", "як доїхати", "київ", "чабани", "обухів"]):
            reply_text = (
                "📍 **Наші сімейні парки розваг EPILAND:**\n\n"
                "1️⃣ **EPILAND Чабани**\n"
                "🏡 смт Чабани, Одеське шосе, 8\n"
                "📞 +38 (067) 444-55-66\n\n"
                "2️⃣ **EPILAND Київ (Оболонь)**\n"
                "🏡 пр-т Степана Бандери, 11-А\n"
                "📞 +38 (067) 111-22-33\n\n"
                "3️⃣ **EPILAND Обухів**\n"
                "🏡 м. Обухів, вул. Київська, 119\n"
                "📞 +38 (067) 777-88-99"
            )
            is_faq = True
        elif any(kw in text_lower for kw in ["годин", "режим", "час", "відкрит", "закрит", "робот"]):
            reply_text = (
                "🕒 **Режим роботи парків EPILAND:**\n\n"
                "Всі наші локації працюють для вас:\n"
                "• **Щодня з 10:00 до 21:00** без вихідних!\n\n"
                "Чекаємо на вас! 🎪"
            )
            is_faq = True
        elif any(kw in text_lower for kw in ["народж", "свято", "анім", "кімнат", "шоу", "декор"]):
            reply_text = (
                "🎂 **Святкування Дня народження в EPILAND!** 🥳\n\n"
                "Ми допоможемо створити ідеальне свято:\n"
                "• 🎪 Яскраві тематичні кімнати для святкування\n"
                "• 🦸‍♂️ Професійні аніматори, шоу-програми та майстер-класи\n"
                "• 🍰 Неймовірні дитячі торти та декор на вибір\n\n"
                "👉 Ви можете вибрати локацію, дату, забронювати кімнату та розрахувати точну вартість свята у нашому Mini App!"
            )
            is_faq = True
        elif any(kw in text_lower for kw in ["вік", "діт", "років"]):
            reply_text = (
                "👶 **Вікові правила у парку EPILAND:**\n\n"
                "• Наш ігровий майданчик розрахований на дітей віком **від 0 до 14 років**.\n"
                "• Діти до 6 років мають перебувати под наглядом батьків.\n"
                "• Ви також можете замовити послугу «Няня» прямо в Mini App, щоб наші кваліфіковані бебісітери погралися з малюком."
            )
            is_faq = True
        elif any(kw in text_lower for kw in ["адмін", "дзвін", "телефо", "менеджер", "номер"]):
            reply_text = (
                "📞 **Контакти наших менеджерів для зв'язку:**\n\n"
                "• **Київ (Оболонь)**: [дзвінок](tel:+380671112233) (+380671112233)\n"
                "• **Чабани**: [дзвінок](tel:+380674445566) (+380674445566)\n"
                "• **Обухів**: [дзвінок](tel:+380677778899) (+380677778899)\n\n"
                "Наші менеджери радо допоможуть вам з усіма питаннями!"
            )
            is_faq = True

    # 3. Fallback if no keywords match
    if not is_faq:
        reply_text = (
            "🤖 **Я віртуальний помічник EPILAND!**\n\n"
            "Тут ви можете отримати швидкі відповіді на часті запитання.\n"
            "Будь ласка, оберіть тему в меню нижче або відкрийте додаток для вибору послуг та бронювання!"
        )

    bot.send_message(
        message.chat.id, 
        reply_text, 
        parse_mode="Markdown", 
        reply_markup=get_webapp_keyboard()
    )

if __name__ == '__main__':
    print("====================================================")
    print("EPILAND Telegram Bot starting...")
    print(f"Target WebApp URL: {WEBAPP_URL}")
    print("Status: Active. Press Ctrl+C to terminate.")
    print("====================================================")
    try:
        bot.infinity_polling()
    except Exception as e:
        print(f"Error during polling: {e}")
        sys.exit(1)

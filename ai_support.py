import os
import json
import urllib.request
import urllib.error
import threading
from chat_store import save_chat_message, set_needs_manager, get_chat_history

CATALOG_FILE = "epiland_data.json"
API_URL = "https://api.openai.com/v1/chat/completions"

def load_api_key():
    """Loads OpenAI API key from .env file or environment."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        try:
            if os.path.exists(".env"):
                with open(".env", "r", encoding="utf-8") as f:
                    for line in f:
                        if "=" in line:
                            k, v = line.strip().split("=", 1)
                            if k == "OPENAI_API_KEY":
                                return v.strip()
        except Exception as e:
            print(f"Error reading API key from .env: {e}")
    return key

def generate_catalog_summary():
    """Generates a concise summary of the Epiland catalog from epiland_data.json."""
    if not os.path.exists(CATALOG_FILE):
        return "Інформація про товари та ціни тимчасово недоступна."
        
    try:
        with open(CATALOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        summary_parts = []
        locations = data.get("locations", {})
        
        for loc_id, loc_info in locations.items():
            loc_name = loc_info.get("name", loc_id.upper())
            summary_parts.append(f"=== Локація: {loc_name} ===")
            summary_parts.append(f"Сайт: {loc_info.get('url', '')}")
            if loc_info.get('restaurant_menu_url'):
                summary_parts.append(f"Меню ресторану: {loc_info.get('restaurant_menu_url')}")
            
            # Attractions
            summary_parts.append("\nАтракціони та розваги:")
            for attr in loc_info.get("attractions", []):
                title = attr.get("title", "")
                desc = attr.get("description", "")
                p_wd = attr.get("price_weekdays", "не вказано")
                p_we = attr.get("price_weekends", "не вказано")
                dur = attr.get("duration")
                dur_str = f" ({dur})" if dur else ""
                restr = attr.get("restrictions")
                restr_str = f" Обмеження: {restr}." if restr else ""
                
                summary_parts.append(f"- {title}{dur_str}. Будні: {p_wd}, Вихідні: {p_we}.{restr_str} Опис: {desc}")
                
            # Nanny
            nanny = loc_info.get("nanny")
            if nanny:
                summary_parts.append(f"\nПослуга Няня (Nanny): {nanny}")
                
            # Lazertag/Paintball
            lazertag = loc_info.get("lazertag_paintball")
            if lazertag:
                summary_parts.append(f"\nЛазертаг та Пейнтбол: {lazertag}")
                
            # Birthday Rooms
            rooms = loc_info.get("birthday_rooms", [])
            if rooms:
                summary_parts.append("\nКімнати для Днів Народження:")
                for r in rooms:
                    summary_parts.append(f"- {r.get('title', '')}: {r.get('price', '')}. {r.get('description', '')}")
                    
            # Animators
            animators = loc_info.get("birthday_animators", [])
            if animators:
                summary_parts.append("\nАніматори:")
                for a in animators:
                    summary_parts.append(f"- {a.get('title', '')}: будні {a.get('price_weekdays', '')}, вихідні {a.get('price_weekends', '')}.")
                    
            # Shows
            shows = loc_info.get("birthday_shows", [])
            if shows:
                summary_parts.append("\nШоу-програми:")
                for s in shows:
                    summary_parts.append(f"- {s.get('title', '')}: {s.get('price', '')}.")
                    
            # Cakes
            cakes = loc_info.get("birthday_cakes", [])
            if cakes:
                summary_parts.append("\nСвяткові торти:")
                for c in cakes:
                    summary_parts.append(f"- {c.get('title', '')}: {c.get('price', '')}.")
                    
            # Cafe Menu
            cafe = loc_info.get("cafe_menu", [])
            if cafe:
                summary_parts.append("\nКафе та напої (меню):")
                for item in cafe:
                    summary_parts.append(f"- {item.get('title', '')}: {item.get('price', '')} грн.")
            
            summary_parts.append("\n" + "="*30 + "\n")
            
        return "\n".join(summary_parts)
    except Exception as e:
        print(f"Error generating catalog summary: {e}")
        return "Помилка при завантаженні інформації про послуги."

def build_system_prompt():
    """Builds the comprehensive system prompt for the OpenAI assistant."""
    catalog_summary = generate_catalog_summary()
    
    prompt = (
        "Ти — офіційний ШІ-асистент підтримки дитячого розважального центру EPILAND (Епіленд).\n"
        "Твоє завдання — допомагати гостям розібратися з послугами, цінами, локаціями та святкуванням днів народжень.\n\n"
        "ОБОВ'ЯЗКОВІ ПРАВИЛА СПІЛКУВАННЯ:\n"
        "1. Відповідай виключно українською мовою. Спілкуйся ввічливо, приязно, використовуй відповідні смайлики (🎪, 🎢, 🍿, 🎂, 🎈, 🧸).\n"
        "2. Відповідай ТІЛЬКИ на запитання про EPILAND (ціни атракціонів, квитки, розваги, організацію свят, меню ресторанів, графік роботи тощо).\n"
        "3. Якщо користувач запитує щось стороннє (наприклад, написати програмний код, розповісти про інші бренди, вирішити домашнє завдання тощо), ти обов'язково маєш ввічливо відмовити: 'Вибачте, але я можу відповідати лише на запитання, пов'язані з розважальним центром EPILAND.'\n"
        "4. Якщо клієнт просить покликати людину, оператора, менеджера, адміністратора, або якщо питання надто специфічне і ти не можеш дати точну відповідь, або якщо гість виражає незадоволення — ти повинен ввічливо повідомити, що переключаєш чат на людину, і ОБОВ'ЯЗКОВО додати маркер '[CALL_MANAGER]' в самому кінці своєї відповіді (наприклад: 'Добре, я викликаю нашого адміністратора. Будь ласка, зачекайте хвилинку! 👨‍💼 [CALL_MANAGER]').\n"
        "5. Завжди використовуй актуальні ціни та умови з наданого каталогу EPILAND нижче.\n\n"
        f"АКТУАЛЬНА ІНФОРМАЦІЯ ПРО EPILAND:\n{catalog_summary}"
    )
    return prompt

def call_openai_api(messages):
    """Sends a request to OpenAI API using standard library urllib."""
    api_key = load_api_key()
    if not api_key:
        print("Error: OpenAI API key is missing.")
        return None
        
    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 800
    }
    
    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            return res_json["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        print(f"OpenAI API HTTPError: {e.code} - {error_msg}")
    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
    return None

def process_ai_response_async(user_id):
    """Asynchronously calls OpenAI and saves the response."""
    history = get_chat_history(user_id)
    if not history:
        return
        
    # Format messages for OpenAI
    system_prompt = build_system_prompt()
    openai_messages = [{"role": "system", "content": system_prompt}]
    
    # We take the last 10 messages for conversation context
    for msg in history[-10:]:
        role = "user" if msg["sender"] == "user" else "assistant"
        openai_messages.append({"role": role, "content": msg["text"]})
        
    reply_text = call_openai_api(openai_messages)
    
    if not reply_text:
        # Fallback to summon manager if API call fails
        reply_text = "Вибачте, сталася тимчасова помилка зв'язку. Я викликаю менеджера для допомоги! 📞 [CALL_MANAGER]"
        
    # Check if AI decided to summon manager
    is_calling_manager = False
    if "[CALL_MANAGER]" in reply_text:
        is_calling_manager = True
        reply_text = reply_text.replace("[CALL_MANAGER]", "").strip()
        
    # Save the AI reply
    save_chat_message(user_id, "admin", reply_text, name="ШІ Асистент")
    
    if is_calling_manager:
        set_needs_manager(user_id, True)
        # Add system message that manager was called
        save_chat_message(user_id, "system", "🔔 Менеджера викликано. Очікуйте на відповідь.", name="Система")

def trigger_ai_response(user_id):
    """Launches a background thread to get the AI response."""
    t = threading.Thread(target=process_ai_response_async, args=(user_id,))
    t.daemon = True
    t.start()

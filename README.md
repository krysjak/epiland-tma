# EPILAND — Telegram Mini App для парку розваг

Комплексне рішення для сімейного парку розваг **EPILAND** (3 локації: Київ-Оболонь, Чабани, Обухів): Telegram-бот з FAQ + **Telegram Mini App** для бронювання святкувань (Дні народження, корпоративи) + адмінпанель керування заявками + чат підтримки з AI-асистентом.

Повністю україномовний продукт для реального бізнесу.

---

## ✨ Можливості

### 📱 Telegram Mini App (WebApp)
- **Каталог атракціонів, тарифів і послуг** — дані збираються з офіційних сайтів парків scraper'ом (prices, attractions, nanny, laser tag, restaurant menu, дитячі свята).
- **Бронювання святкування** — покрокова форма: вибір локації → дати → часового слоту → послуг → розрахунок вартості в реальному часі.
- **Перевірка конфліктів** — слоти, вже зайняті на обрану дату/локацію, блокуються автоматично (запит `/api/booked_slots`).
- **Профіль користувача** — реєстрація за Telegram initData, кешування аватарки (з `getUserProfilePhotos` або `photo_url`), **баланс картки** (симуляція поповнення + оплата бронювання з балансу).
- **Історія бронювань** користувача.

### 🤖 Telegram-бот
- Команда `/start` — вітання + WebApp-кнопка + кнопка меню (Menu Button WebApp).
- **Швидке меню FAQ** (ReplyKeyboard): ціни та тарифи, Дні народження, локації та контакти, години роботи, вікові обмеження, зв'язок з менеджером.
- Команда `/admin` — авторизація за `ADMIN_TELEGRAM_IDS`, видає WebApp-кнопку до адмінпанелі.

### 🛠 Адмінпанель
- **Список усіх заявок** на бронювання (фільтри за статусом/локацією).
- **Зміна статусу** заявки (`Очікує дзвінка` → `Підтверджено` / `Відхилено` / `Оплачено з балансу картки` тощо).
- Автоматичне сповіщення клієнту в Telegram при створенні заявки.
- Авторизація: passcode `X-Admin-Passcode` **або** Telegram ID через `X-Admin-Telegram-Id`.

### 💬 Чат підтримки з AI
- Клієнт пише в чат → **OpenAI-асистент** відповідає на основі каталогу EPILAND (ціни, послуги, локації — контекст генерується з `epiland_data.json`).
- Клієнт може **покликати менеджера** — чат перемикається в режим очікування людини, AI відключається.
- Адмін бачить **список активних чатів** і може відповідати клієнтам напряму з панелі, перемикати AI-режим назад.

---

## 🏗️ Архітектура

```
pipiland/
├── app.py               # Flask-сервер: WebApp, API, адмінпанель, чат, профілі
├── bot.py               # Telegram-бот: /start, /admin, FAQ-меню, WebApp-кнопка
├── scraper.py           # Збір даних з сайтів EPILAND → epiland_data.json
├── ai_support.py        # OpenAI-асистент підтримки (контекст із каталогу)
├── booking_store.py     # Зберігання бронювань у Excel (openpyxl), конфлікт-чек
├── chat_store.py        # Історія чатів (chats.json, needs_manager flag)
├── user_store.py        # Профілі + баланс (users.json), кеш аватарок
├── templates/
│   ├── index.html       # Mini App UI
│   └── admin.html       # Адмінпанель
├── static/
│   ├── css/, js/        # app.js, admin.js
│   ├── epiland-tma-main/# Фронтенд (Vue 3 + Vite, вихідний код)
│   └── logo.svg, icons.svg, favicon.svg
├── docker-compose.yml   # app + ngrok сервіси
├── Dockerfile
├── requirements.txt
└── .env.example
```

### Потік даних
```
Telegram клієнт
   │
   ├─ /start ──▶ Бот (FAQ menu + WebApp button)
   │
   └─ Відкрити EPILAND App ──▶ WebApp (Flask)
                                   │
       ┌───────────────────────────┼──────────────────────────┐
       ▼                           ▼                          ▼
   /api/catalog              /api/book                  /api/chat/send
   (epiland_data.json)       (booking_store.xlsx)       (AI / менеджер)
       │                           │                          │
       ▼                           ▼                          ▼
   Вибір послуг            Конфлікт-чек + Excel      OpenAI + chats.json
                            + сповіщення клієнту       + needs_manager
                            через бота

Адмін (/admin) ──▶ /api/admin/* (bookings, update_status)
                    /api/chat/admin/* (list, toggle_ai)
```

---

## 🚀 Запуск

### Локально

```bash
pip install -r requirements.txt
cp .env.example .env   # заповнити реальними значеннями
python bot.py &        # Telegram-бот
python app.py          # Flask WebApp на http://127.0.0.1:5000
```

Для публічного доступу Telegram WebApp потребує HTTPS — використовується **ngrok** (static domain).

### Docker

```bash
docker compose up --build
```

`docker-compose.yml` піднімає два сервіси:
- **app** — Flask + бот (gunicorn).
- **ngrok** — тунель до статичного домену (`WEBAPP_URL`).

---

## ⚙️ Конфігурація

Усі секрети — у `.env` (див. `.env.example`):

| Змінна | Призначення |
|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | Токен бота від @BotFather |
| `WEBAPP_URL` | Публічний HTTPS URL WebApp (ngrok static domain) |
| `ADMIN_TELEGRAM_IDS` | Telegram ID адміністраторів (через кому) |
| `OPENAI_API_KEY` | Ключ OpenAI для AI-асистента підтримки |
| `NGROK_AUTHTOKEN` | Токен ngrok для статичного домену |

---

## 🛡 Безпека

- `.env`, `users.json`, `chats.json`, `bookings.xlsx`, `epiland_data.json`, `downloads/` — у `.gitignore`, у репозитарій не потрапляють.
- Адмін-ендпоінти захищені перевіркою `verify_admin_request` (passcode або Telegram ID у заголовку).
- Аватарки клієнтів кешуються локально, доступні через `/downloads/avatars/`.

---

*Клієнтський проєкт для парку розваг EPILAND. Flask + Telegram WebApp + OpenAI + Vue 3 фронтенд.*

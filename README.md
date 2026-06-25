# EPILAND — Telegram Mini App for Family Amusement Parks

A comprehensive solution for the **EPILAND** chain of family amusement parks (3 locations: Kyiv-Obolon, Chabany, Obukhiv): Telegram bot with FAQ + **Telegram Mini App** for booking celebrations (birthdays, corporate parties) + admin panel for managing requests + AI-powered support chat.

Fully Ukrainian-language product built for a real business.

---

## ✨ Features

### 📱 Telegram Mini App (WebApp)
- **Attraction & pricing catalog** — data scraped from the official park websites (prices, attractions, nanny service, laser tag, restaurant menu, kids' parties).
- **Party booking** — step-by-step form: choose location → date → time slot → services → real-time price calculation.
- **Slot conflict detection** — slots already occupied on the selected date/location are automatically blocked (`/api/booked_slots`).
- **User profile** — registration via Telegram `initData`, avatar caching (from `getUserProfilePhotos` or `photo_url`), **card balance** (top-up simulation + pay-for-booking from balance).
- **Booking history** per user.

### 🤖 Telegram Bot
- `/start` — greeting + WebApp button + Menu Button (Menu Button WebApp).
- **Quick FAQ menu** (ReplyKeyboard): prices & tariffs, birthdays, locations & contacts, working hours, age restrictions, contact manager.
- `/admin` — authorization by `ADMIN_TELEGRAM_IDS`, issues a WebApp button to the admin panel.

### 🛠 Admin Panel
- **Full booking list** with status/location filters.
- **Status management** (`Waiting for call` → `Confirmed` / `Rejected` / `Paid from card balance` etc.).
- Automatic Telegram notification to the client when a booking is created.
- Auth: passcode via `X-Admin-Passcode` **or** Telegram ID via `X-Admin-Telegram-Id`.

### 💬 AI Support Chat
- Client writes in chat → **OpenAI assistant** responds based on the EPILAND catalog (prices, services, locations — context generated from `epiland_data.json`).
- Client can **call a manager** — chat switches to waiting-for-human mode, AI is disabled.
- Admin sees the **list of active chats** and can reply to clients directly from the panel, or switch AI mode back on.

---

## 🏗️ Architecture

```
pipiland/
├── app.py               # Flask server: WebApp, API, admin panel, chat, profiles
├── bot.py               # Telegram bot: /start, /admin, FAQ menu, WebApp button
├── scraper.py           # Scrapes EPILAND websites → epiland_data.json
├── ai_support.py        # OpenAI support assistant (context from catalog)
├── booking_store.py     # Booking storage in Excel (openpyxl), conflict check
├── chat_store.py        # Chat history (chats.json, needs_manager flag)
├── user_store.py        # Profiles + balance (users.json), avatar caching
├── templates/
│   ├── index.html       # Mini App UI
│   └── admin.html       # Admin panel
├── static/
│   ├── css/, js/        # app.js, admin.js
│   ├── epiland-tma-main/# Frontend (Vue 3 + Vite, source code)
│   └── logo.svg, icons.svg, favicon.svg
├── docker-compose.yml   # app + ngrok services
├── Dockerfile
├── requirements.txt
└── .env.example
```

### Data flow
```
Telegram client
   │
   ├─ /start ──▶ Bot (FAQ menu + WebApp button)
   │
   └─ Open EPILAND App ──▶ WebApp (Flask)
                                  │
      ┌───────────────────────────┼──────────────────────────┐
      ▼                           ▼                          ▼
  /api/catalog              /api/book                  /api/chat/send
  (epiland_data.json)       (booking_store.xlsx)       (AI / manager)
      │                           │                          │
      ▼                           ▼                          ▼
  Service selection         Conflict check + Excel     OpenAI + chats.json
                            + client notification       + needs_manager
                            via bot

Admin (/admin) ──▶ /api/admin/* (bookings, update_status)
                   /api/chat/admin/* (list, toggle_ai)
```

---

## 🚀 Setup

### Local

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in real values
python bot.py &        # Telegram bot
python app.py          # Flask WebApp at http://127.0.0.1:5000
```

Telegram WebApp requires HTTPS for public access — **ngrok** (static domain) is used.

### Docker

```bash
docker compose up --build
```

`docker-compose.yml` spins up three services:
- **web** — Flask server (gunicorn).
- **bot** — Telegram bot.
- **ngrok** — tunnel to static domain (`WEBAPP_URL`).

---

## ⚙️ Configuration

All secrets live in `.env` (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `WEBAPP_URL` | Public HTTPS URL for WebApp (ngrok static domain) |
| `ADMIN_TELEGRAM_IDS` | Comma-separated admin Telegram IDs |
| `ADMIN_PASSCODE` | Admin panel passcode (sent as `X-Admin-Passcode` header) |
| `OPENAI_API_KEY` | OpenAI key for the AI support assistant |
| `NGROK_AUTHTOKEN` | Ngrok authtoken for static domain |
| `NGROK_DOMAIN` | Ngrok static domain name |

---

## 🛡 Security

- `.env`, `users.json`, `chats.json`, `bookings.xlsx`, `epiland_data.json`, `downloads/` — all in `.gitignore`, never committed.
- Admin endpoints protected by `verify_admin_request` (passcode or Telegram ID in header).
- Client avatars cached locally, served via `/downloads/avatars/`.

---

*Client project for EPILAND amusement park. Flask + Telegram WebApp + OpenAI + Vue 3 frontend.*

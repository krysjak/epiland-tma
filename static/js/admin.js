/**
 * EPILAND Admin Panel Client Logic
 * Handles administrator authentication, sessionStorage persistence, 
 * live loading of bookings, search/filter, and status toggles with the API.
 */

let storedPasscode = sessionStorage.getItem("admin_passcode") || localStorage.getItem("admin_passcode");
let bookingsData = [];

// Support Chat state and polling variables
let adminChatListPollInterval = null;
let adminChatMsgPollInterval = null;
let activeSupportChatUserId = null;
let activeSupportChatName = "";
let activeSupportChatUsername = "";
let activeSupportChatNeedsManager = false;
let allActiveChats = [];

// On DOM load
document.addEventListener("DOMContentLoaded", () => {
    // Check if passcode is already stored
    if (storedPasscode) {
        verifyAndLoad(storedPasscode);
    } else {
        showAuth();
    }

    // Attach filter listeners
    document.getElementById("search-input")?.addEventListener("input", renderTable);
    document.getElementById("filter-location")?.addEventListener("change", renderTable);
    document.getElementById("filter-status")?.addEventListener("change", renderTable);

    // Enter key listener on passcode input
    document.getElementById("admin-passcode")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            attemptLogin();
        }
    });

    // Hide splash loader after minimum duration
    setTimeout(hideSplashLoader, 1500);
});

/**
 * Gracefully hides the splash screen.
 */
function hideSplashLoader() {
    const loader = document.getElementById("splash-loader");
    if (loader) {
        loader.classList.add("fade-out");
        setTimeout(() => {
            loader.style.display = "none";
        }, 800); // Must match CSS transition duration
    }
}

/**
 * Resolves the display identifier of the current administrator.
 */
function getAdminIdentifier() {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const user = window.Telegram.WebApp.initDataUnsafe.user;
        if (user.username) {
            return `@${user.username}`;
        }
        const name = `${user.first_name} ${user.last_name || ""}`.trim();
        return name || `ID: ${user.id}`;
    }
    return "Адмін (Веб)";
}

/**
 * Returns a formatted timestamp: DD.MM.YYYY HH:MM
 */
function getFormattedTimestamp() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Shows the login screen and hides the dashboard.
 */
function showAuth() {
    document.getElementById("auth-section").style.display = "flex";
    document.getElementById("dashboard-section").style.display = "none";
}

/**
 * Hides the login screen and shows the dashboard.
 */
function showDashboard() {
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("dashboard-section").style.display = "flex";
}

/**
 * Attempts to log in with the passcode input.
 */
function attemptLogin() {
    const passcodeEl = document.getElementById("admin-passcode");
    const loginCard = document.getElementById("login-card");
    const passcode = passcodeEl?.value.trim();

    if (!passcode) return;

    fetch("/api/admin/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ passcode: passcode })
    })
    .then(res => {
        if (res.status === 200) {
            // Store passcode in sessionStorage
            sessionStorage.setItem("admin_passcode", passcode);
            storedPasscode = passcode;
            showDashboard();
            loadBookings();
            startAdminChatListPolling();
        } else {
            // Shake animation for error feedback
            loginCard.classList.add("shake");
            passcodeEl.style.borderColor = "var(--color-error)";
            
            setTimeout(() => {
                loginCard.classList.remove("shake");
            }, 300);
        }
    })
    .catch(err => {
        console.error("Login request error:", err);
        alert("Помилка зв'язку з сервером.");
    });
}

/**
 * Verifies stored passcode and loads bookings if valid.
 */
function verifyAndLoad(passcode) {
    fetch("/api/admin/bookings", {
        method: "GET",
        headers: {
            "X-Admin-Passcode": passcode
        }
    })
    .then(res => {
        if (res.status === 200) {
            showDashboard();
            startAdminChatListPolling();
            return res.json();
        } else {
            // Invalid stored credentials
            sessionStorage.removeItem("admin_passcode");
            localStorage.removeItem("admin_passcode");
            storedPasscode = null;
            showAuth();
            throw new Error("Expired credentials");
        }
    })
    .then(data => {
        if (data) {
            bookingsData = data;
            renderTable();
        }
    })
    .catch(err => {
        console.warn("Auto verification skipped:", err.message);
    });
}

/**
 * Fetches all bookings list from the server.
 */
function loadBookings() {
    const tbody = document.getElementById("bookings-tbody");
    if (tbody && bookingsData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-table">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: var(--accent-violet);"></i>
                    <p style="margin-top: 10px;">Завантаження списку бронювань...</p>
                </td>
            </tr>
        `;
    }

    fetch("/api/admin/bookings", {
        method: "GET",
        headers: {
            "X-Admin-Passcode": storedPasscode
        }
    })
    .then(res => {
        if (res.status === 403) {
            logout();
            return;
        }
        return res.json();
    })
    .then(data => {
        if (data) {
            bookingsData = data;
            renderTable();
        }
    })
    .catch(err => {
        console.error("Bookings load error:", err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-table" style="color: var(--color-error);">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <p style="margin-top: 10px;">Не вдалося завантажити дані з Excel.</p>
                    </td>
                </tr>
            `;
        }
    });
}

/**
 * Logs out of the admin panel.
 */
function logout() {
    sessionStorage.removeItem("admin_passcode");
    localStorage.removeItem("admin_passcode");
    storedPasscode = null;
    bookingsData = [];
    stopAdminChatListPolling();
    activeSupportChatUserId = null;
    
    const passcodeEl = document.getElementById("admin-passcode");
    if (passcodeEl) passcodeEl.value = "";
    
    showAuth();
}

/**
 * Renders the table grid with live search & column-based filters.
 */
function renderTable() {
    const tbody = document.getElementById("bookings-tbody");
    if (!tbody) return;

    const query = document.getElementById("search-input")?.value.toLowerCase().trim() || "";
    const locFilter = document.getElementById("filter-location")?.value || "all";
    const statusFilter = document.getElementById("filter-status")?.value || "all";

    // Filter items
    const filtered = bookingsData.filter(b => {
        // Location filter
        if (locFilter !== "all" && b.location !== locFilter) {
            return false;
        }

        // Status filter
        if (statusFilter !== "all") {
            if (statusFilter === "Подзвонили / Опрацьовано") {
                if (!b.status || !b.status.startsWith("Подзвонили / Опрацьовано")) {
                    return false;
                }
            } else {
                if (b.status !== statusFilter) {
                    return false;
                }
            }
        }

        // Search text query
        if (query) {
            const matchId = b.booking_id.toLowerCase().includes(query);
            const matchName = b.customer_name.toLowerCase().includes(query);
            const matchPhone = b.phone.toLowerCase().includes(query);
            const matchTg = b.telegram.toLowerCase().includes(query);
            const matchItems = b.items.some(item => item.toLowerCase().includes(query));
            const matchBirthday = b.birthday_name.toLowerCase().includes(query);
            
            return matchId || matchName || matchPhone || matchTg || matchItems || matchBirthday;
        }

        return true;
    });

    // Calculate statistics summary dynamically based on filtered records
    let totalRevenue = 0;
    let pendingCount = 0;
    
    filtered.forEach(b => {
        // Parse numeric value from total_price (e.g. "500 грн" -> 500)
        const match = String(b.total_price || "").match(/\d+/);
        const val = match ? parseInt(match[0], 10) : 0;
        totalRevenue += val;
        
        if (b.status === "Очікує дзвінка") {
            pendingCount++;
        }
    });

    // Update stats widget numbers in DOM
    const elPrice = document.getElementById("stats-total-price");
    const elCount = document.getElementById("stats-total-count");
    const elPending = document.getElementById("stats-pending-count");
    
    if (elPrice) elPrice.textContent = `${totalRevenue} грн`;
    if (elCount) elCount.textContent = filtered.length;
    if (elPending) elPending.textContent = pendingCount;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-table">
                    <div class="empty-table-content">
                        <div class="empty-table-icon">
                            <i class="fa-solid fa-calendar-xmark"></i>
                        </div>
                        <div class="empty-table-title">База даних порожня</div>
                        <p>Не знайдено жодного замовлення за вказаними фільтрами або пошуковим запитом.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = "";

    filtered.forEach(b => {
        const tr = document.createElement("tr");
        
        // Format date registered: YYYY-MM-DD HH:MM:SS to DD.MM.YYYY HH:MM:SS
        let regDate = b.timestamp;
        if (regDate && regDate.includes("-")) {
            const pts = regDate.split(" ");
            const dPart = pts[0].split("-");
            if (dPart.length === 3) {
                regDate = `${dPart[2]}.${dPart[1]}.${dPart[0]}` + (pts[1] ? ` ${pts[1]}` : "");
            }
        }

        // Format booking date: YYYY-MM-DD to DD.MM.YYYY
        let bookDateFormatted = b.date;
        if (b.date && b.date.includes("-")) {
            const dPart = b.date.split("-");
            if (dPart.length === 3) {
                bookDateFormatted = `${dPart[2]}.${dPart[1]}.${dPart[0]}`;
            }
        }

        // Build items tags list
        const itemsListHTML = b.items.map(item => `<li>${item}</li>`).join("");

        // Build telegram profile link
        let tgLinkHTML = "";
        if (b.telegram) {
            if (b.telegram.startsWith("@id")) {
                tgLinkHTML = `<span class="client-tg"><i class="fa-brands fa-telegram"></i> ${b.telegram}</span>`;
            } else {
                const cleanTg = b.telegram.replace("@", "");
                tgLinkHTML = `<a href="https://t.me/${cleanTg}" target="_blank" class="client-tg"><i class="fa-brands fa-telegram"></i> ${b.telegram}</a>`;
            }
        }

        // Additional Holiday/Birthday fields block
        let extraInfoHTML = "";
        if (b.birthday_name || b.birthday_age || b.kids_count || b.kids_age_range || b.comments) {
            extraInfoHTML = `
                <div style="font-size: 11px; color: var(--color-text-muted); background: rgba(0,0,0,0.02); border: 1px dashed var(--border-color); padding: 6px 10px; border-radius: 8px; margin-top: 6px; display:flex; flex-direction:column; gap:3px;">
                    ${b.birthday_name ? `<div>🎂 <strong>Іменинник:</strong> ${b.birthday_name} (${b.birthday_age} р.)</div>` : ''}
                    ${b.kids_count ? `<div>👶 <strong>Дітей:</strong> ${b.kids_count} ос. (вік: ${b.kids_age_range || '-'})</div>` : ''}
                    ${b.comments ? `<div style="white-space: pre-wrap;">💬 <strong>Коментар:</strong> ${b.comments}</div>` : ''}
                </div>
            `;
        }

        const isChecked = b.status && b.status.startsWith("Подзвонили / Опрацьовано");

        tr.innerHTML = `
            <td><span class="booking-id-badge">${b.booking_id}</span></td>
            <td style="color: var(--color-text-muted); font-size:12px;">${regDate}</td>
            <td><span class="loc-badge ${b.location}">${b.location_display}</span></td>
            <td>
                <div class="client-info-block">
                    <span class="client-name">${b.customer_name}</span>
                    <a href="tel:${b.phone}" class="client-phone"><i class="fa-solid fa-phone"></i> ${b.phone}</a>
                    ${tgLinkHTML}
                </div>
            </td>
            <td>
                <div class="datetime-block">
                    <span class="date-val">${bookDateFormatted}</span>
                    <span class="time-val"><i class="fa-regular fa-clock"></i> ${b.time_slot}</span>
                </div>
            </td>
            <td>
                <ul class="items-list">
                    ${itemsListHTML}
                </ul>
                ${extraInfoHTML}
            </td>
            <td style="font-weight: 700; color: var(--primary-color);">${b.total_price}</td>
            <td>
                <div class="status-cell">
                    <label class="toggler-wrapper">
                        <input type="checkbox" id="chk-${b.booking_id}" ${isChecked ? 'checked' : ''}>
                        <span class="toggler-slider"></span>
                    </label>
                    <span class="status-text ${isChecked ? 'called' : 'pending'}" id="lbl-${b.booking_id}">${b.status}</span>
                </div>
            </td>
        `;

        // Attach listener to status toggle checkbox
        tr.querySelector(`input[type="checkbox"]`).addEventListener("change", (e) => {
            toggleBookingCalledStatus(b.booking_id, e.target.checked);
        });

        tbody.appendChild(tr);
    });
}

/**
 * Submits status update to Flask API and refreshes UI.
 */
function toggleBookingCalledStatus(bookingId, isChecked) {
    const booking = bookingsData.find(b => b.booking_id === bookingId);
    const previousStatus = booking ? booking.status : (isChecked ? "Очікує дзвінка" : "Подзвонили / Опрацьовано");

    const newStatus = isChecked 
        ? `Подзвонили / Опрацьовано (${getAdminIdentifier()}, ${getFormattedTimestamp()})` 
        : "Очікує дзвінка";
    
    // Optimistic UI updates
    const textLabel = document.getElementById(`lbl-${bookingId}`);
    if (textLabel) {
        textLabel.textContent = newStatus;
        textLabel.className = `status-text ${isChecked ? 'called' : 'pending'}`;
    }

    fetch("/api/admin/update_status", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Admin-Passcode": storedPasscode
        },
        body: JSON.stringify({
            booking_id: bookingId,
            status: newStatus
        })
    })
    .then(res => {
        if (res.status === 200) {
            // Update local object data
            if (booking) booking.status = newStatus;
            
            showToast(`Оновлено статус для ${bookingId}`);
        } else {
            throw new Error("API rejection");
        }
    })
    .catch(err => {
        console.error("Status update error:", err);
        alert("Не вдалося оновити статус у базі Excel. Повернення стану...");
        // Revert checkbox in case of error
        const chk = document.getElementById(`chk-${bookingId}`);
        if (chk) chk.checked = !isChecked;
        // Revert text label class/text
        if (textLabel) {
            textLabel.textContent = previousStatus;
            textLabel.className = `status-text ${previousStatus.startsWith("Подзвонили / Опрацьовано") ? 'called' : 'pending'}`;
        }
    });
}

/**
 * Triggers a short fade-in notification toast.
 */
function showToast(msg) {
    const toast = document.getElementById("toast-msg");
    const txt = document.getElementById("toast-text");
    if (!toast || !txt) return;

    txt.textContent = msg;
    toast.style.display = "flex";
    toast.style.opacity = "1";

    setTimeout(() => {
        // Simple fadeout
        toast.style.opacity = "0";
        setTimeout(() => {
            toast.style.display = "none";
        }, 300);
    }, 2000);
}

/**
 * Switch dashboard view sections.
 */
function switchAdminSection(section) {
    document.querySelectorAll(".admin-nav-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".admin-view-section").forEach(sec => sec.classList.add("hidden"));
    
    if (section === 'bookings') {
        document.getElementById("nav-btn-bookings").classList.add("active");
        document.getElementById("bookings-section").classList.remove("hidden");
        
        // Stop message-level polling, but keep list polling active in background
        if (adminChatMsgPollInterval) {
            clearInterval(adminChatMsgPollInterval);
            adminChatMsgPollInterval = null;
        }
    } else if (section === 'chats') {
        document.getElementById("nav-btn-chats").classList.add("active");
        document.getElementById("support-section").classList.remove("hidden");
        
        // Rerender chat list immediately
        loadAdminChatsList();
        
        // If a chat is active, resume message polling
        if (activeSupportChatUserId && !adminChatMsgPollInterval) {
            adminChatMsgPollInterval = setInterval(loadSupportChatMessages, 3000);
        }
    }
}

/**
 * Loads the active chats list from Flask backend.
 */
function loadAdminChatsList() {
    if (!storedPasscode) return;
    
    fetch("/api/chat/admin/list", {
        method: "GET",
        headers: {
            "X-Admin-Passcode": storedPasscode
        }
    })
    .then(res => {
        if (res.status === 403) {
            logout();
            return;
        }
        return res.json();
    })
    .then(chats => {
        if (!chats) return;
        
        allActiveChats = chats;
        
        // Calculate badge (chats where the last message was sent by 'user')
        let pendingRepliesCount = 0;
        chats.forEach(chat => {
            if (chat.last_message_sender === 'user') {
                pendingRepliesCount++;
            }
        });
        
        const badge = document.getElementById("admin-chat-alert-badge");
        if (badge) {
            if (pendingRepliesCount > 0) {
                badge.textContent = pendingRepliesCount;
                badge.classList.remove("hidden");
            } else {
                badge.classList.add("hidden");
            }
        }
        
        // Render chat user list inside left pane
        const chatsListContainer = document.getElementById("admin-chats-list");
        if (!chatsListContainer) return;
        
        if (chats.length === 0) {
            chatsListContainer.innerHTML = '<div class="no-chats-msg">Немає активних чатів</div>';
            return;
        }
        
        chatsListContainer.innerHTML = "";
        chats.forEach(chat => {
            const div = document.createElement("div");
            const isActive = activeSupportChatUserId === chat.user_id;
            div.className = `chat-user-item${isActive ? ' active' : ''}`;
            
            if (isActive) {
                activeSupportChatNeedsManager = chat.needs_manager;
                updateAIStatusHeader();
            }
            
            const needsReply = chat.last_message_sender === 'user';
            const dotIndicator = needsReply ? '<span style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--color-error); margin-left: 8px; display: inline-block;"></span>' : '';
            
            // Mode badges
            let modeBadge = '';
            if (chat.needs_manager) {
                modeBadge = '<span style="background: rgba(255, 59, 92, 0.15); color: #ff9fb0; border: 1px solid rgba(255, 59, 92, 0.3); font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 6px; margin-left: 6px; display: inline-block;">МЕНЕДЖЕР 👤</span>';
            } else {
                modeBadge = '<span style="background: rgba(0, 108, 62, 0.15); color: #8efcbe; border: 1px solid rgba(0, 108, 62, 0.3); font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 6px; margin-left: 6px; display: inline-block;">ШІ 🤖</span>';
            }
            
            let timeStr = "";
            if (chat.updated_at && chat.updated_at.includes(" ")) {
                timeStr = chat.updated_at.split(" ")[1].substring(0, 5);
            }
            
            const senderPrefix = chat.last_message_sender === 'admin' ? 'Ви: ' : '';
            
            div.innerHTML = `
                <div class="chat-user-item-header">
                    <span class="chat-user-item-name">${escapeHTML(chat.name)}${modeBadge}${dotIndicator}</span>
                    <span class="chat-user-item-time">${timeStr}</span>
                </div>
                <div class="chat-user-item-snippet" style="${needsReply ? 'font-weight: 700; color: #FFFFFF;' : ''}">
                    ${senderPrefix}${escapeHTML(chat.last_message_text || 'Немає повідомлень')}
                </div>
            `;
            
            div.addEventListener("click", () => {
                selectSupportChat(chat.user_id, chat.name, chat.username);
            });
            
            chatsListContainer.appendChild(div);
        });
    })
    .catch(err => {
        console.error("Error loading active chats list:", err);
    });
}

/**
 * Focuses support conversation window on a user.
 */
function selectSupportChat(userId, userName, userUsername) {
    activeSupportChatUserId = userId;
    activeSupportChatName = userName;
    activeSupportChatUsername = userUsername;
    
    // Find needs_manager from cache
    const matched = allActiveChats.find(c => c.user_id === userId);
    activeSupportChatNeedsManager = matched ? matched.needs_manager : false;
    
    // Rerender list to highlight active item
    loadAdminChatsList();
    
    // Update active chat header
    const headerTitle = document.getElementById("active-chat-user-name");
    const headerUsername = document.getElementById("active-chat-user-username");
    const inputArea = document.getElementById("admin-chat-input-area");
    
    if (headerTitle) headerTitle.textContent = userName;
    if (headerUsername) {
        if (userUsername) {
            if (userUsername.startsWith("@id") || userUsername.startsWith("id")) {
                const cleanId = userUsername.replace("@", "").replace("id", "");
                headerUsername.textContent = `ID: ${cleanId}`;
            } else {
                headerUsername.textContent = `@${userUsername.replace('@', '')}`;
            }
        } else {
            headerUsername.textContent = `ID: ${userId}`;
        }
    }
    if (inputArea) inputArea.classList.remove("hidden");
    
    // Render AI Status
    updateAIStatusHeader();
    
    // Load messages immediately
    loadSupportChatMessages();
    
    // Setup message polling
    if (adminChatMsgPollInterval) {
        clearInterval(adminChatMsgPollInterval);
    }
    adminChatMsgPollInterval = setInterval(loadSupportChatMessages, 3000);
    
    // Focus chat input
    setTimeout(() => {
        const input = document.getElementById("admin-chat-input");
        if (input) input.focus();
    }, 100);
}

/**
 * Loads support chat history messages from backend.
 */
function loadSupportChatMessages() {
    if (!activeSupportChatUserId) return;
    const logBox = document.getElementById("admin-chat-messages");
    if (!logBox) return;
    
    fetch(`/api/chat/history?user_id=${activeSupportChatUserId}`)
        .then(res => res.json())
        .then(messages => {
            const currentCount = logBox.querySelectorAll(".chat-msg").length;
            if (messages.length === currentCount && logBox.querySelector(".viewport-empty-state") === null) {
                return;
            }
            
            logBox.innerHTML = "";
            
            if (messages.length === 0) {
                logBox.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--color-text-muted);">
                        <p>Немає повідомлень у цьому чаті</p>
                    </div>
                `;
                return;
            }
            
            messages.forEach(msg => {
                const div = document.createElement("div");
                div.className = `chat-msg ${msg.sender}`;
                
                let timeStr = "";
                if (msg.timestamp && msg.timestamp.includes(" ")) {
                    timeStr = msg.timestamp.split(" ")[1].substring(0, 5);
                }
                
                div.innerHTML = `
                    <p>${escapeHTML(msg.text)}</p>
                    <span class="meta">${timeStr}</span>
                `;
                logBox.appendChild(div);
            });
            
            logBox.scrollTop = logBox.scrollHeight;
        })
        .catch(err => {
            console.error("Error loading support messages:", err);
        });
}

/**
 * Dispatches an admin text message to the server.
 */
function sendAdminChatMessage() {
    const input = document.getElementById("admin-chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text || !activeSupportChatUserId) return;
    
    input.value = "";
    
    fetch("/api/chat/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Admin-Passcode": storedPasscode
        },
        body: JSON.stringify({
            user_id: activeSupportChatUserId,
            sender: "admin",
            text: text
        })
    })
    .then(res => {
        if (res.ok) {
            loadSupportChatMessages();
            loadAdminChatsList();
        } else {
            alert("Не вдалося надіслати повідомлення.");
        }
    })
    .catch(err => {
        console.error("Send chat message error:", err);
    });
}

/**
 * Handles enter key presses in chat response.
 */
function handleAdminChatKeyPress(e) {
    if (e.key === "Enter") {
        sendAdminChatMessage();
    }
}

/**
 * Starts continuous polling for active chat list.
 */
function startAdminChatListPolling() {
    loadAdminChatsList();
    if (!adminChatListPollInterval) {
        adminChatListPollInterval = setInterval(loadAdminChatsList, 3000);
    }
}

/**
 * Stops all background chat polling.
 */
function stopAdminChatListPolling() {
    if (adminChatListPollInterval) {
        clearInterval(adminChatListPollInterval);
        adminChatListPollInterval = null;
    }
    if (adminChatMsgPollInterval) {
        clearInterval(adminChatMsgPollInterval);
        adminChatMsgPollInterval = null;
    }
}

/**
 * Escapes HTML input.
 */
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

// Window level helper functions
window.attemptLogin = attemptLogin;
function updateAIStatusHeader() {
    const container = document.getElementById("admin-chat-ai-status-container");
    const badge = document.getElementById("admin-chat-ai-status-badge");
    const btn = document.getElementById("admin-chat-toggle-ai-btn");
    
    if (!activeSupportChatUserId) {
        if (container) container.classList.add("hidden");
        return;
    }
    
    if (container) container.classList.remove("hidden");
    
    if (activeSupportChatNeedsManager) {
        if (badge) {
            badge.textContent = "ПОТРІБЕН МЕНЕДЖЕР 👤";
            badge.style.background = "rgba(255, 59, 92, 0.2)";
            badge.style.color = "#FF3B5C";
            badge.style.border = "1px solid rgba(255, 59, 92, 0.4)";
        }
        if (btn) {
            btn.textContent = "Увімкнути ШІ 🤖";
            btn.style.background = "rgba(0, 108, 62, 0.2)";
            btn.style.color = "#8efcbe";
            btn.style.borderColor = "rgba(0, 108, 62, 0.4)";
        }
    } else {
        if (badge) {
            badge.textContent = "ШІ-АВТОКЛІЄНТ 🤖";
            badge.style.background = "rgba(0, 108, 62, 0.2)";
            badge.style.color = "#00E676";
            badge.style.border = "1px solid rgba(0, 108, 62, 0.4)";
        }
        if (btn) {
            btn.textContent = "Взяти чат 👤";
            btn.style.background = "rgba(255, 59, 92, 0.2)";
            btn.style.color = "#ff9fb0";
            btn.style.borderColor = "rgba(255, 59, 92, 0.4)";
        }
    }
}

function toggleAIChatMode() {
    if (!activeSupportChatUserId || !storedPasscode) return;
    
    // If it currently needs manager, we want to enable AI. Otherwise, we disable AI.
    const enableAI = activeSupportChatNeedsManager;
    const actionText = enableAI ? "Увімкнути ШІ-асистента?" : "Вимкнути ШІ-асистента та перейти в режим менеджера?";
    
    if (confirm(actionText)) {
        fetch("/api/chat/admin/toggle_ai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Admin-Passcode": storedPasscode
            },
            body: JSON.stringify({
                user_id: activeSupportChatUserId,
                enable_ai: enableAI
            })
        })
        .then(res => {
            if (res.ok) {
                activeSupportChatNeedsManager = !enableAI;
                updateAIStatusHeader();
                loadAdminChatsList();
                loadSupportChatMessages();
            } else {
                alert("Не вдалося оновити режим чату.");
            }
        })
        .catch(err => {
            console.error("Toggle AI mode error:", err);
        });
    }
}

window.logout = logout;
window.toggleBookingCalledStatus = toggleBookingCalledStatus;
window.switchAdminSection = switchAdminSection;
window.sendAdminChatMessage = sendAdminChatMessage;
window.handleAdminChatKeyPress = handleAdminChatKeyPress;
window.selectSupportChat = selectSupportChat;
window.toggleAIChatMode = toggleAIChatMode;

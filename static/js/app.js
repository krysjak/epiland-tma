/**
 * EPILAND Telegram Mini App - Client Booking Logic
 * Handles screen transitions, location themes, dynamic catalog loading, 
 * date/time slot conflict detection, and API submission.
 */

// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// Global Application State
let catalogData = null;
let currentLoc = 'chabany'; // Default location
let currentCategory = 'attractions'; // Default tab
let cart = [];
let selectedSlot = null;
let bookedSlotsData = {}; // Stores items booked in each slot for selected date
let globalUser = null;
let currentScreen = 'home';
let activeCafeCategory = 'Усі';
let datepickerClickCount = 0;
let currentDatePickerDate = new Date();
let selectedRefillAmount = 100;
let userProfileData = null;

// Standard operational hours slots
const TIME_SLOTS = [
    "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", 
    "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
];

// Map of location codes to display names
const LOCATION_NAMES = {
    'kyiv': 'Київ (Оболонь)',
    'chabany': 'Чабани',
    'obukhiv': 'Обухів'
};

// Map of location codes to theme hex colors for Telegram Header
const LOCATION_COLORS = {
    'kyiv': '#2E1E6B',
    'chabany': '#006C3E',
    'obukhiv': '#0A58A2'
};

// On Document Load
document.addEventListener("DOMContentLoaded", () => {
    // 1. Setup Telegram User Autofill
    autofillTelegramUser();
    
    // Load profile
    loadUserProfile();

    // 2. Set min date for datepicker to today
    const dateInput = document.getElementById("booking-date");
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }

    // 3. Load catalog data
    fetchCatalog();

    // 4. Attach event listeners
    initEventListeners();

    // 5. Hide splash screen after minimum display duration
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
 * Prefills user information from Telegram WebApp context if available.
 */
function autofillTelegramUser() {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        globalUser = user;
        
        const nameInput = document.getElementById("customer-name");
        const lastnameInput = document.getElementById("customer-lastname");
        const tgInput = document.getElementById("customer-telegram");

        if (nameInput && user.first_name) nameInput.value = user.first_name;
        if (lastnameInput && user.last_name) lastnameInput.value = user.last_name;
        
        if (tgInput) {
            if (user.username) {
                tgInput.value = '@' + user.username;
                tgInput.readOnly = true;
            } else {
                tgInput.value = '@id' + user.id;
                tgInput.readOnly = true;
            }
        }
    }
}

/**
 * Fetches the service catalog from the server.
 */
function fetchCatalog() {
    fetch("/api/catalog")
        .then(res => {
            if (!res.ok) throw new Error("Failed to load catalog data");
            return res.json();
        })
        .then(data => {
            catalogData = data;
            switchLocation(currentLoc);
            renderCatalog();
        })
        .catch(err => {
            console.error("Catalog load error:", err);
            const grid = document.getElementById("catalog-grid");
            if (grid) {
                grid.innerHTML = `<div class="error-state"><i class="fa-solid fa-triangle-exclamation"></i> Помилка завантаження товарів. Спробуйте пізніше.</div>`;
            }
        });
}

/**
 * Binds DOM event listeners for navigation, forms, and triggers.
 */
function initEventListeners() {
    // Home select location
    const locSelect = document.getElementById("location-select");
    const trigger = document.getElementById("custom-select-trigger");
    const locModal = document.getElementById("location-modal-backdrop");
    const locDrawer = document.getElementById("location-drawer");
    const locCloseBtn = document.getElementById("location-drawer-close");
    const optionCards = document.querySelectorAll(".location-option-card");

    if (locSelect) {
        locSelect.addEventListener("change", (e) => {
            switchLocation(e.target.value);
        });
        // Initial setup
        switchLocation(locSelect.value);
    }

    // Configure custom select drawer behavior
    if (trigger && locModal) {
        trigger.addEventListener("click", () => {
            locModal.classList.add("active");
            if (locDrawer) locDrawer.classList.add("active");
        });
    }

    const closeLocDrawer = () => {
        if (locDrawer) locDrawer.classList.remove("active");
        if (locModal) locModal.classList.remove("active");
    };

    if (locCloseBtn) {
        locCloseBtn.addEventListener("click", closeLocDrawer);
    }
    if (locModal) {
        locModal.addEventListener("click", (e) => {
            if (e.target === locModal) {
                closeLocDrawer();
            }
        });
    }

    // Configure location option cards
    optionCards.forEach(card => {
        card.addEventListener("click", () => {
            const val = card.getAttribute("data-value");
            
            optionCards.forEach(c => {
                c.classList.remove("active");
                const icon = c.querySelector(".loc-card-check i");
                if (icon) icon.className = "fa-regular fa-circle";
            });
            card.classList.add("active");
            const cardIcon = card.querySelector(".loc-card-check i");
            if (cardIcon) cardIcon.className = "fa-regular fa-circle-dot";

            // Propagate value change to hidden native select
            if (locSelect) {
                locSelect.value = val;
                locSelect.dispatchEvent(new Event("change"));
            } else {
                switchLocation(val);
            }

            // Sync trigger text
            const labelEl = document.getElementById("selected-location-text");
            if (labelEl) {
                if (val === 'kyiv') labelEl.textContent = "EPILAND Київ (Оболонь)";
                else if (val === 'chabany') labelEl.textContent = "EPILAND Чабани";
                else if (val === 'obukhiv') labelEl.textContent = "EPILAND Обухів";
            }

            closeLocDrawer();
        });
    });

    // Initial load sync for custom select
    if (locSelect) {
        const defaultVal = locSelect.value;
        const initialLabels = {
            'kyiv': 'EPILAND Київ (Оболонь)',
            'chabany': 'EPILAND Чабани',
            'obukhiv': 'EPILAND Обухів'
        };
        const labelEl = document.getElementById("selected-location-text");
        if (labelEl) labelEl.textContent = initialLabels[defaultVal];
        
        optionCards.forEach(c => {
            if (c.getAttribute("data-value") === defaultVal) {
                c.classList.add("active");
                const icon = c.querySelector(".loc-card-check i");
                if (icon) icon.className = "fa-regular fa-circle-dot";
            } else {
                c.classList.remove("active");
                const icon = c.querySelector(".loc-card-check i");
                if (icon) icon.className = "fa-regular fa-circle";
            }
        });
    }

    // Screen routing listeners
    document.getElementById("btn-order-holiday")?.addEventListener("click", () => {
        showScreen('catalog');
        
        let targetCategory = 'birthday_rooms';
        if (catalogData && catalogData.locations && catalogData.locations[currentLoc]) {
            const locInfo = catalogData.locations[currentLoc];
            if (!locInfo.birthday_rooms || locInfo.birthday_rooms.length === 0) {
                targetCategory = 'birthday_animators';
            }
        }
        switchCategory(targetCategory);
        
        // Open birthday details automatically for holiday requests
        const extraFields = document.getElementById("additional-info-fields");
        if (extraFields && extraFields.style.display === "none") {
            toggleAdditionalFields();
        }
        // Scroll directly to booking panel
        document.getElementById("booking-panel")?.scrollIntoView({ behavior: 'smooth' });
    });

    document.getElementById("btn-attractions")?.addEventListener("click", () => {
        showScreen('catalog');
        switchCategory('attractions');
    });

    document.getElementById("btn-tariffs")?.addEventListener("click", () => {
        showScreen('catalog');
        switchCategory('promotions_tariffs');
    });

    document.getElementById("btn-products")?.addEventListener("click", () => {
        showScreen('catalog');
        switchCategory('products');
    });

    document.getElementById("btn-lasertag-home")?.addEventListener("click", () => {
        showScreen('catalog');
        switchCategory('lazertag_paintball');
    });

    document.getElementById("btn-refill-card")?.addEventListener("click", () => {
        showScreen('catalog');
        switchCategory('refill_card');
    });

    document.getElementById("btn-cafe")?.addEventListener("click", () => {
        showScreen('catalog');
        switchCategory('cafe');
    });

    document.getElementById("btn-contact")?.addEventListener("click", () => {
        openModal("contact-modal");
    });

    document.getElementById("btn-about")?.addEventListener("click", () => {
        openModal("about-modal");
    });

    document.getElementById("workspace-back-btn")?.addEventListener("click", () => {
        showScreen('home');
    });

    document.getElementById("sticky-cart-bar")?.addEventListener("click", () => {
        openCheckoutWizard();
    });

    // Category Tabs switching
    const tabBtns = document.querySelectorAll(".category-tabs .tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const category = btn.getAttribute("data-tab");
            switchCategory(category);
        });
    });

    // Date picker updates
    const dateInput = document.getElementById("booking-date");
    if (dateInput) {
        const updateDateLogic = () => {
            // Re-render catalog and cart items to update prices
            renderCatalog();
            updateCartUI();
            // Fetch booked slots for the location and date
            fetchBookedSlots();
            validateForm();
        };
        dateInput.addEventListener("change", updateDateLogic);
        dateInput.addEventListener("input", (e) => {
            const val = e.target.value;
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
                // If manual format matched DD.MM.YYYY, update text trigger
                const textTrigger = document.getElementById("selected-date-text");
                if (textTrigger) textTrigger.textContent = val;
                updateDateLogic();
            } else if (val.includes("-")) {
                updateDateLogic();
            }
        });
    }

    // Toggle additional info
    document.getElementById("additional-fields-toggle")?.addEventListener("click", toggleAdditionalFields);

    // Cart clean button
    document.getElementById("clear-cart-btn")?.addEventListener("click", () => {
        clearCart();
    });

    // Submit booking button
    document.getElementById("submit-booking-btn")?.addEventListener("click", submitBooking);

    // Dynamic Validation hooks on input changes
    const requiredInputs = ["customer-name", "customer-lastname", "customer-phone", "customer-telegram", "booking-date"];
    requiredInputs.forEach(id => {
        document.getElementById(id)?.addEventListener("input", validateForm);
    });
}

/**
 * Opens an external web link inside Telegram WebApp or standard browser.
 */
function openExternalLink(url) {
    if (tg && tg.platform !== "unknown" && typeof tg.openLink === "function") {
        tg.openLink(url);
    } else {
        window.open(url, '_blank');
    }
}
window.openExternalLink = openExternalLink;

/**
 * Switches the active screen view.
 */
function showScreen(screen) {
    currentScreen = screen;
    const home = document.getElementById("home-screen");
    const workspace = document.getElementById("app-workspace");
    const catalogSec = document.getElementById("catalog-section");
    const bookingPanel = document.getElementById("booking-panel");
    const categoryTabs = document.getElementById("category-tabs");
    const mainContent = document.getElementById("main-content");
    const backBtn = document.getElementById("workspace-back-btn");
    const stickyBar = document.getElementById("sticky-cart-bar");

    if (screen === 'home') {
        workspace.classList.add("hidden");
        home.classList.remove("hidden");
        if (stickyBar) stickyBar.classList.add("hidden");
    } else {
        home.classList.add("hidden");
        workspace.classList.remove("hidden");

        if (screen === 'catalog') {
            if (catalogSec) catalogSec.classList.remove("hidden");
            if (bookingPanel) bookingPanel.classList.add("hidden");
            if (categoryTabs) categoryTabs.classList.remove("hidden");
            if (mainContent) mainContent.classList.remove("booking-view");
            if (backBtn) backBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i> Назад`;
            
            // Show/hide sticky bar based on cart content
            if (stickyBar) {
                if (cart.length > 0) {
                    stickyBar.classList.remove("hidden");
                } else {
                    stickyBar.classList.add("hidden");
                }
            }
        } else if (screen === 'booking') {
            openCheckoutWizard();
            return;
        }
    }
}

/**
 * Handles location updates, styling color overrides, and tab visibility.
 */
function switchLocation(locationCode) {
    currentLoc = locationCode;
    
    // 1. Remove previous body themes and add new one
    document.body.classList.remove("theme-kyiv", "theme-chabany", "theme-obukhiv");
    document.body.classList.add(`theme-${locationCode}`);

    // 2. Set Telegram WebApp header color dynamically matching location
    if (tg && typeof tg.setHeaderColor === "function") {
        tg.setHeaderColor(LOCATION_COLORS[locationCode] || '#006C3E');
    }

    // 3. Update workspace header badge
    const badge = document.getElementById("active-location-badge");
    if (badge) {
        badge.textContent = LOCATION_NAMES[locationCode];
    }

    // 4. Toggle Laser Tag tab & home dashboard button (only Chabany location has Paintball/LaserTag)
    const lasertagTab = document.getElementById("lasertag-tab");
    const lasertagHomeBtn = document.getElementById("btn-lasertag-home");
    
    if (lasertagTab) {
        if (locationCode === 'chabany') {
            lasertagTab.classList.remove("hidden");
        } else {
            lasertagTab.classList.add("hidden");
            // If active tab was lasertag, fall back to attractions
            if (currentCategory === 'lazertag_paintball') {
                switchCategory('attractions');
            }
        }
    }
    
    if (lasertagHomeBtn) {
        if (locationCode === 'chabany') {
            lasertagHomeBtn.classList.remove("hidden");
        } else {
            lasertagHomeBtn.classList.add("hidden");
        }
    }

    // Dynamic grid column balancing: if count of visible buttons is odd, make the last one span 2 columns
    const gridButtons = Array.from(document.querySelectorAll(".dashboard-grid .dash-btn"));
    const visibleButtons = gridButtons.filter(btn => !btn.classList.contains("hidden") && btn.style.display !== "none");
    gridButtons.forEach(btn => btn.classList.remove("span-2"));
    if (visibleButtons.length % 2 !== 0 && visibleButtons.length > 0) {
        visibleButtons[visibleButtons.length - 1].classList.add("span-2");
    }

    // Toggle birthday categories tabs based on catalog data availability
    const bRoomTab = document.getElementById("birthday-rooms-tab");
    const bAnimTab = document.getElementById("birthday-animators-tab");
    const bShowTab = document.getElementById("birthday-shows-tab");
    const bCakeTab = document.getElementById("birthday-cakes-tab");

    if (catalogData && catalogData.locations && catalogData.locations[locationCode]) {
        const locInfo = catalogData.locations[locationCode];
        
        let hasRooms = locInfo.birthday_rooms && locInfo.birthday_rooms.length > 0;
        let hasAnimators = locInfo.birthday_animators && locInfo.birthday_animators.length > 0;
        let hasShows = locInfo.birthday_shows && locInfo.birthday_shows.length > 0;
        let hasCakes = locInfo.birthday_cakes && locInfo.birthday_cakes.length > 0;

        if (bRoomTab) {
            if (hasRooms) bRoomTab.classList.remove("hidden");
            else {
                bRoomTab.classList.add("hidden");
                if (currentCategory === 'birthday_rooms') {
                    switchCategory(hasAnimators ? 'birthday_animators' : 'attractions');
                }
            }
        }
        if (bAnimTab) {
            if (hasAnimators) bAnimTab.classList.remove("hidden");
            else {
                bAnimTab.classList.add("hidden");
                if (currentCategory === 'birthday_animators') {
                    switchCategory('attractions');
                }
            }
        }
        if (bShowTab) {
            if (hasShows) bShowTab.classList.remove("hidden");
            else {
                bShowTab.classList.add("hidden");
                if (currentCategory === 'birthday_shows') {
                    switchCategory('attractions');
                }
            }
        }
        if (bCakeTab) {
            if (hasCakes) bCakeTab.classList.remove("hidden");
            else {
                bCakeTab.classList.add("hidden");
                if (currentCategory === 'birthday_cakes') {
                    switchCategory('attractions');
                }
            }
        }
    }

    // 5. Clear cart when switching location to prevent ordering cross-location items
    clearCart();
    activeCafeCategory = 'Усі';

    // 6. Re-render catalog for new location
    if (catalogData) {
        renderCatalog();
    }
}

/**
 * Switches the selected category tab.
 */
function switchCategory(category) {
    currentCategory = category;

    // Update active class on tab buttons
    const tabBtns = document.querySelectorAll(".category-tabs .tab-btn");
    tabBtns.forEach(btn => {
        if (btn.getAttribute("data-tab") === category) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // Update category title text
    const titleEl = document.getElementById("current-category-title");
    if (titleEl) {
        if (category === 'attractions') titleEl.textContent = "Розваги та атракціони";
        else if (category === 'promotions_tariffs') titleEl.textContent = "Тарифи та акції";
        else if (category === 'products') titleEl.textContent = "Супутні товари";
        else if (category === 'lazertag_paintball') titleEl.textContent = "Лазертаг та Пейнтбол";
        else if (category === 'birthday_rooms') titleEl.textContent = "Банкетні кімнати";
        else if (category === 'birthday_animators') titleEl.textContent = "Аніматори та Квести";
        else if (category === 'birthday_shows') titleEl.textContent = "Шоу та Майстер-класи";
        else if (category === 'birthday_cakes') titleEl.textContent = "Торти та Святковий декор";
        else if (category === 'cafe') titleEl.textContent = "Сімейне кафе";
        else if (category === 'refill_card') titleEl.textContent = "Поповнити картку";
    }

    // Re-render catalog items
    renderCatalog();
}

/**
 * Determines if a YYYY-MM-DD date is a weekend (Saturday or Sunday).
 */
function isWeekend(dateStr) {
    if (!dateStr) return false;
    const date = parseDateString(dateStr);
    if (!date || isNaN(date.getTime())) return false;
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    return day === 0 || day === 6;
}

/**
 * Safely extracts integer price from text like "400 грн", "350 грн/год".
 */
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const match = String(priceStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
}

/**
 * Toggles the additional child birthday info inputs.
 */
function toggleAdditionalFields() {
    const fields = document.getElementById("additional-info-fields");
    const chevron = document.getElementById("fields-chevron");
    
    if (fields.style.display === "none" || !fields.style.display) {
        fields.style.display = "flex";
        chevron.style.transform = "rotate(90deg)";
    } else {
        fields.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
    }
}

/**
 * Renders catalog grid based on the active location and category.
 */
function renderCatalog() {
    const grid = document.getElementById("catalog-grid");
    const countBadge = document.getElementById("catalog-count");
    if (!grid || !catalogData) return;

    const locationData = catalogData.locations[currentLoc];
    if (!locationData) {
        grid.innerHTML = `<div class="empty-state">Локація не знайдена</div>`;
        return;
    }

    // Handle Native rendering for Cafe and Refill Card
    if (currentCategory === 'cafe') {
        if (countBadge) countBadge.style.display = "none";
        
        const cafeMenu = locationData.cafe_menu || [];
        
        // Extract unique category names
        const categories = ["Усі", ...new Set(cafeMenu.map(item => item.category))];
        
        // Render category tabs and grid
        let categoriesHTML = categories.map(cat => `
            <button class="refill-amount-btn ${activeCafeCategory === cat ? 'active' : ''}" 
                    style="flex: 0 0 auto; white-space: nowrap;" 
                    onclick="switchCafeCategory('${cat}')">${cat}</button>
        `).join("");
        
        // Filter items
        const filteredMenu = activeCafeCategory === "Усі" 
            ? cafeMenu 
            : cafeMenu.filter(item => item.category === activeCafeCategory);
            
        let menuHTML = filteredMenu.map(item => {
            const inCart = cart.some(c => c.title === item.title);
            const btnClass = inCart ? "cafe-add-to-cart-btn in-cart" : "cafe-add-to-cart-btn";
            const btnText = inCart ? '<i class="fa-solid fa-check"></i> Обрано' : 'В кошик';
            const btnStyle = inCart ? 'background: #10B981; border-color: #10B981;' : '';
            return `
                <div class="cafe-menu-item-card">
                    <div class="cafe-item-visual-fallback">
                        ${item.image_url ? 
                            `<img src="${item.image_url}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                            `<i class="fa-solid ${item.icon || 'fa-utensils'}"></i>`
                        }
                    </div>
                    <h3 class="cafe-item-title">${item.title}</h3>
                    <p class="cafe-item-desc">${item.description || 'Ніжний та смачний вибір.'}</p>
                    <div class="cafe-item-footer">
                        <span class="cafe-item-price">${item.price} грн</span>
                        <button class="${btnClass}" style="${btnStyle}" onclick="handleCafeAddToCart('${item.title}', ${item.price})">${btnText}</button>
                    </div>
                </div>
            `;
        }).join("");
        
        if (filteredMenu.length === 0) {
            menuHTML = `<div class="empty-state" style="grid-column: span 2;"><i class="fa-solid fa-folder-open"></i> Немає доступних страв.</div>`;
        }
        
        grid.innerHTML = `
            <div class="cafe-categories-bar" style="display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 8px; width: 100%;">
                ${categoriesHTML}
            </div>
            <div class="cafe-card-grid" style="width: 100%;">
                ${menuHTML}
            </div>
        `;
        return;
    } else if (currentCategory === 'refill_card') {
        if (countBadge) countBadge.style.display = "none";
        
        grid.innerHTML = `
            <div class="payment-wrapper-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-card); box-shadow: var(--shadow-premium); padding: 24px; display: flex; flex-direction: column; gap: 24px; width: 100%; max-width: 480px; margin: 0 auto; box-sizing: border-box; grid-column: 1 / -1;">
                <h3 style="font-size: 16px; font-weight: 800; color: var(--color-text-dark); margin: 0; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fa-solid fa-credit-card" style="color: var(--primary-color);"></i> Поповнення ігрового балансу
                </h3>

                <!-- Visual Card Mockup -->
                <div class="refill-card-mockup" style="margin: 0 auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="refill-card-chip"></div>
                        <img src="/static/logo.svg" style="height:20px; filter:brightness(0) invert(1);">
                    </div>
                    <div class="refill-card-number" id="mock-card-number">•••• •••• •••• ••••</div>
                    <div class="refill-card-details-row">
                        <div>
                            <span style="display:block; opacity:0.6; font-size:8px;">Власник картки</span>
                            <strong id="mock-card-name">EPILAND GUEST</strong>
                        </div>
                        <div>
                            <span style="display:block; opacity:0.6; font-size:8px;">Термін</span>
                            <strong id="mock-card-expiry">MM/YY</strong>
                        </div>
                    </div>
                </div>

                <!-- Refill Form fields -->
                <div class="refill-form-fields" style="display:flex; flex-direction:column; gap:16px;">
                    <div class="form-group">
                        <label style="color: var(--color-text-muted); font-weight: 700;">Оберіть суму (UAH)</label>
                        <div class="refill-amounts-grid" style="width: 100%;">
                            <button class="refill-amount-btn ${selectedRefillAmount === 100 ? 'active' : ''}" data-amount="100">100</button>
                            <button class="refill-amount-btn ${selectedRefillAmount === 200 ? 'active' : ''}" data-amount="200">200</button>
                            <button class="refill-amount-btn ${selectedRefillAmount === 500 ? 'active' : ''}" data-amount="500">500</button>
                            <button class="refill-amount-btn ${selectedRefillAmount === 1000 ? 'active' : ''}" data-amount="1000">1000</button>
                        </div>
                        <input type="number" id="refill-custom-amount" class="modern-input" placeholder="Інша сума" style="width:100%; padding:10px; font-size:13.5px;" value="${selectedRefillAmount && ![100, 200, 500, 1000].includes(selectedRefillAmount) ? selectedRefillAmount : ''}">
                    </div>

                    <div class="form-group">
                        <label style="color: var(--color-text-muted); font-weight: 700;">Номер картки</label>
                        <input type="text" id="refill-card-num-input" class="modern-input" placeholder="4444 4444 4444 4444" maxlength="19" style="width:100%; padding:10px; font-size:13.5px;">
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label style="color: var(--color-text-muted); font-weight: 700;">Термін дії</label>
                            <input type="text" id="refill-card-expiry-input" class="modern-input" placeholder="MM/YY" maxlength="5" style="width:100%; padding:10px; font-size:13.5px;">
                        </div>
                        <div class="form-group">
                            <label style="color: var(--color-text-muted); font-weight: 700;">CVV</label>
                            <input type="password" id="refill-card-cvv-input" class="modern-input" placeholder="•••" maxlength="3" style="width:100%; padding:10px; font-size:13.5px;">
                        </div>
                    </div>

                    <button class="submit-booking-btn" id="refill-submit-btn" onclick="processCardRefill()" style="margin-top:10px; width: 100%;">Поповнити на <span id="refill-btn-amount">${selectedRefillAmount}</span> грн</button>
                </div>
            </div>

            <!-- Interactive simulated loader overlay for payments -->
            <div id="payment-loader-overlay" class="checkout-wizard-overlay hidden" style="background: rgba(9,13,22,0.92); z-index:10020; display:none; justify-content:center; align-items:center;">
                <div class="wizard-container" style="max-width:380px; height:auto; border-radius:24px; padding:32px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:20px; border:1.5px solid var(--border-color); background: var(--bg-card); transform:none !important;">
                    <div class="splash-spinner" style="position:relative; width:44px; height:44px; opacity:1; transform:none;">
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring"></div>
                    </div>
                    <h3 id="payment-loader-status" style="font-size:16px; font-weight:800; color: var(--color-text-dark); margin: 0;">1. Перевірка картки...</h3>
                    <p id="payment-loader-desc" style="font-size:13px; color:var(--color-text-muted); margin: 0;">Зв'язуємось з банком еквайєром</p>
                </div>
            </div>
        `;

        // Bind Payment Form Event Listeners in JS
        const numInput = document.getElementById("refill-card-num-input");
        const expiryInput = document.getElementById("refill-card-expiry-input");
        const cvvInput = document.getElementById("refill-card-cvv-input");
        const customAmtInput = document.getElementById("refill-custom-amount");

        if (numInput) {
            numInput.addEventListener("input", (e) => {
                let cursor = e.target.selectionStart;
                let val = e.target.value;
                let raw = val.replace(/\D/g, "");
                
                let formatted = "";
                for (let i = 0; i < raw.length; i++) {
                    if (i > 0 && i % 4 === 0) {
                        formatted += " ";
                    }
                    formatted += raw[i];
                }
                
                e.target.value = formatted;
                
                let newCursor = cursor + (formatted.length - val.length);
                newCursor = Math.max(0, Math.min(newCursor, formatted.length));
                
                try {
                    e.target.setSelectionRange(newCursor, newCursor);
                } catch(err) {}
                
                const mock = document.getElementById("mock-card-number");
                if (mock) mock.textContent = formatted || "•••• •••• •••• ••••";
            });
        }

        if (expiryInput) {
            expiryInput.addEventListener("input", (e) => {
                let cursor = e.target.selectionStart;
                let val = e.target.value;
                let raw = val.replace(/\D/g, "");
                
                let formatted = "";
                if (raw.length > 0) {
                    formatted = raw.substring(0, 2);
                    if (raw.length > 2) {
                        formatted += "/" + raw.substring(2, 4);
                    }
                }
                
                e.target.value = formatted;
                
                let newCursor = cursor + (formatted.length - val.length);
                newCursor = Math.max(0, Math.min(newCursor, formatted.length));
                
                try {
                    e.target.setSelectionRange(newCursor, newCursor);
                } catch(err) {}
                
                const mock = document.getElementById("mock-card-expiry");
                if (mock) mock.textContent = formatted || "MM/YY";
            });
        }

        if (cvvInput) {
            cvvInput.addEventListener("input", (e) => {
                let formatted = e.target.value.replace(/\D/g, "");
                if (e.target.value !== formatted) {
                    e.target.value = formatted;
                }
            });
        }

        if (customAmtInput) {
            customAmtInput.addEventListener("input", (e) => {
                handleCustomAmountInput(e.target.value);
            });
        }

        // Bind amount buttons
        const amtBtns = grid.querySelectorAll(".refill-amounts-grid .refill-amount-btn");
        amtBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const amount = parseInt(btn.getAttribute("data-amount"), 10);
                selectRefillAmount(amount, btn);
            });
        });

        return;
    } else {
        if (countBadge) countBadge.style.display = "inline-block";
    }

    grid.innerHTML = "";
    
    if (!locationData) {
        grid.innerHTML = `<div class="empty-state">Локація не знайдена</div>`;
        return;
    }

    let items = [];
    const isWk = isWeekend(document.getElementById("booking-date")?.value);

    // 1. Gather catalog items depending on the category tab
    if (currentCategory === 'attractions') {
        items = locationData.attractions || [];
    } else if (currentCategory === 'promotions_tariffs') {
        items = locationData.prices_grid?.promotions_tariffs || [];
    } else if (currentCategory === 'products') {
        items = locationData.prices_grid?.products || [];
    } else if (currentCategory === 'birthday_rooms') {
        items = locationData.birthday_rooms || [];
    } else if (currentCategory === 'birthday_animators') {
        items = locationData.birthday_animators || [];
    } else if (currentCategory === 'birthday_shows') {
        items = locationData.birthday_shows || [];
    } else if (currentCategory === 'birthday_cakes') {
        items = locationData.birthday_cakes || [];
    } else if (currentCategory === 'lazertag_paintball') {
        const rawLaser = locationData.lazertag_paintball || [];
        // Laser tag has options in 'prices' array. We expand them as separate items for easy shopping
        rawLaser.forEach(cat => {
            if (cat.prices && cat.prices.length > 0) {
                cat.prices.forEach((optStr, idx) => {
                    const priceVal = parsePrice(optStr);
                    // Extract details after price
                    const detailsStr = optStr.replace(/^\d+\s*(?:грн|грн\.)?\s*[\u2013\u2014-]?\s*/i, '');
                    items.push({
                        title: `${cat.title} (${detailsStr})`,
                        description: cat.description,
                        local_image_path: cat.local_image_path,
                        image_url: cat.image_url,
                        fixed_price: priceVal,
                        is_lazertag: true
                    });
                });
            } else {
                items.push({
                    title: cat.title,
                    description: cat.description,
                    local_image_path: cat.local_image_path,
                    image_url: cat.image_url,
                    fixed_price: 0,
                    is_lazertag: true,
                    contact_required: true
                });
            }
        });
    }

    if (items.length === 0) {
        grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-folder-open"></i> Немає доступних позицій у цій категорії.</div>`;
        if (countBadge) countBadge.textContent = "0 позицій";
        return;
    }

    if (countBadge) countBadge.textContent = `${items.length} позицій`;

    // 2. Inject item cards dynamically
    items.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "catalog-card";
        // Staggered slide up animation
        card.style.animationDelay = `${index * 0.04}s`;

        // Resolve Image
        let imgSrc = "/static/logo.svg"; // Fallback logo
        if (item.local_image_path) {
            imgSrc = `/${item.local_image_path}`;
        } else if (item.image_url) {
            imgSrc = item.image_url;
        }

        // Determine active pricing block HTML
        let pricingHTML = "";
        let weekdayPrice = 0;
        let weekendPrice = 0;
        let singlePrice = 0;
        let priceLabelText = "";

        if (currentCategory === 'attractions') {
            weekdayPrice = parsePrice(item.price_weekdays);
            weekendPrice = parsePrice(item.price_weekends);
            
            pricingHTML = `
                <div class="card-prices">
                    <div class="price-block ${!isWk ? 'weekend-highlight' : ''}">
                        <span class="price-label">Пн - Пт</span>
                        <span class="price-val">${weekdayPrice} грн</span>
                    </div>
                    <div class="price-block ${isWk ? 'weekend-highlight' : ''}">
                        <span class="price-label">Сб - Нд</span>
                        <span class="price-val">${weekendPrice}   грн</span>
                    </div>
                </div>
            `;
        } else if (currentCategory === 'promotions_tariffs') {
            if (item.fixed_price !== undefined) {
                singlePrice = item.fixed_price;
            } else if (item.price_details) {
                singlePrice = parsePrice(item.price_details);
            } else if (item.description) {
                const match = item.description.match(/(\d+)\s*(?:грн|гривень)/i);
                singlePrice = match ? parseInt(match[1], 10) : 0;
            }
            priceLabelText = "Пакетна ціна";
            pricingHTML = `
                <div class="card-prices">
                    <div class="price-block weekend-highlight" style="background: var(--accent-light) !important; border-color: var(--primary-color);">
                        <span class="price-label" style="color: var(--primary-color);">${priceLabelText}</span>
                        <span class="price-val" style="color: var(--primary-color-dark);">${singlePrice ? singlePrice + ' грн' : 'Уточнюйте'}</span>
                    </div>
                </div>
            `;
        } else if (currentCategory === 'products') {
            singlePrice = parsePrice(item.price);
            priceLabelText = "Ціна";
            pricingHTML = `
                <div class="card-prices">
                    <div class="price-block weekend-highlight" style="background: var(--accent-light) !important; border-color: var(--primary-color);">
                        <span class="price-label" style="color: var(--primary-color);">${priceLabelText}</span>
                        <span class="price-val" style="color: var(--primary-color-dark);">${singlePrice} грн</span>
                    </div>
                </div>
            `;
        } else if (currentCategory === 'lazertag_paintball') {
            singlePrice = item.fixed_price;
            priceLabelText = item.contact_required ? "Уточнюйте ціну" : "Ціна сеансу";
            pricingHTML = `
                <div class="card-prices">
                    <div class="price-block weekend-highlight" style="background: var(--accent-light) !important; border-color: var(--primary-color);">
                        <span class="price-label" style="color: var(--primary-color);">${priceLabelText}</span>
                        <span class="price-val" style="color: var(--primary-color-dark);">${item.contact_required ? 'Дзвінок' : singlePrice + ' грн'}</span>
                    </div>
                </div>
            `;
        } else if (['birthday_rooms', 'birthday_animators', 'birthday_shows', 'birthday_cakes'].includes(currentCategory)) {
            singlePrice = 0;
            priceLabelText = item.pdf_url ? "За прайсом" : "Опція свята";
            pricingHTML = `
                <div class="card-prices">
                    <div class="price-block weekend-highlight" style="background: var(--accent-light) !important; border-color: var(--primary-color);">
                        <span class="price-label" style="color: var(--primary-color);">${priceLabelText}</span>
                        <span class="price-val" style="color: var(--primary-color-dark);">${item.pdf_url ? 'Уточнюйте' : 'Безкоштовно/Замовлення'}</span>
                    </div>
                </div>
            `;
        }

        // Determine Spec lines
        let specsHTML = "";
        if (item.duration) {
            specsHTML += `<div class="spec-line"><i class="fa-regular fa-clock"></i> <span>${item.duration}</span></div>`;
        }
        if (item.restrictions) {
            specsHTML += `<div class="spec-line"><i class="fa-solid fa-child-reaching"></i> <span>${item.restrictions}</span></div>`;
        }

        // Add extra indicator for Laser tag
        if (item.is_lazertag && item.contact_required) {
            specsHTML += `<div class="spec-line" style="color: var(--color-warning); font-weight:700;"><i class="fa-solid fa-phone"></i> Потребує дзвінка</div>`;
        }

        // Check if item is already in the cart
        const inCart = cart.some(c => c.title === item.title);
        const buttonClass = inCart ? "add-booking-btn in-cart" : "add-booking-btn";
        const buttonText = inCart ? `<i class="fa-solid fa-check"></i> У кошику` : `<i class="fa-solid fa-plus"></i> Обрати розвагу`;

        let pdfButtonHTML = "";
        if (item.pdf_url) {
            const pdfHref = item.local_pdf_path ? `/${item.local_pdf_path}` : item.pdf_url;
            pdfButtonHTML = `
                <button class="pdf-btn" onclick="openExternalLink('${pdfHref}'); event.stopPropagation();">
                    <i class="fa-solid fa-file-pdf"></i> Прайс (PDF)
                </button>
            `;
        }

        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${imgSrc}" class="card-img" alt="${item.title}" onerror="this.src='/static/logo.svg'; this.style.objectFit='contain';">
                ${item.restrictions ? `<span class="card-badge">${item.restrictions.replace('років', 'р.')}</span>` : ''}
            </div>
            <div class="card-body">
                <h3 class="card-title">${item.title}</h3>
                <p class="card-desc" title="${item.description || ''}">${item.description || 'Немає опису.'}</p>
                
                ${specsHTML ? `<div class="card-specs">${specsHTML}</div>` : ''}
                ${pricingHTML}
                
                <div class="card-actions-row" style="display: flex; gap: 8px; margin-top: 12px; width: 100%;">
                    ${pdfButtonHTML}
                    <button class="${buttonClass}" data-index="${index}" style="flex: 1;">${buttonText}</button>
                </div>
            </div>
        `;

        // Hook up choose button
        card.querySelector(".add-booking-btn").addEventListener("click", () => {
            const cartItem = {
                title: item.title,
                category: currentCategory,
                weekdayPrice: weekdayPrice,
                weekendPrice: weekendPrice,
                singlePrice: singlePrice,
                isAttraction: currentCategory === 'attractions'
            };
            toggleCartItem(cartItem);
        });

        grid.appendChild(card);
    });
}

/**
 * Toggles a catalog item inside the user's booking cart.
 */
function toggleCartItem(item) {
    const idx = cart.findIndex(c => c.title === item.title);
    if (idx === -1) {
        cart.push(item);
    } else {
        cart.splice(idx, 1);
    }

    renderCatalog();
    updateCartUI();
    fetchBookedSlots(); // Refresh time slots in case item overlap conflicts change
}

/**
 * Removes an item from the cart.
 */
function removeCartItem(title) {
    cart = cart.filter(c => c.title !== title);
    renderCatalog();
    updateCartUI();
    fetchBookedSlots();
}

/**
 * Clears the shopping cart state.
 */
function clearCart() {
    cart = [];
    selectedSlot = null;
    renderCatalog();
    updateCartUI();
    fetchBookedSlots();
}

/**
 * Updates the booking panel checkout summary and calculated totals.
 */
function updateCartUI() {
    const container = document.getElementById("cart-items");
    const totalVal = document.getElementById("total-price-val");
    if (!container) return;

    let total = 0;
    const isWk = isWeekend(document.getElementById("booking-date")?.value);
    
    const clearCartBtn = document.getElementById("clear-cart-btn");
    const wizardCartEmpty = document.getElementById("wizard-cart-empty");
    const wizardNextBtn = document.getElementById("wizard-btn-go-to-checkout");

    if (cart.length === 0) {
        container.innerHTML = "";
        if (totalVal) totalVal.textContent = "0 грн";
        if (clearCartBtn) clearCartBtn.style.display = "none";
        if (wizardCartEmpty) wizardCartEmpty.classList.remove("hidden");
        if (wizardNextBtn) {
            wizardNextBtn.disabled = true;
            wizardNextBtn.style.opacity = "0.5";
        }
    } else {
        if (clearCartBtn) clearCartBtn.style.display = "flex";
        if (wizardCartEmpty) wizardCartEmpty.classList.add("hidden");
        if (wizardNextBtn) {
            wizardNextBtn.disabled = false;
            wizardNextBtn.style.opacity = "1";
        }
        
        container.innerHTML = "";
        cart.forEach(item => {
            let activePrice = 0;
            if (item.isAttraction) {
                activePrice = isWk ? item.weekendPrice : item.weekdayPrice;
            } else {
                activePrice = item.singlePrice || 0;
            }
            total += activePrice;

            const el = document.createElement("div");
            el.className = "cart-item-container";
            el.innerHTML = `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <span class="cart-item-title">${item.title}</span>
                        <span class="cart-item-price">${activePrice > 0 ? activePrice + ' грн' : 'Ціна за дзвінком'}</span>
                    </div>
                    <button class="remove-item-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="cart-item-note-wrapper">
                    <input type="text" class="cart-item-note-input" placeholder="Додати примітку (час, колір, побажання...)" value="${item.note || ''}">
                </div>
            `;

            el.querySelector(".remove-item-btn").addEventListener("click", () => {
                removeCartItem(item.title);
            });

            const noteInput = el.querySelector(".cart-item-note-input");
            if (noteInput) {
                noteInput.addEventListener("input", (e) => {
                    item.note = e.target.value;
                });
            }

            container.appendChild(el);
        });

        if (totalVal) {
            totalVal.textContent = `${total} грн`;
        }
    }

    // Update floating cart pill
    const barCount = document.getElementById("cart-bar-count");
    const barPrice = document.getElementById("cart-bar-price");
    const stickyBar = document.getElementById("sticky-cart-bar");

    if (barCount) {
        barCount.textContent = cart.length;
    }
    if (barPrice) {
        barPrice.textContent = `${total} грн`;
    }

    if (stickyBar) {
        if (currentScreen === 'catalog' && cart.length > 0) {
            stickyBar.classList.remove("hidden");
        } else {
            stickyBar.classList.add("hidden");
        }
    }

    validateForm();
}

/**
 * Fetches already booked slots from Excel database for conflict checking.
 */
function fetchBookedSlots() {
    const dateVal = document.getElementById("booking-date")?.value;
    if (!dateVal || !currentLoc) {
        renderSlotsGrid();
        return;
    }

    fetch(`/api/booked_slots?location=${currentLoc}&date=${dateVal}`)
        .then(res => {
            if (!res.ok) throw new Error("Failed to load booked slots");
            return res.json();
        })
        .then(slotsMap => {
            bookedSlotsData = slotsMap; // e.g. { "14:00": ["Автодром", "Водяна гойдалка"], ... }
            renderSlotsGrid();
        })
        .catch(err => {
            console.error("Booked slots fetch error:", err);
            bookedSlotsData = {};
            renderSlotsGrid();
        });
}

/**
 * Renders the time slots capsules and runs client-side conflict overlapping.
 */
function renderSlotsGrid() {
    const grid = document.getElementById("time-slots-grid");
    if (!grid) return;

    grid.innerHTML = "";

    const dateVal = document.getElementById("booking-date")?.value;
    if (!dateVal) {
        grid.innerHTML = `<div style="grid-column: span 4; font-size: 11.5px; color: var(--color-text-muted); text-align: center;">Оберіть спершу дату візиту</div>`;
        return;
    }

    TIME_SLOTS.forEach(slot => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-slot-btn";
        btn.textContent = slot;

        // Conflict check: check if any of the items in our cart are already booked in this slot
        const bookedItemsInSlot = bookedSlotsData[slot] || [];
        let hasConflict = false;
        let conflictList = [];

        if (bookedItemsInSlot.length > 0 && cart.length > 0) {
            cart.forEach(cartItem => {
                if (bookedItemsInSlot.some(b => b.toLowerCase() === cartItem.title.toLowerCase())) {
                    hasConflict = true;
                    conflictList.push(cartItem.title);
                }
            });
        }

        if (hasConflict) {
            btn.classList.add("disabled");
            btn.title = `Вже заброньовано: ${conflictList.join(', ')}`;
            
            // If the selected slot is now conflicting, deselect it
            if (selectedSlot === slot) {
                selectedSlot = null;
            }
        }

        if (selectedSlot === slot) {
            btn.classList.add("selected");
        }

        btn.addEventListener("click", () => {
            if (btn.classList.contains("disabled")) {
                showToastError(`Слот ${slot} недоступний для обраних послуг: ${conflictList.join(', ')}`);
                return;
            }

            // Toggle slot selection
            if (selectedSlot === slot) {
                selectedSlot = null;
                btn.classList.remove("selected");
            } else {
                selectedSlot = slot;
                // Redraw selected classes
                const allSlotBtns = grid.querySelectorAll(".time-slot-btn");
                allSlotBtns.forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
            }

            validateForm();
        });

        grid.appendChild(btn);
    });

    validateForm();
}

/**
 * Custom small inline toast popup for errors.
 */
function showToastError(msg) {
    // Check if error modal can be used or fallback
    const errModal = document.getElementById("error-modal");
    if (errModal) {
        document.getElementById("error-title").textContent = "Конфлікт часу";
        document.getElementById("error-desc").textContent = msg;
        openModal("error-modal");
    } else {
        alert(msg);
    }
}

/**
 * Validates the inputs and toggles submission button active state.
 */
function validateForm() {
    const name = document.getElementById("customer-name")?.value.trim();
    const lastname = document.getElementById("customer-lastname")?.value.trim();
    const phone = document.getElementById("customer-phone")?.value.trim();
    const telegram = document.getElementById("customer-telegram")?.value.trim();
    const date = document.getElementById("booking-date")?.value;
    
    const submitBtn = document.getElementById("submit-booking-btn");
    if (!submitBtn) return;

    const isValid = name && lastname && phone && telegram && date && selectedSlot && cart.length > 0;
    
    submitBtn.disabled = !isValid;
}

/**
 * Dynamic price summation helper.
 */
function getCartTotalPrice() {
    const isWk = isWeekend(document.getElementById("booking-date")?.value);
    let total = 0;
    cart.forEach(item => {
        if (item.isAttraction) {
            total += isWk ? item.weekendPrice : item.weekdayPrice;
        } else {
            total += item.singlePrice || 0;
        }
    });
    return total;
}

/**
 * Collects payloads and submits booking to Flask API backend.
 */
function submitBooking() {
    const name = document.getElementById("customer-name")?.value.trim();
    const lastname = document.getElementById("customer-lastname")?.value.trim();
    const phone = document.getElementById("customer-phone")?.value.trim();
    const telegram = document.getElementById("customer-telegram")?.value.trim();
    const date = document.getElementById("booking-date")?.value;
    
    const submitBtn = document.getElementById("submit-booking-btn");
    if (!name || !lastname || !phone || !telegram || !date || !selectedSlot || cart.length === 0 || (submitBtn && submitBtn.disabled)) {
        return;
    }

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Створення...`;

    // Gather payload
    const total = getCartTotalPrice();
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    const payFromBalance = (paymentMethod === "balance");

    const payload = {
        location: LOCATION_NAMES[currentLoc], // E.g. "Чабани"
        customer_name: name,
        customer_lastname: lastname,
        customer_phone: phone,
        customer_telegram: telegram,
        telegram_id: globalUser ? String(globalUser.id) : "",
        date: date,
        time_slot: selectedSlot,
        items: cart.map(c => c.note ? `${c.title} (Примітка: ${c.note.trim()})` : c.title),
        total_price: total,
        pay_from_balance: payFromBalance,
        birthday_name: document.getElementById("birthday-name")?.value.trim() || "",
        birthday_age: document.getElementById("birthday-age")?.value.trim() || "",
        kids_count: document.getElementById("kids-count")?.value.trim() || "",
        kids_age_range: document.getElementById("kids-age")?.value.trim() || "",
        comments: document.getElementById("booking-comments")?.value.trim() || ""
    };

    fetch("/api/book", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    })
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(({ status, data }) => {
        if (status === 200 && data.success) {
            // Show Success Modal
            document.getElementById("t-id").textContent = data.booking_id;
            document.getElementById("t-location").textContent = LOCATION_NAMES[currentLoc];
            
            // Format datetime: YYYY-MM-DD to DD.MM.YYYY
            let dateFormatted = date;
            try {
                if (date.includes("-")) {
                    const dateParts = date.split("-");
                    dateFormatted = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : date;
                }
            } catch(e) {}
            document.getElementById("t-datetime").textContent = `${dateFormatted} о ${selectedSlot}`;
            document.getElementById("t-price").textContent = `${total} грн`;

            openModal("success-modal");
            clearCart();
            closeCheckoutWizard();
            loadUserProfile(); // Sync card balance
        } else {
            // Show Error Modal
            document.getElementById("error-title").textContent = "Помилка бронювання";
            document.getElementById("error-desc").textContent = data.message || "Сталася невідома помилка під час бронювання.";
            openModal("error-modal");
        }
    })
    .catch(err => {
        console.error("Booking error:", err);
        document.getElementById("error-title").textContent = "Помилка з'єднання";
        document.getElementById("error-desc").textContent = "Не вдалося з'єднатися із сервером. Перевірте з'єднання з мережею.";
        openModal("error-modal");
    })
    .finally(() => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
        }
    });
}

function openModal(modalId) {
    const backdrop = document.getElementById("modal-backdrop");
    const modals = ["success-modal", "error-modal", "contact-modal", "about-modal"];
    
    if (backdrop) {
        // Hide all modals first
        modals.forEach(id => {
            const m = document.getElementById(id);
            if (m) m.style.display = "none";
        });
        
        // Show target modal
        const target = document.getElementById(modalId);
        if (target) {
            target.style.display = "block";
            // Add active class to trigger CSS display and fade-in transition
            backdrop.classList.add("active");
        }
    }
}

function closeModal() {
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) {
        backdrop.classList.remove("active");
    }
}

// Attach closeModal to window for onclick handlers in index.html
window.closeModal = closeModal;

/* Support Live Chat Widget Logic */
let chatPollInterval = null;

function getChatUserId() {
    if (globalUser && globalUser.id) return String(globalUser.id);
    let localId = localStorage.getItem("epiland_chat_user_id");
    if (!localId) {
        localId = 'user-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("epiland_chat_user_id", localId);
    }
    return localId;
}

function getChatUserName() {
    if (globalUser) {
        return `${globalUser.first_name || ""} ${globalUser.last_name || ""}`.trim() || globalUser.username || "Користувач Telegram";
    }
    return "Гість";
}

function getChatUserUsername() {
    if (globalUser) {
        return globalUser.username ? '@' + globalUser.username : `@id${globalUser.id}`;
    }
    return "";
}

function toggleSupportChat() {
    const win = document.getElementById("chat-support-window");
    const badge = document.getElementById("chat-support-badge");
    if (!win) return;
    
    const isHidden = win.classList.contains("hidden");
    if (isHidden) {
        win.classList.remove("hidden");
        if (badge) badge.classList.add("hidden");
        loadChatHistory();
        
        // Start polling
        if (!chatPollInterval) {
            chatPollInterval = setInterval(loadChatHistory, 3000);
        }
    } else {
        win.classList.add("hidden");
        
        // Stop polling
        if (chatPollInterval) {
            clearInterval(chatPollInterval);
            chatPollInterval = null;
        }
    }
}

function loadChatHistory() {
    const userId = getChatUserId();
    const logBox = document.getElementById("chat-support-messages");
    if (!logBox) return;
    
    fetch(`/api/chat/history?user_id=${userId}`)
        .then(res => res.json())
        .then(messages => {
            const currentCount = logBox.querySelectorAll(".chat-msg:not(.system)").length;
            if (messages.length === currentCount) return;
            
            // Clear and reload
            logBox.innerHTML = `
                <div class="chat-msg system">
                    <p>Вітаємо! Напишіть ваше запитання, і адміністратор відповість вам найближчим часом. 🎪</p>
                </div>
            `;
            
            messages.forEach(msg => {
                const div = document.createElement("div");
                div.className = `chat-msg ${msg.sender}`;
                
                let timeStr = "";
                if (msg.timestamp && msg.timestamp.includes(" ")) {
                    timeStr = msg.timestamp.split(" ")[1].substring(0, 5);
                }
                
                div.innerHTML = `
                    <p>${msg.text}</p>
                    <span class="meta">${timeStr}</span>
                `;
                logBox.appendChild(div);
            });
            
            logBox.scrollTop = logBox.scrollHeight;
        })
        .catch(err => console.error("Error loading chat history:", err));
}

function sendSupportMessage() {
    const input = document.getElementById("chat-support-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    const userId = getChatUserId();
    const userName = getChatUserName();
    const userUsername = getChatUserUsername();
    
    input.value = "";
    
    fetch("/api/chat/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            user_id: userId,
            sender: "user",
            text: text,
            name: userName,
            username: userUsername
        })
    })
    .then(res => {
        if (res.ok) {
            loadChatHistory();
        } else {
            alert("Не вдалося надіслати повідомлення.");
        }
    })
    .catch(err => {
        console.error("Send message error:", err);
    });
}

function callManager() {
    const userId = getChatUserId();
    const userName = getChatUserName();
    const userUsername = getChatUserUsername();
    
    if (confirm("Ви дійсно хочете покликати менеджера? Після цього ШІ-помічник вимкнеться і підключиться людина.")) {
        fetch("/api/chat/call_manager", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_id: userId,
                name: userName,
                username: userUsername
            })
        })
        .then(res => {
            if (res.ok) {
                loadChatHistory();
            } else {
                alert("Не вдалося викликати менеджера.");
            }
        })
        .catch(err => {
            console.error("Call manager error:", err);
        });
    }
}

function handleChatKeyPress(e) {
    if (e.key === "Enter") {
        sendSupportMessage();
    }
}

// Bind live chat handlers to window
window.toggleSupportChat = toggleSupportChat;
window.sendSupportMessage = sendSupportMessage;
window.handleChatKeyPress = handleChatKeyPress;
window.callManager = callManager;

/* Datepicker & Custom Calendar Functions */
function parseDateString(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes(".")) {
        const parts = dateStr.split(".");
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
    }
    if (dateStr.includes("-")) {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
    }
    return new Date(dateStr);
}

function handleDatepickerTriggerClick() {
    datepickerClickCount++;
    if (datepickerClickCount === 1) {
        openDatePicker();
    } else {
        switchToManualDateInput();
    }
}

function openDatePicker() {
    const dpBackdrop = document.getElementById("datepicker-modal-backdrop");
    const dpCard = document.getElementById("datepicker-card");
    if (!dpBackdrop) return;
    
    dpBackdrop.style.display = "flex";
    renderDatePicker();
    
    setTimeout(() => {
        dpBackdrop.style.opacity = "1";
        if (dpCard) dpCard.style.transform = "scale(1)";
    }, 10);
}

function closeDatePicker() {
    const dpBackdrop = document.getElementById("datepicker-modal-backdrop");
    const dpCard = document.getElementById("datepicker-card");
    if (!dpBackdrop) return;
    
    dpBackdrop.style.opacity = "0";
    if (dpCard) dpCard.style.transform = "scale(0.9)";
    
    setTimeout(() => {
        dpBackdrop.style.display = "none";
    }, 300);
}

function changeDatePickerMonth(dir) {
    currentDatePickerDate.setMonth(currentDatePickerDate.getMonth() + dir);
    renderDatePicker();
}

function renderDatePicker() {
    const grid = document.getElementById("dp-days-grid");
    const title = document.getElementById("dp-month-year");
    if (!grid || !title) return;

    grid.innerHTML = "";
    
    const year = currentDatePickerDate.getFullYear();
    const month = currentDatePickerDate.getMonth();
    
    title.textContent = `${UKRAINIAN_MONTHS[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1);
    let startDayIndex = (firstDay.getDay() + 6) % 7; // Monday-first index
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < startDayIndex; i++) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "dp-day empty";
        grid.appendChild(emptyDiv);
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const bookingDateVal = document.getElementById("booking-date")?.value;
    let selectedDateObj = null;
    if (bookingDateVal) {
        selectedDateObj = parseDateString(bookingDateVal);
    }

    for (let day = 1; day <= totalDays; day++) {
        const dateObj = new Date(year, month, day);
        const dayCell = document.createElement("div");
        dayCell.className = "dp-day";
        dayCell.textContent = day;
        
        if (dateObj < today) {
            dayCell.classList.add("disabled");
        } else {
            if (selectedDateObj && 
                dateObj.getFullYear() === selectedDateObj.getFullYear() &&
                dateObj.getMonth() === selectedDateObj.getMonth() &&
                dateObj.getDate() === selectedDateObj.getDate()) {
                dayCell.classList.add("selected");
            }
            
            if (dateObj.getFullYear() === today.getFullYear() &&
                dateObj.getMonth() === today.getMonth() &&
                dateObj.getDate() === today.getDate()) {
                dayCell.classList.add("today");
            }
            
            dayCell.addEventListener("click", () => {
                selectDatePickerDate(dateObj);
            });
        }
        grid.appendChild(dayCell);
    }
}

function selectDatePickerDate(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    
    const dateInput = document.getElementById("booking-date");
    if (dateInput) {
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.dispatchEvent(new Event("change"));
    }
    
    const textTrigger = document.getElementById("selected-date-text");
    if (textTrigger) {
        textTrigger.textContent = `${dd}.${mm}.${yyyy}`;
    }
    
    closeDatePicker();
}

function switchToManualDateInput() {
    closeDatePicker();
    const trigger = document.getElementById("custom-datepicker-trigger");
    const dateInput = document.getElementById("booking-date");
    
    if (trigger && dateInput) {
        trigger.classList.add("hidden");
        trigger.style.display = "none";
        
        dateInput.classList.remove("hidden");
        dateInput.style.display = "block";
        dateInput.type = "text";
        dateInput.placeholder = "ДД.ММ.РРРР";
        dateInput.focus();
    }
}

/* Checkout Wizard Overlay Functions */
function openCheckoutWizard() {
    const overlay = document.getElementById("checkout-wizard-overlay");
    if (overlay) {
        overlay.classList.remove("hidden");
        goToWizardStep(1);
    }
}

function closeCheckoutWizard() {
    const overlay = document.getElementById("checkout-wizard-overlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }
}

function goToWizardStep(step) {
    currentWizardStep = step;
    const cartPanel = document.getElementById("wizard-step-cart");
    const checkoutPanel = document.getElementById("wizard-step-checkout");
    
    const dot1 = document.getElementById("step-dot-1");
    const dot2 = document.getElementById("step-dot-2");
    const line1 = document.getElementById("progress-line-1");
    
    const backBtn = document.getElementById("wizard-back-btn");
    const title = document.getElementById("wizard-title");
    
    const nextBtn = document.getElementById("wizard-btn-go-to-checkout");
    const submitBtn = document.getElementById("submit-booking-btn");
    
    if (step === 1) {
        title.textContent = "Кошик";
        if (cartPanel) cartPanel.classList.remove("hidden");
        if (checkoutPanel) checkoutPanel.classList.add("hidden");
        
        if (dot1) {
            dot1.classList.add("active");
            dot1.style.color = "var(--primary-color)";
        }
        if (dot2) {
            dot2.classList.remove("active");
            dot2.style.color = "var(--color-text-muted)";
        }
        if (line1) line1.style.background = "var(--border-color)";
        
        if (backBtn) backBtn.style.visibility = "hidden";
        
        if (nextBtn) {
            nextBtn.classList.remove("hidden");
            nextBtn.style.display = "flex";
        }
        if (submitBtn) {
            submitBtn.classList.add("hidden");
            submitBtn.style.display = "none";
        }
    } else if (step === 2) {
        title.textContent = "Оформлення";
        if (cartPanel) cartPanel.classList.add("hidden");
        if (checkoutPanel) checkoutPanel.classList.remove("hidden");
        
        if (dot1) {
            dot1.classList.add("active");
            dot1.style.color = "var(--primary-color)";
        }
        if (dot2) {
            dot2.classList.add("active");
            dot2.style.color = "var(--primary-color)";
        }
        if (line1) line1.style.background = "var(--primary-color)";
        
        if (backBtn) backBtn.style.visibility = "visible";
        
        if (nextBtn) {
            nextBtn.classList.add("hidden");
            nextBtn.style.display = "none";
        }
        if (submitBtn) {
            submitBtn.classList.remove("hidden");
            submitBtn.style.display = "flex";
        }
        
        fetchBookedSlots();
    }
}

function handleWizardNext() {
    if (currentWizardStep === 1) {
        if (cart.length > 0) {
            goToWizardStep(2);
        }
    }
}

function handleWizardBack() {
    if (currentWizardStep === 2) {
        goToWizardStep(1);
    }
}

/* Simulated Payment & User Balance Refill */
function selectRefillAmount(amount, btn) {
    selectedRefillAmount = amount;
    const customInput = document.getElementById("refill-custom-amount");
    if (customInput) customInput.value = "";
    
    const btns = document.querySelectorAll(".refill-amount-btn");
    btns.forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    
    const btnAmt = document.getElementById("refill-btn-amount");
    if (btnAmt) btnAmt.textContent = amount;
}

function handleCustomAmountInput(val) {
    const amt = parseInt(val, 10);
    if (!isNaN(amt) && amt > 0) {
        selectedRefillAmount = amt;
        const btns = document.querySelectorAll(".refill-amount-btn");
        btns.forEach(b => b.classList.remove("active"));
    } else {
        selectedRefillAmount = 0;
    }
    const btnAmt = document.getElementById("refill-btn-amount");
    if (btnAmt) btnAmt.textContent = selectedRefillAmount || 0;
}

function handleCardNumberInput(val) {
    let formatted = val.replace(/\D/g, "");
    let match = formatted.match(/.{1,4}/g);
    if (match) {
        formatted = match.join(" ");
    } else {
        formatted = "";
    }
    const input = document.getElementById("refill-card-num-input");
    if (input) input.value = formatted;
    
    const mock = document.getElementById("mock-card-number");
    if (mock) {
        mock.textContent = formatted || "•••• •••• •••• ••••";
    }
}

function handleCardExpiryInput(val) {
    let formatted = val.replace(/\D/g, "");
    if (formatted.length > 2) {
        formatted = formatted.substring(0,2) + "/" + formatted.substring(2,4);
    }
    const input = document.getElementById("refill-card-expiry-input");
    if (input) input.value = formatted;
    
    const mock = document.getElementById("mock-card-expiry");
    if (mock) {
        mock.textContent = formatted || "MM/YY";
    }
}

function processCardRefill() {
    const cardNum = document.getElementById("refill-card-num-input")?.value.trim();
    const expiry = document.getElementById("refill-card-expiry-input")?.value.trim();
    const cvv = document.getElementById("refill-card-cvv-input")?.value.trim();
    
    if (!cardNum || cardNum.length < 15 || !expiry || expiry.length < 5 || !cvv || cvv.length < 3) {
        alert("Будь ласка, введіть коректні дані картки");
        return;
    }
    
    if (selectedRefillAmount <= 0) {
        alert("Будь ласка, вкажіть суму поповнення");
        return;
    }
    
    const overlay = document.getElementById("payment-loader-overlay");
    const statusText = document.getElementById("payment-loader-status");
    const descText = document.getElementById("payment-loader-desc");
    
    if (overlay) {
        overlay.style.display = "flex";
        overlay.classList.remove("hidden");
    }
    
    if (statusText) statusText.textContent = "1. Перевірка картки...";
    if (descText) descText.textContent = "Зв'язуємось з банком еквайєром";
    
    setTimeout(() => {
        if (statusText) statusText.textContent = "2. Авторизація транзакції...";
        if (descText) descText.textContent = "Безпечне з'єднання 3D Secure";
        
        setTimeout(() => {
            if (statusText) statusText.textContent = "3. Зарахування на ігрову картку...";
            if (descText) descText.textContent = "Оновлення балансу в EPILAND";
            
            setTimeout(() => {
                const userId = getChatUserId();
                fetch("/api/user/refill", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        amount: selectedRefillAmount
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (overlay) {
                        overlay.style.display = "none";
                        overlay.classList.add("hidden");
                    }
                    
                    if (data.success) {
                        loadUserProfile();
                        document.getElementById("refill-card-num-input").value = "";
                        document.getElementById("refill-card-expiry-input").value = "";
                        document.getElementById("refill-card-cvv-input").value = "";
                        const customAmt = document.getElementById("refill-custom-amount");
                        if (customAmt) customAmt.value = "";
                        
                        alert(`Успішно поповнено! Новий баланс: ${data.new_balance} грн.`);
                        showScreen('home');
                        showProfile();
                    } else {
                        alert("Помилка поповнення: " + (data.message || "Невідома помилка"));
                    }
                })
                .catch(err => {
                    if (overlay) {
                        overlay.style.display = "none";
                        overlay.classList.add("hidden");
                    }
                    console.error("Payment error:", err);
                    alert("Сталася помилка з'єднання під час оплати.");
                });
            }, 1000);
        }, 1200);
    }, 1000);
}

/* User Profile & Bookings History Functions */
function loadUserProfile() {
    const userId = getChatUserId();
    const telegramId = globalUser ? String(globalUser.id) : "";
    const name = getChatUserName();
    const username = getChatUserUsername();
    const photoUrl = globalUser && globalUser.photo_url ? globalUser.photo_url : "";
    
    const url = `/api/user/profile?user_id=${userId}&telegram_id=${telegramId}&name=${encodeURIComponent(name)}&username=${encodeURIComponent(username)}&photo_url=${encodeURIComponent(photoUrl)}`;
    
    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("Failed to load user profile");
            return res.json();
        })
        .then(profile => {
            userProfileData = profile;
            
            updateHeaderBadges(profile.balance, profile.avatar_url);
            
            const avatarImg = document.getElementById("profile-avatar-img");
            if (avatarImg && profile.avatar_url) {
                avatarImg.src = profile.avatar_url;
            }
            const nameEl = document.getElementById("profile-user-name");
            if (nameEl) {
                nameEl.textContent = profile.name || "Гість";
            }
            const usernameEl = document.getElementById("profile-user-username");
            if (usernameEl) {
                if (profile.username) {
                    if (profile.username.startsWith("@id") || profile.username.startsWith("id")) {
                        const cleanId = profile.username.replace("@", "").replace("id", "");
                        usernameEl.textContent = `ID: ${cleanId}`;
                    } else {
                        usernameEl.textContent = '@' + profile.username.replace('@', '');
                    }
                } else {
                    usernameEl.textContent = `ID: ${profile.user_id}`;
                }
            }
            const balanceEl = document.getElementById("profile-balance-value");
            if (balanceEl) {
                balanceEl.textContent = `${profile.balance} грн`;
            }
            
            const wizardBalancePreview = document.getElementById("wizard-card-balance-preview");
            if (wizardBalancePreview) {
                wizardBalancePreview.textContent = `${profile.balance} грн`;
            }
        })
        .catch(err => {
            console.error("Profile sync error:", err);
        });
}

function updateHeaderBadges(balance, avatarUrl) {
    const homeBadge = document.getElementById("home-balance-badge");
    const homeAvatar = document.getElementById("home-avatar-img");
    const workBadge = document.getElementById("workspace-balance-badge");
    const workAvatar = document.getElementById("workspace-avatar-img");
    
    if (homeBadge) homeBadge.textContent = `${balance} грн`;
    if (workBadge) workBadge.textContent = `${balance} грн`;
    
    if (avatarUrl) {
        if (homeAvatar) homeAvatar.src = avatarUrl;
        if (workAvatar) workAvatar.src = avatarUrl;
    }
}

function loadUserBookingsHistory() {
    const userId = getChatUserId();
    const telegramId = globalUser ? String(globalUser.id) : "";
    const historyList = document.getElementById("profile-history-list");
    if (!historyList) return;
    
    fetch(`/api/user/bookings?user_id=${userId}&telegram_id=${telegramId}`)
        .then(res => {
            if (!res.ok) throw new Error("Failed to load bookings history");
            return res.json();
        })
        .then(bookings => {
            if (bookings.length === 0) {
                historyList.innerHTML = `
                    <div class="history-empty" style="text-align: center; padding: 40px 10px; color: var(--color-text-muted);">
                        <i class="fa-solid fa-receipt" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i>
                        <p style="font-size: 13px;">У вас ще немає замовлень</p>
                    </div>
                `;
                return;
            }
            
            historyList.innerHTML = "";
            bookings.forEach(b => {
                const itemEl = document.createElement("div");
                itemEl.className = "profile-history-item";
                
                let dateFormatted = b.date || "";
                try {
                    const parts = dateFormatted.split("-");
                    if (parts.length === 3) {
                        dateFormatted = `${parts[2]}.${parts[1]}.${parts[0]}`;
                    }
                } catch(e) {}
                
                let statusClass = "pending";
                if (b.status === "Оплачено з балансу картки" || b.status === "Оплачено") {
                    statusClass = "paid";
                } else if ((b.status && b.status.includes("Зв'язалися")) || b.status === "Виконано") {
                    statusClass = "processed";
                }
                
                const services = Array.isArray(b.items) ? b.items.join(", ") : b.items || "";
                
                itemEl.innerHTML = `
                    <div class="profile-history-item-header">
                        <span class="history-booking-id">${b.booking_id}</span>
                        <span class="history-status-badge ${statusClass}">${b.status || "В обробці"}</span>
                    </div>
                    <div class="profile-history-item-details">
                        <div style="margin-bottom: 2px;"><strong>Локація:</strong> ${b.location}</div>
                        <div style="margin-bottom: 2px;"><strong>Дата та час:</strong> ${dateFormatted} о ${b.time_slot}</div>
                        <div><strong>Сума:</strong> ${b.total_price} грн</div>
                    </div>
                    <div class="profile-history-item-services">
                        <strong>Послуги:</strong> ${services}
                    </div>
                `;
                historyList.appendChild(itemEl);
            });
        })
        .catch(err => {
            console.error("Bookings history load error:", err);
        });
}

function showProfile() {
    const screen = document.getElementById("profile-screen");
    if (screen) {
        screen.classList.remove("hidden");
        loadUserProfile();
        loadUserBookingsHistory();
    }
}

function hideProfile() {
    const screen = document.getElementById("profile-screen");
    if (screen) {
        screen.classList.add("hidden");
    }
}

function goToRefillFromProfile() {
    hideProfile();
    showScreen('catalog');
    switchCategory('refill_card');
}

function switchCafeCategory(category) {
    activeCafeCategory = category;
    renderCatalog();
}

function handleCafeAddToCart(title, price) {
    const cartItem = {
        title: title,
        category: 'cafe',
        weekdayPrice: price,
        weekendPrice: price,
        singlePrice: price,
        isAttraction: false
    };
    toggleCartItem(cartItem);
}

// Expose functions to window for inline onclick handlers
window.handleDatepickerTriggerClick = handleDatepickerTriggerClick;
window.openDatePicker = openDatePicker;
window.closeDatePicker = closeDatePicker;
window.changeDatePickerMonth = changeDatePickerMonth;
window.switchToManualDateInput = switchToManualDateInput;
window.selectDatePickerDate = selectDatePickerDate;
window.openCheckoutWizard = openCheckoutWizard;
window.closeCheckoutWizard = closeCheckoutWizard;
window.goToWizardStep = goToWizardStep;
window.handleWizardNext = handleWizardNext;
window.handleWizardBack = handleWizardBack;
window.selectRefillAmount = selectRefillAmount;
window.handleCustomAmountInput = handleCustomAmountInput;
window.handleCardNumberInput = handleCardNumberInput;
window.handleCardExpiryInput = handleCardExpiryInput;
window.processCardRefill = processCardRefill;
window.loadUserProfile = loadUserProfile;
window.updateHeaderBadges = updateHeaderBadges;
window.loadUserBookingsHistory = loadUserBookingsHistory;
window.showProfile = showProfile;
window.hideProfile = hideProfile;
window.goToRefillFromProfile = goToRefillFromProfile;
window.switchCafeCategory = switchCafeCategory;
window.handleCafeAddToCart = handleCafeAddToCart;

console.log("APP LOADED");

// =========================
// 🔹 СТАН
// =========================
let visibleCount = 6;
let allProducts = [];
let currentFiltered = [];
let currentCategory = "all";
let currentSort = "default";
let productsLoadFailures = 0;
const PROFILE_STORAGE_KEY = "userProfile";
const FAVORITES_STORAGE_KEY = "favorites";
const GOOGLE_CLIENT_ID = "143348684381-0atu6nifdbl67m534grua54kvm18sb2d.apps.googleusercontent.com";
let authMode = "login";

// =========================
// 🔹 ЗАВАНТАЖЕННЯ
// =========================
async function loadProducts() {
  try {
    const products = await getProducts(currentSort);
    allProducts = Array.isArray(products) ? products : [];
    productsLoadFailures = 0;
    applyFilters();
  } catch (error) {
    console.error("Products load failed:", error);
    allProducts = [];
    applyFilters();
    productsLoadFailures += 1;

    // Render cold starts can fail first request; retry quietly.
    if (productsLoadFailures <= 3) {
      const retryDelay = 1200 * productsLoadFailures;
      window.setTimeout(() => {
        loadProducts().catch(() => {});
      }, retryDelay);
      return;
    }

    // Keep UX non-blocking; avoid intrusive alert dialogs.
    console.warn("Products are temporarily unavailable. Please retry shortly.");
  }
}

function getSavedProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setSavedProfile(profile) {
  const current = getSavedProfile() || {};
  const merged = {
    ...current,
    ...(profile || {}),
    delivery: {
      ...(current.delivery || {}),
      ...((profile || {}).delivery || {})
    }
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(merged));
}

function canSyncByProfile(profile) {
  return Boolean(profile?.id || profile?.email || profile?.phone);
}

function updateAuthButton() {
  const profile = getSavedProfile();
  const authBtn = document.getElementById("authBtn");
  const authIcon = document.getElementById("authIcon");
  const initialsEl = document.getElementById("authInitials");
  if (!authBtn) return;
  authBtn.title = profile?.name ? `Кабінет: ${profile.name}` : "Особистий кабінет";
  if (!initialsEl || !authIcon) return;

  if (profile?.name) {
    const first = String(profile.name || "").trim().charAt(0).toUpperCase();
    const second = String(profile.lastName || "").trim().charAt(0).toUpperCase();
    initialsEl.innerText = `${first}${second || ""}`;
    initialsEl.style.display = "flex";
    authIcon.style.display = "none";
  } else {
    initialsEl.innerText = "";
    initialsEl.style.display = "none";
    authIcon.style.display = "block";
  }
}

function fillProfileForm(profile) {
  const mapping = {
    regName: profile?.name || "",
    regLastName: profile?.lastName || "",
    regPhone: profile?.phone || "",
    regEmail: profile?.email || ""
  };

  Object.entries(mapping).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value;
  });
}

function applyAuthMode() {
  const title = document.getElementById("authTitle");
  const submitBtn = document.getElementById("authSubmitBtn");
  const oauthLabel = document.getElementById("authOauthLabel");
  const registerOnly = document.querySelectorAll(".auth-register-only");
  const terms = document.getElementById("termsCheck");

  const isRegister = authMode === "register";
  if (title) title.innerText = isRegister ? "Create Account" : "Log In";
  if (submitBtn) submitBtn.innerText = isRegister ? "Create Account" : "Log In";
  if (oauthLabel) oauthLabel.innerText = isRegister ? "Sign up with Google" : "Login with Google";
  registerOnly.forEach((el) => {
    el.style.display = isRegister ? "block" : "none";
  });
  if (terms) terms.checked = false;
}

function openAuthModal(mode = "login") {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  authMode = mode;
  fillProfileForm(getSavedProfile());
  applyAuthMode();
  showAuthMessage("");
  modal.classList.add("active");
  initGoogleSignIn();
}

function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.classList.remove("active");
}

function initAuthEyes() {
  const eyesRoot = document.getElementById("authEyes");
  const modal = document.getElementById("authModal");
  if (!eyesRoot || !modal) return;

  const eyes = [...eyesRoot.querySelectorAll(".auth-eye")];
  const states = eyes.map((eye) => ({
    eye,
    pupil: eye.querySelector(".auth-eye-pupil"),
    currentX: 0,
    currentY: 0
  })).filter((state) => state.pupil);
  if (!states.length) return;

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const smoothing = 0.14;
  let isPrivate = false;
  let blinkTimer = 0;

  const setPrivateMode = (nextValue) => {
    isPrivate = Boolean(nextValue);
    eyesRoot.classList.toggle("is-private", isPrivate);
  };

  const scheduleBlink = () => {
    clearTimeout(blinkTimer);
    const nextBlinkDelay = 3800 + Math.random() * 4200;
    blinkTimer = window.setTimeout(() => {
      if (!isPrivate && modal.classList.contains("active")) {
        eyesRoot.classList.add("is-blinking");
        window.setTimeout(() => eyesRoot.classList.remove("is-blinking"), 280);
      }
      scheduleBlink();
    }, nextBlinkDelay);
  };

  const getTargetOffset = (state) => {
    const eyeRect = state.eye.getBoundingClientRect();
    const pupilRect = state.pupil.getBoundingClientRect();

    if (!eyeRect.width || !eyeRect.height) return { x: 0, y: 0 };

    const centerX = eyeRect.left + eyeRect.width / 2;
    const centerY = eyeRect.top + eyeRect.height / 2;
    const dx = pointer.x - centerX;
    const dy = pointer.y - centerY;
    const distance = Math.hypot(dx, dy) || 1;
    const maxRadius = Math.max(0, (Math.min(eyeRect.width, eyeRect.height) - Math.max(pupilRect.width, pupilRect.height)) / 2 - 5);
    const factor = Math.min(1, maxRadius / distance);
    return { x: dx * factor, y: dy * factor };
  };

  const tick = () => {
    states.forEach((state) => {
      const target = isPrivate ? { x: 0, y: 0 } : getTargetOffset(state);
      state.currentX += (target.x - state.currentX) * smoothing;
      state.currentY += (target.y - state.currentY) * smoothing;
      state.pupil.style.setProperty("--pupil-x", `${state.currentX.toFixed(2)}px`);
      state.pupil.style.setProperty("--pupil-y", `${state.currentY.toFixed(2)}px`);
    });
    window.requestAnimationFrame(tick);
  };

  const passwordInputs = [...document.querySelectorAll("#registerForm input[type='password']")];
  const syncPrivacyWithFocus = () => {
    const active = document.activeElement;
    setPrivateMode(passwordInputs.includes(active));
  };

  document.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, { passive: true });

  passwordInputs.forEach((input) => {
    input.addEventListener("focus", () => setPrivateMode(true));
    input.addEventListener("blur", syncPrivacyWithFocus);
  });
  document.addEventListener("focusin", syncPrivacyWithFocus);

  scheduleBlink();
  tick();
}

function showAuthMessage(message = "", isError = true) {
  const el = document.getElementById("authMessage");
  if (!el) return;
  el.innerText = message;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function parseJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

async function handleGoogleCredential(response) {
  const payload = parseJwtPayload(response.credential || "");
  if (!payload?.email) {
    showAuthMessage("Google профіль не отримано");
    return;
  }

  try {
    const saved = await googleAuthLogin({
      email: payload.email,
      name: payload.given_name || payload.name || "Google",
      lastName: payload.family_name || "User"
    });
    setSavedProfile(saved);
    localStorage.setItem(FAVORITES_STORAGE_KEY, "[]");
    renderFavoritesList();
    syncHomeFavoritesButtons();
    await hydrateFavoritesFromAccount(saved);
    if (typeof hydrateCartFromAccount === "function") {
      await hydrateCartFromAccount(saved);
    }
    updateAuthButton();
    closeAuthModal();
    showAuthMessage("");
  } catch (error) {
    showAuthMessage("Помилка Google входу");
  }
}

function initGoogleSignIn() {
  const container = document.getElementById("googleSignInBtn");
  if (!container || !window.google?.accounts?.id) return;
  container.innerHTML = "";

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential
  });

  window.google.accounts.id.renderButton(container, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: authMode === "register" ? "signup_with" : "signin_with",
    width: 280
  });
}

async function submitAuthForm(e) {
  e.preventDefault();

  const profile = {
    name: document.getElementById("regName")?.value?.trim(),
    lastName: document.getElementById("regLastName")?.value?.trim(),
    phone: document.getElementById("regPhone")?.value?.trim(),
    email: document.getElementById("regEmail")?.value?.trim(),
    password: document.getElementById("authPassword")?.value?.trim(),
    passwordConfirm: document.getElementById("authPasswordConfirm")?.value?.trim()
  };

  try {
    let saved;
    if (authMode === "register") {
      const termsChecked = document.getElementById("termsCheck")?.checked;
      if (!profile.name || !profile.lastName || !profile.phone || !profile.email || !profile.password || !profile.passwordConfirm) {
        showAuthMessage("Заповни ім'я, прізвище, телефон, email, пароль і повтор пароля");
        return;
      }
      if (profile.password !== profile.passwordConfirm) {
        showAuthMessage("Паролі не співпадають");
        return;
      }
      if (!termsChecked) {
        showAuthMessage("Підтвердь згоду з правилами");
        return;
      }
      saved = await registerUser({
        name: profile.name,
        lastName: profile.lastName,
        phone: profile.phone,
        email: profile.email,
        password: profile.password
      });
    } else {
      if (!profile.email || !profile.password) {
        showAuthMessage("Вкажи email і пароль");
        return;
      }
      saved = await loginUser({ phone: profile.phone, email: profile.email, password: profile.password });
    }

    setSavedProfile(saved);
    localStorage.setItem(FAVORITES_STORAGE_KEY, "[]");
    renderFavoritesList();
    syncHomeFavoritesButtons();
    await hydrateFavoritesFromAccount(saved);
    if (typeof hydrateCartFromAccount === "function") {
      await hydrateCartFromAccount(saved);
    }
    updateAuthButton();
    closeAuthModal();
    showAuthMessage("", false);
  } catch (error) {
    showAuthMessage(authMode === "register" ? "Помилка збереження даних" : "Користувача не знайдено");
  }
}

// =========================
// 🔹 РЕНДЕР
// =========================
function renderProducts(products) {
  const container = document.getElementById("products");

  if (!container) return;

  container.innerHTML = "";

  products.slice(0, visibleCount).forEach((p) => {
    const div = document.createElement("div");
    div.className = "product";

    div.onclick = () => goToProduct(p.id);

    div.innerHTML = `
      <img src="${API_URL}${p.images?.[0] || ''}">

      <div class="product-content">
        <h3>${p.name || "Без назви"}</h3>
        <div class="price-row">
          <p class="price">${p.price || 0} грн</p>
          <div class="product-price-actions">
            <button class="favorite-btn ${isFavorite(p.id) ? "active" : ""}" onclick='toggleFavorite(event, ${JSON.stringify(p)}, true)'>
              <svg class="heart-icon" viewBox="0 0 512 512" aria-hidden="true">
                <path d="M257 88L255 88C248.355 74.9828 235.475 63.8415 224 55.1304C173.114 16.5016 99.2988 19.267 51 61.2894C-1.26738 106.765 -12.8083 185.773 13.0116 248C25.4527 277.984 45.9981 303.467 67.9105 327C103.494 365.215 144.281 398.581 184 432.421C198.063 444.402 211.938 456.598 226 468.579C233.971 475.37 241.993 483.022 253 483.907C268.121 485.122 278.342 475.197 289 466C306.641 450.778 324.263 435.533 342 420.421C356.437 408.121 370.854 395.797 385 383.166C443.359 331.055 512 269.827 512 185C512 178.072 512.538 170.886 511.715 164C506.476 120.199 486.854 78.636 450 52.7207C401.715 18.7669 334.983 19.4645 288 55.1304C276.525 63.8415 263.645 74.9828 257 88z"></path>
              </svg>
            </button>
            <button class="buy-btn product-card-add-btn" aria-label="Додати в кошик" onclick='buy(event, ${JSON.stringify(p)})'>
              +
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(div);
  });

  const loadMoreWrap = document.querySelector(".load-more");
  if (loadMoreWrap) {
    loadMoreWrap.style.display = "block";
  }
}

// =========================
// 🔹 ПЕРЕХІД
// =========================
function goToProduct(id) {
  window.location.href = "product.html?id=" + id;
}

// =========================
// 🔹 КУПИТИ
// =========================
function buy(e, product) {
  e.stopPropagation();
  addToCart(product);
}

function getFavorites() {
  return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  syncFavoritesToAccount(favorites);
}

function syncFavoritesToAccount(favorites) {
  const profile = getSavedProfile();
  if (!canSyncByProfile(profile) || typeof saveUserFavorites !== "function") return;
  saveUserFavorites(profile, favorites).catch((error) => {
    console.error("Favorites sync failed:", error);
  });
}

async function hydrateFavoritesFromAccount(profile = getSavedProfile()) {
  if (!canSyncByProfile(profile) || typeof getUserFavorites !== "function") return;
  try {
    const data = await getUserFavorites(profile);
    const favorites = Array.isArray(data?.items) ? data.items : [];
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    renderFavoritesList();
    syncHomeFavoritesButtons();
    if (allProducts.length) {
      renderProducts(currentFiltered.length ? currentFiltered : allProducts);
    }
    if (typeof applyCatalogFilters === "function") {
      void applyCatalogFilters();
    }
  } catch (error) {
    console.error("Favorites hydrate failed:", error);
    localStorage.setItem(FAVORITES_STORAGE_KEY, "[]");
    renderFavoritesList();
    syncHomeFavoritesButtons();
    if (allProducts.length) {
      renderProducts(currentFiltered.length ? currentFiltered : allProducts);
    }
    if (typeof applyCatalogFilters === "function") {
      void applyCatalogFilters();
    }
  }
}

function isFavorite(productId) {
  return getFavorites().some((item) => Number(item.id) === Number(productId));
}

function syncHomeFavoritesButtons() {
  const buttons = document.querySelectorAll(".product-fav[data-product-id]");
  if (!buttons.length) return;
  buttons.forEach((button) => {
    const productId = Number(button.getAttribute("data-product-id"));
    if (!Number.isFinite(productId)) return;
    button.classList.toggle("active", isFavorite(productId));
  });
}

function pulseHeaderFavoritesBtn() {
  const icon = document.querySelector("#favoritesBtn .heart-icon");
  if (!icon) return;
  clearTimeout(icon._favPulseTimer);
  icon.classList.remove("favorites-heart--pulse");
  void icon.offsetWidth;
  icon.classList.add("favorites-heart--pulse");
  const cleanup = () => {
    clearTimeout(icon._favPulseTimer);
    icon._favPulseTimer = 0;
    icon.classList.remove("favorites-heart--pulse");
  };
  icon.addEventListener("animationend", cleanup, { once: true });
  icon._favPulseTimer = setTimeout(cleanup, 480);
}
window.pulseHeaderFavoritesBtn = pulseHeaderFavoritesBtn;

function toggleFavorite(e, product, pulseHeader) {
  e.stopPropagation();
  let favorites = getFavorites();
  const exists = favorites.some((item) => Number(item.id) === Number(product.id));

  if (exists) {
    favorites = favorites.filter((item) => Number(item.id) !== Number(product.id));
  } else {
    favorites.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0] || product.image || ""
    });
  }

  saveFavorites(favorites);
  renderProducts(currentFiltered.length ? currentFiltered : allProducts);
  renderFavoritesList();
  syncHomeFavoritesButtons();
  if (typeof applyCatalogFilters === "function") {
    void applyCatalogFilters();
  }
  if (pulseHeader) {
    pulseHeaderFavoritesBtn();
  }
}

function toggleFavorites(open) {
  const sidebar = document.getElementById("favoritesSidebar");
  const overlay = document.getElementById("favoritesOverlay");
  const chatRoot = document.getElementById("chatWidgetRoot");
  const navPanel = document.getElementById("headerNavPanel");
  const navToggle = document.getElementById("navToggle");
  if (!sidebar || !overlay) return;

  if (open) {
    if (navPanel) navPanel.classList.remove("is-open");
    if (navToggle) {
      navToggle.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
    document.body.classList.remove("header-nav-open");
    sidebar.classList.add("active");
    overlay.classList.add("active");
    if (chatRoot) {
      chatRoot.style.visibility = "hidden";
      chatRoot.style.pointerEvents = "none";
      chatRoot.style.opacity = "0";
      chatRoot.style.zIndex = "997";
    }
    renderFavoritesList();
  } else {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    if (chatRoot && !document.body.classList.contains("cart-open")) {
      chatRoot.style.visibility = "";
      chatRoot.style.pointerEvents = "";
      chatRoot.style.opacity = "";
      chatRoot.style.zIndex = "";
    }
  }
}

function renderFavoritesList() {
  const container = document.getElementById("favoritesItems");
  if (!container) return;

  const favorites = getFavorites();
  container.innerHTML = "";

  if (!favorites.length) {
    container.innerHTML = "<p style='text-align:center;'>Немає обраних товарів</p>";
    return;
  }

  favorites.forEach((item) => {
    const div = document.createElement("div");
    div.className = "cart-item";
    const imageSrc = resolveProductImageSrc(item);
    div.innerHTML = `
      <img src="${imageSrc}" alt="${item.name}">

      <div class="cart-info">
        <h4>${item.name}</h4>
        <p>${item.price} грн</p>
      </div>

      <button type="button" class="remove-btn" data-id="${item.id}" aria-label="Прибрати з обраного">✖</button>
    `;

    div.addEventListener("click", () => goToProduct(item.id));
    const removeBtn = div.querySelector(".remove-btn");
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(event, item);
    });

    container.appendChild(div);
  });
}

function resolveProductImageSrc(item) {
  const candidate = item?.image || item?.images?.[0] || "";
  if (!candidate) return "images/favicon.png";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return `${API_URL}${candidate}`;
}

function clearFavorites() {
  saveFavorites([]);
  renderFavoritesList();
  syncHomeFavoritesButtons();
  renderProducts(currentFiltered.length ? currentFiltered : allProducts);
  if (typeof applyCatalogFilters === "function") {
    void applyCatalogFilters();
  }
}

// =========================
// 🔹 ПОШУК (логіка)
// =========================
function searchProducts(products, query) {
  if (!query) return products;

  const words = query.toLowerCase().trim().split(" ");

  return products.filter(p => {
    const name = p.name?.toLowerCase() || "";
    return words.every(word => name.includes(word));
  });
}

// =========================
// 🔹 LIVE ПОШУК UI
// =========================
const searchInput = document.getElementById("search");
const searchResults = document.getElementById("searchResults");

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const value = searchInput.value.trim();

    if (!value) {
      searchResults.style.display = "none";
      return;
    }

    const filtered = searchProducts(allProducts, value);

    renderSearchResults(filtered.slice(0, 5), value);
  });
}

// =========================
// 🔹 РЕНДЕР SEARCH
// =========================
function renderSearchResults(products, query) {
  if (!searchResults) return;

  searchResults.innerHTML = "";

  if (products.length === 0) {
    searchResults.innerHTML = "<p style='padding:10px'>Нічого не знайдено</p>";
    searchResults.style.display = "block";
    return;
  }

  products.forEach(p => {
    const div = document.createElement("div");
    div.className = "search-item";

    div.onclick = () => goToProduct(p.id);

    div.innerHTML = `
      <img src="${API_URL}${p.images?.[0] || ''}">
      <div>
        <h4>${p.name}</h4>
        <p>${p.price} грн</p>
      </div>
    `;

    searchResults.appendChild(div);
  });

  const more = document.createElement("a");
  more.className = "search-more";
  more.href = `catalog.html?q=${encodeURIComponent(query.trim())}`;
  more.textContent = "Дивитися всі результати";

  searchResults.appendChild(more);

  searchResults.style.display = "block";
}

// =========================
// 🔹 ЗАКРИТТЯ SEARCH
// =========================
document.addEventListener("click", (e) => {
  if (!document.querySelector(".search-box")?.contains(e.target)) {
    if (searchResults) searchResults.style.display = "none";
  }
});

// =========================
// 🔹 КАТЕГОРІЇ
// =========================
function initCategoryTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      currentCategory = tab.dataset.cat;

      applyFilters();
    };
  });
}

function normalizeCategoryToken(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  if (raw === "all" || raw === "всі" || raw === "все") return "all";
  if (["інструменти", "инструменты"].includes(raw)) return "tools";
  if (["корпуси", "корпусы"].includes(raw)) return "cases";
  if (["циклони", "циклоны"].includes(raw)) return "cyclones";
  if (["іграшки", "игрушки"].includes(raw)) return "toys";
  if (["брелоки"].includes(raw)) return "keychains";
  if (["інше", "другое"].includes(raw)) return "other";
  return raw;
}

// =========================
// 🔹 ФІЛЬТР
// =========================
function applyFilters() {
  let filtered = [...allProducts];

  if (normalizeCategoryToken(currentCategory) === "all") {
    filtered = shuffleArray(filtered);
  } else {
    const selectedCategory = normalizeCategoryToken(currentCategory);
    filtered = filtered.filter(p =>
      normalizeCategoryToken(p.category) === selectedCategory
    );
  }

  currentFiltered = filtered;

  renderProducts(filtered);
}

// =========================
// 🔹 SHUFFLE
// =========================
function shuffleArray(array) {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function scrollToCatalogFromHash() {
  if (!window.location.hash || !window.location.hash.startsWith("#catalog")) return;
  const catalog = document.getElementById("catalog");
  if (!catalog) return;

  setTimeout(() => {
    const headerHeight = document.querySelector(".header")?.offsetHeight || 80;
    const offset = headerHeight + 18;
    const top = catalog.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, 60);
}

function openFavoritesFromHash() {
  const raw = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (raw !== "favorites" && raw !== "obrani") return;
  if (typeof toggleFavorites !== "function") return;
  requestAnimationFrame(() => {
    toggleFavorites(true);
  });
}

function initHeroCarousel() {
  const root = document.querySelector(".hero-carousel");
  if (!root) return;
  const slides = [...root.querySelectorAll(".hero-slide")];
  const dotsRoot = root.querySelector(".hero-carousel-dots");
  const prev = root.querySelector(".hero-carousel-prev");
  const next = root.querySelector(".hero-carousel-next");
  if (!slides.length || !dotsRoot) return;

  let idx = slides.findIndex((el) => el.classList.contains("is-active"));
  if (idx < 0) idx = 0;

  dotsRoot.innerHTML = "";
  slides.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hero-carousel-dot";
    b.setAttribute("aria-label", "Слайд " + (i + 1));
    b.addEventListener("click", () => goTo(i));
    dotsRoot.appendChild(b);
  });

  const dotEls = () => [...dotsRoot.querySelectorAll(".hero-carousel-dot")];

  function goTo(i) {
    idx = (i + slides.length) % slides.length;
    slides.forEach((el, j) => el.classList.toggle("is-active", j === idx));
    dotEls().forEach((d, j) => d.classList.toggle("is-active", j === idx));
  }

  if (prev) prev.addEventListener("click", () => goTo(idx - 1));
  if (next) next.addEventListener("click", () => goTo(idx + 1));

  let timer = null;
  const stopAuto = () => {
    clearInterval(timer);
    timer = null;
  };
  const startAuto = () => {
    stopAuto();
    timer = setInterval(() => goTo(idx + 1), 7000);
  };

  startAuto();
  root.addEventListener("mouseenter", stopAuto);
  root.addEventListener("mouseleave", startAuto);

  // Дозволяємо вертикальний скрол, але додаємо свайп по горизонталі.
  root.style.touchAction = "pan-y";
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoveX = 0;
  let touchMoveY = 0;
  let touchActive = false;

  root.addEventListener(
    "touchstart",
    (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoveX = touchStartX;
      touchMoveY = touchStartY;
      touchActive = true;
      stopAuto();
    },
    { passive: true }
  );

  root.addEventListener(
    "touchmove",
    (event) => {
      if (!touchActive || !event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchMoveX = touch.clientX;
      touchMoveY = touch.clientY;
      const dx = touchMoveX - touchStartX;
      const dy = touchMoveY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  root.addEventListener("touchend", () => {
    if (!touchActive) return;
    const dx = touchMoveX - touchStartX;
    const dy = touchMoveY - touchStartY;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      goTo(dx < 0 ? idx + 1 : idx - 1);
    }
    touchActive = false;
    startAuto();
  });

  goTo(idx);
}

function initMobileInViewHover() {
  const supportsObserver = typeof window !== "undefined" && "IntersectionObserver" in window;
  if (!supportsObserver) return;
  if (!window.matchMedia("(max-width: 768px)").matches) return;

  const items = Array.from(document.querySelectorAll(".how-item, .print-step"));
  if (!items.length) return;

  const setActive = (activeEl) => {
    items.forEach((item) => item.classList.toggle("is-in-view", item === activeEl));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      setActive(visible[0].target);
    },
    {
      root: null,
      threshold: [0.35, 0.55, 0.75],
      rootMargin: "-14% 0px -26% 0px"
    }
  );

  items.forEach((item) => observer.observe(item));
}

// =========================
// 🔹 СТАРТ
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  initCategoryTabs();
  initAuthEyes();
  const authBtn = document.getElementById("authBtn");
  const authForm = document.getElementById("registerForm");
  const closeAuth = document.getElementById("closeAuthBtn");
  const switchRegisterBtn = document.getElementById("switchRegisterBtn");
  const switchLoginBtn = document.getElementById("switchLoginBtn");

  if (authBtn) {
    authBtn.onclick = () => {
      const profile = getSavedProfile();
      if (profile?.id) {
        window.location.href = "cabinet.html";
      } else {
        openAuthModal("login");
      }
    };
  }
  if (closeAuth) closeAuth.onclick = closeAuthModal;
  if (switchRegisterBtn) switchRegisterBtn.onclick = () => openAuthModal("register");
  if (switchLoginBtn) switchLoginBtn.onclick = () => openAuthModal("login");
  if (authForm) authForm.addEventListener("submit", submitAuthForm);
  updateAuthButton();
  hydrateFavoritesFromAccount();
  await loadProducts();
  if (typeof initCatalogPage === "function") {
    initCatalogPage();
  }
  updateCartCount();
  scrollToCatalogFromHash();
  openFavoritesFromHash();
  syncHomeFavoritesButtons();
  initHeroCarousel();
  initMobileInViewHover();
});

// =========================
// 🔹 HOME
// =========================
function goHome() {
  window.location.href = "index.html";
}
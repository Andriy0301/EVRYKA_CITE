console.log("APP LOADED");

// =========================
// 🔹 СТАН
// =========================
let visibleCount = 6;
let allProducts = [];
let currentFiltered = [];
let currentCategory = "all";
let currentSort = "default";
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
    applyFilters();
  } catch (error) {
    console.error("Products load failed:", error);
    allProducts = [];
    applyFilters();
    alert("Не вдалося завантажити товари. Онови сторінку через 2-3 секунди.");
  }
}

function getSavedProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setSavedProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
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
  const registerOnly = document.querySelectorAll(".auth-register-only");
  const terms = document.getElementById("termsCheck");

  const isRegister = authMode === "register";
  if (title) title.innerText = isRegister ? "Create Account" : "Log In";
  if (submitBtn) submitBtn.innerText = isRegister ? "Create Account" : "Log In";
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
    text: "signin_with",
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

  products.slice(0, visibleCount).forEach(p => {
    const div = document.createElement("div");
    div.className = "product";

    div.onclick = () => goToProduct(p.id);

    div.innerHTML = `
      <img src="${API_URL}${p.images?.[0] || ''}">
      <button class="favorite-btn ${isFavorite(p.id) ? "active" : ""}" onclick='toggleFavorite(event, ${JSON.stringify(p)})'>❤</button>

      <div class="product-content">
        <h3>${p.name || "Без назви"}</h3>
        <p class="price">${p.price || 0} грн</p>
      </div>

      <button class="buy-btn" onclick='buy(event, ${JSON.stringify(p)})'>
        Купити
      </button>
    `;

    container.appendChild(div);
  });

  const btn = document.querySelector(".load-more");
  if (btn) {
    btn.style.display = visibleCount >= products.length ? "none" : "block";
  }
}

// =========================
// 🔹 ПОКАЗАТИ ВСЕ
// =========================
function loadMore() {
  visibleCount = currentFiltered.length;
  renderProducts(currentFiltered);

  const btn = document.querySelector(".load-more");
  if (btn) btn.style.display = "none";
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
}

function isFavorite(productId) {
  return getFavorites().some((item) => Number(item.id) === Number(productId));
}

function toggleFavorite(e, product) {
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
}

function toggleFavorites(open) {
  const sidebar = document.getElementById("favoritesSidebar");
  const overlay = document.getElementById("favoritesOverlay");
  if (!sidebar || !overlay) return;

  if (open) {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    renderFavoritesList();
  } else {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
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
    div.className = "favorite-item";
    div.innerHTML = `
      <img src="${API_URL}${item.image}" alt="${item.name}">
      <div style="flex:1;">
        <h4 style="margin:0 0 4px;">${item.name}</h4>
        <p style="margin:0;">${item.price} грн</p>
      </div>
      <button class="remove-btn" data-id="${item.id}">✖</button>
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

  const more = document.createElement("div");
  more.className = "search-more";
  more.innerText = "Дивитися всі результати →";

more.onclick = () => {
  const filtered = searchProducts(allProducts, query);

  currentFiltered = filtered;
  visibleCount = filtered.length; // 🔥 показати всі

  renderProducts(filtered);

  searchResults.style.display = "none";

  // 🔥 СКРОЛ ДО КАТАЛОГУ
  const catalog = document.getElementById("catalog");

  if (catalog) {
    catalog.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
};
document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

const catalogTab = document.querySelector('[data-cat="all"]');
if (catalogTab) catalogTab.classList.add("active");

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

// =========================
// 🔹 ФІЛЬТР
// =========================
function applyFilters() {
  let filtered = [...allProducts];

  if (currentCategory === "all") {
    filtered = shuffleArray(filtered);
  } else {
    filtered = filtered.filter(p =>
      p.category?.toLowerCase().trim() === currentCategory.toLowerCase().trim()
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

// =========================
// 🔹 СТАРТ
// =========================
document.addEventListener("DOMContentLoaded", () => {
  initCategoryTabs();
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
  loadProducts();
  updateCartCount();
});

// =========================
// 🔹 HOME
// =========================
function goHome() {
  window.location.href = "index.html";
}
document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

const catalogTab = document.querySelector('[data-cat="all"]');
if (catalogTab) catalogTab.classList.add("active");
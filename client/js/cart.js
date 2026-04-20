// =========================
// 🔹 LOCAL STORAGE
// =========================

function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  syncCartToAccount(cart);
}

function getCurrentProfileForCart() {
  try {
    return JSON.parse(localStorage.getItem("userProfile") || "null");
  } catch {
    return null;
  }
}

function canSyncCart(profile) {
  return Boolean(profile?.id || profile?.email || profile?.phone);
}

function syncCartToAccount(cart) {
  const profile = getCurrentProfileForCart();
  if (!canSyncCart(profile) || typeof saveUserCart !== "function") return;
  saveUserCart(profile, cart).catch((error) => {
    console.error("Cart sync failed:", error);
  });
}

async function hydrateCartFromAccount(profile = getCurrentProfileForCart()) {
  if (!canSyncCart(profile) || typeof getUserCart !== "function") return;
  try {
    const data = await getUserCart(profile);
    const serverItems = Array.isArray(data?.items) ? data.items : [];
    const localItems = getCart();

    // Якщо на сервері порожньо, але локально вже є товари (наприклад, після свіжого логіну),
    // не стираємо локальний кошик, а синхронізуємо його на сервер.
    if (serverItems.length === 0 && localItems.length > 0) {
      syncCartToAccount(localItems);
      return;
    }

    localStorage.setItem("cart", JSON.stringify(serverItems));
    updateCartCount();
    const sidebar = document.getElementById("cartSidebar");
    if (sidebar?.classList.contains("active")) {
      renderCart();
    }
  } catch (_) {
    // silent fallback to local cart
  }
}


// =========================
// 🔹 ДОДАТИ В КОШИК
// =========================

function addToCart(product, qty = 1) {
  let cart = getCart();

  const existing = cart.find(p => p.id === product.id);

  if (existing) {
    existing.qty += Number(qty);
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: Number(qty),
      image: product.images?.[0] || ""
    });
  }

  saveCart(cart);
}


// =========================
// 🔹 ВІДКРИТИ / ЗАКРИТИ
// =========================

function toggleCart(open) {
  const sidebar = document.getElementById("cartSidebar");
  const overlay = document.getElementById("cartOverlay");
  const chatRoot = document.getElementById("chatWidgetRoot");
  const navPanel = document.getElementById("headerNavPanel");
  const navToggle = document.getElementById("navToggle");

  if (open) {
    if (navPanel) navPanel.classList.remove("is-open");
    if (navToggle) {
      navToggle.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
    document.body.classList.remove("header-nav-open");

    if (sidebar) sidebar.classList.add("active");
    if (overlay) overlay.classList.add("active");
    if (sidebar) {
      document.body.classList.add("cart-open");
      if (chatRoot) {
        chatRoot.style.visibility = "hidden";
        chatRoot.style.pointerEvents = "none";
        chatRoot.style.opacity = "0";
        chatRoot.style.zIndex = "997";
      }
    }
    renderCart();
  } else {
    if (sidebar) sidebar.classList.remove("active");
    if (overlay) overlay.classList.remove("active");
    document.body.classList.remove("cart-open");
    if (chatRoot) {
      chatRoot.style.visibility = "";
      chatRoot.style.pointerEvents = "";
      chatRoot.style.opacity = "";
      chatRoot.style.zIndex = "";
    }
  }
}


// =========================
// 🔹 РЕНДЕР КОШИКА
// =========================

function renderCart() {
  const cart = getCart();
  const container = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");

  container.innerHTML = "";
  let total = 0;

  if (cart.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>Кошик порожній</p>";
    totalEl.innerText = 0;
    return;
  }

  cart.forEach((item, i) => {
    const qty = item.qty || 1;
    total += item.price * qty;

    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <img src="${API_URL}${item.image}" />

      <div class="cart-info">
        <h4>${item.name}</h4>
        <p>${item.price} грн</p>

        <div class="qty-wrapper cart-qty-wrapper">

  <button type="button" onclick="changeQty(${i}, -1)" class="qty-btn" aria-label="Зменшити кількість">
    <svg viewBox="0 0 24 24">
      <path d="M5 12h14"/>
    </svg>
  </button>

  <input 
    type="number" 
    value="${qty}" 
    min="1"
    class="qty-input"
    onchange="setQty(${i}, this.value)"
  >

  <button type="button" onclick="changeQty(${i}, 1)" class="qty-btn" aria-label="Збільшити кількість">
    <svg viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  </button>

</div>
      </div>

      <button class="remove-btn" onclick="removeFromCart(${i})">✖</button>
    `;

    container.appendChild(div);
  });

  totalEl.innerText = total;
}


// =========================
// 🔹 ЗМІНА КІЛЬКОСТІ (+ / -)
// =========================

function changeQty(index, delta) {
  let cart = getCart();

  cart[index].qty += delta;

  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }

  saveCart(cart);
  renderCart();
}


// =========================
// 🔹 ВВІД КІЛЬКОСТІ ВРУЧНУ
// =========================

function setQty(index, value) {
  let cart = getCart();

  let qty = parseInt(value);

  if (isNaN(qty) || qty < 1) qty = 1;
  if (qty > 99) qty = 99;

  cart[index].qty = qty;

  saveCart(cart);
  renderCart();
}


// =========================
// 🔹 ВИДАЛИТИ ТОВАР
// =========================

function removeFromCart(index) {
  let cart = getCart();

  cart.splice(index, 1);

  saveCart(cart);
  renderCart();
}


// =========================
// 🔹 ОЧИСТИТИ КОШИК
// =========================

function clearCart() {
  localStorage.removeItem("cart");
  renderCart();
  updateCartCount();
  syncCartToAccount([]);
}


// =========================
// 🔹 ЛІЧИЛЬНИК В ІКОНЦІ
// =========================

function updateCartCount() {
  const cart = getCart();

  let total = 0;
  cart.forEach(item => {
    total += item.qty;
  });

  const el = document.getElementById("cartCount");
  if (el) el.innerText = total;
}

async function checkout() {
  const cart = getCart();
  if (cart.length === 0) {
    return;
  }

  localStorage.setItem("checkoutItems", JSON.stringify(cart));
  window.location.href = "order.html";
}

document.addEventListener("DOMContentLoaded", () => {
  hydrateCartFromAccount();
});
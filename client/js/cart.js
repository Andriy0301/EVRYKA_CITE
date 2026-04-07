// =========================
// 🔹 LOCAL STORAGE
// =========================

function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
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

  if (open) {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    renderCart();
  } else {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
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

        <div class="cart-qty">

  <button onclick="changeQty(${i}, -1)" class="qty-btn">
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

  <button onclick="changeQty(${i}, 1)" class="qty-btn">
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
    alert("Кошик порожній");
    return;
  }

  const savedProfile = JSON.parse(localStorage.getItem("userProfile") || "null");
  if (!savedProfile) {
    alert("Спочатку увійдіть або зареєструйтесь у хедері");
    return;
  }

  try {
    await trackPopularity(
      cart.map((item) => ({
        productId: item.id,
        qty: item.qty || 1
      }))
    );

    clearCart();
    toggleCart(false);
    alert("Замовлення прийнято. Популярність товарів оновлено.");
  } catch (error) {
    alert("Не вдалося оформити замовлення");
  }
}
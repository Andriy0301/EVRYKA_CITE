async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id"));

  try {
    const res = await fetch(`${API_URL}/products`);
    const products = await res.json();

    const product = products.find(p => Number(p.id) === id);

    if (!product) {
      document.body.innerHTML = "<h2>Товар не знайдено</h2>";
      return;
    }

    // 🔥 дані
    document.getElementById("title").innerText = product.name;
    document.getElementById("price").innerText = product.price + " грн";
    document.getElementById("description").innerHTML = product.description || "";

    renderGallery(product);

document.getElementById("buyBtn").onclick = () => {
  const qty = document.getElementById("qty").value;

  addToCart(product, qty);
  toggleCart(true);

  const btn = document.getElementById("buyBtn");
  btn.innerText = "Додано ✓";

  setTimeout(() => {
    btn.innerText = "КУПИТИ";
  }, 1500);
};

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>Помилка завантаження</h2>";
  }
}

// 🔥 галерея
function renderGallery(product) {
  const mainImage = document.getElementById("mainImage");
  const thumbnails = document.getElementById("thumbnails");

  thumbnails.innerHTML = "";

  if (!product.images || product.images.length === 0) return;

  mainImage.src = `${API_URL}${product.images[0]}`;

  product.images.forEach((img, i) => {
    const el = document.createElement("img");
    el.src = `${API_URL}${img}`;

    if (i === 0) {
      el.style.border = "2px solid #2c4a6b";
    }

    el.onclick = () => {
      mainImage.src = `${API_URL}${img}`;

      document.querySelectorAll(".thumbnails img").forEach(t => {
        t.style.border = "2px solid transparent";
      });

      el.style.border = "2px solid #2c4a6b";
    };

    thumbnails.appendChild(el);
  });
}


// 🛒 кошик
function addToCart(product, qty = 1) {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];

  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: qty
    });
  }

  localStorage.setItem("cart", JSON.stringify(cart));
}

// ➕➖ кількість
function changeProductQty(val) {
  const input = document.getElementById("qty");

  let current = Number(input.value);

  if (!current || current < 1) current = 1;

  let next = current + val;

  if (next < 1) next = 1;

  input.value = next;
}

document.addEventListener("DOMContentLoaded", () => {
  loadProduct();
  updateCartCount(); // 🔥 ось це виправляє проблему
});

function goBack() {
  window.history.back();
}
document.getElementById("breadcrumbTitle").innerText = product.name;

// якщо є category
if (product.category) {
  document.getElementById("productCategory").innerText = product.category;
} else {
  document.getElementById("productCategory").innerText = "Товари";
}
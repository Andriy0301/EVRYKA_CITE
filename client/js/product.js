async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id"));

  try {
    const products = await getProducts();

    const product = products.find(p => Number(p.id) === id);

    if (!product) {
      document.body.innerHTML = "<h2>Товар не знайдено</h2>";
      return;
    }

    // 🔥 дані
    document.getElementById("title").innerText = product.name;
    document.getElementById("breadcrumbTitle").innerText = product.name;
    document.getElementById("productCategory").innerText = product.category || "Товари";
    document.getElementById("price").innerText = product.price + " грн";
    const descHtml = product.description || "";
    document.getElementById("description").innerHTML = descHtml;
    const descAccordion = document.getElementById("productDescAccordion");
    if (descAccordion) {
      descAccordion.style.display = descHtml.trim() ? "" : "none";
    }

    renderGallery(product);
    renderSimilarProducts(product, products);
    setupProductFavorite(product);
    setupDescriptionToggle();

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

document.getElementById("quickCheckoutBtn").onclick = () => {
  const qty = Number(document.getElementById("qty").value || 1);
  const checkoutItem = {
    id: product.id,
    name: product.name,
    price: product.price,
    qty: qty < 1 ? 1 : qty,
    image: product.images?.[0] || ""
  };
  localStorage.setItem("checkoutItems", JSON.stringify([checkoutItem]));
  window.location.href = "order.html";
};

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>Помилка завантаження</h2>";
  }
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("favorites")) || [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites) {
  localStorage.setItem("favorites", JSON.stringify(favorites));
}

function isFavorite(productId) {
  return getFavorites().some((item) => Number(item.id) === Number(productId));
}

function setupDescriptionToggle() {
  const btn = document.getElementById("productDescToggle");
  const panel = document.getElementById("productDescPanel");
  if (!btn || !panel || btn.dataset.descBound) return;
  btn.dataset.descBound = "1";

  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    const next = !open;
    btn.setAttribute("aria-expanded", String(next));
    if (next) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "");
    }
  });
}

function setupProductFavorite(product) {
  const btn = document.getElementById("productFavoriteBtn");
  if (!btn) return;

  const syncState = () => {
    btn.classList.toggle("active", isFavorite(product.id));
  };

  btn.onclick = () => {
    const favorites = getFavorites();
    const index = favorites.findIndex((item) => Number(item.id) === Number(product.id));

    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      favorites.push(product);
    }

    saveFavorites(favorites);
    syncState();
  };

  syncState();
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
      el.style.border = "2px solid #111";
    }

    el.onclick = () => {
      mainImage.src = `${API_URL}${img}`;

      document.querySelectorAll(".thumbnails img").forEach(t => {
        t.style.border = "2px solid transparent";
      });

      el.style.border = "2px solid #111";
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

function renderSimilarProducts(currentProduct, allProducts) {
  const container = document.getElementById("similarProducts");
  const prevBtn = document.getElementById("similarPrev");
  const nextBtn = document.getElementById("similarNext");
  if (!container) return;

  const sameCategory = allProducts.filter((p) => {
    return p.id !== currentProduct.id && p.category === currentProduct.category;
  });

  const mixed = sameCategory.sort(() => Math.random() - 0.5).slice(0, 8);
  container.innerHTML = "";

  if (!mixed.length) {
    container.innerHTML = "<p>Схожих товарів поки немає</p>";
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
    return;
  }

  mixed.forEach((p) => {
    const card = document.createElement("div");
    card.className = "similar-card";
    card.innerHTML = `
      <img src="${API_URL}${p.images?.[0] || ""}" alt="${p.name}">
      <h4>${p.name}</h4>
      <p>${p.price} грн</p>
    `;
    card.addEventListener("click", () => {
      window.location.href = `product.html?id=${p.id}`;
    });
    container.appendChild(card);
  });

  const scrollStep = 260;
  const updateArrowState = () => {
    if (!prevBtn || !nextBtn) return;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    prevBtn.disabled = container.scrollLeft <= 2;
    nextBtn.disabled = container.scrollLeft >= maxScroll - 2;
  };

  if (prevBtn) {
    prevBtn.style.display = "flex";
    prevBtn.disabled = true;
    prevBtn.onclick = () => {
      container.scrollBy({ left: -scrollStep, behavior: "smooth" });
    };
  }
  if (nextBtn) {
    nextBtn.style.display = "flex";
    nextBtn.onclick = () => {
      container.scrollBy({ left: scrollStep, behavior: "smooth" });
    };
  }

  container.addEventListener("scroll", updateArrowState, { passive: true });
  window.addEventListener("resize", updateArrowState);
  setTimeout(updateArrowState, 0);
}
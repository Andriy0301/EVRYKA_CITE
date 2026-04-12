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
    renderDiscoverProducts(product, products);
    setupProductFavorite(product);
    setupProductAddToCart(product);
    setupDescriptionToggle();

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
    if (typeof window.pulseHeaderFavoritesBtn === "function") {
      window.pulseHeaderFavoritesBtn();
    }
  };

  syncState();
}

function setupProductAddToCart(product) {
  const btn = document.getElementById("productAddToCartBtn");
  if (!btn) return;

  btn.onclick = () => {
    const qty = Math.max(1, Number(document.getElementById("qty").value || 1));
    addToCart(product, qty);
    toggleCart(true);
    btn.classList.remove("product-cart-btn--added");
    void btn.offsetWidth;
    btn.classList.add("product-cart-btn--added");
    clearTimeout(btn._addedTimer);
    btn._addedTimer = setTimeout(() => {
      btn.classList.remove("product-cart-btn--added");
    }, 900);
  };
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
    if (i === 0) el.classList.add("thumb-active");

    el.onclick = () => {
      mainImage.src = `${API_URL}${img}`;
      document.querySelectorAll(".thumbnails img").forEach((t) => t.classList.remove("thumb-active"));
      el.classList.add("thumb-active");
    };

    thumbnails.appendChild(el);
  });
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

  const backBtn = document.getElementById("productBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }
});

const SIMILAR_RAIL_SCROLL_STEP = 260;

function shuffleInPlace(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderSimilarProductCards(container, items) {
  items.forEach((p) => {
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
}

function bindSimilarRailScroll(container, prevBtn, nextBtn) {
  if (!container) return;

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
      container.scrollBy({ left: -SIMILAR_RAIL_SCROLL_STEP, behavior: "smooth" });
    };
  }
  if (nextBtn) {
    nextBtn.style.display = "flex";
    nextBtn.onclick = () => {
      container.scrollBy({ left: SIMILAR_RAIL_SCROLL_STEP, behavior: "smooth" });
    };
  }

  container.addEventListener("scroll", updateArrowState, { passive: true });
  window.addEventListener("resize", updateArrowState);
  setTimeout(updateArrowState, 0);
}

function renderSimilarProducts(currentProduct, allProducts) {
  const container = document.getElementById("similarProducts");
  const prevBtn = document.getElementById("similarPrev");
  const nextBtn = document.getElementById("similarNext");
  if (!container) return;

  const sameCategory = allProducts.filter((p) => {
    return p.id !== currentProduct.id && p.category === currentProduct.category;
  });

  const mixed = shuffleInPlace(sameCategory).slice(0, 8);
  container.innerHTML = "";

  if (!mixed.length) {
    container.innerHTML = "<p>Схожих товарів поки немає</p>";
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
    return;
  }

  renderSimilarProductCards(container, mixed);
  bindSimilarRailScroll(container, prevBtn, nextBtn);
}

function renderDiscoverProducts(currentProduct, allProducts) {
  const section = document.getElementById("discoverSection");
  const container = document.getElementById("discoverProducts");
  const prevBtn = document.getElementById("discoverPrev");
  const nextBtn = document.getElementById("discoverNext");
  if (!section || !container) return;

  const currentCat = String(currentProduct.category || "").trim();
  const fromOtherCategories = allProducts.filter((p) => {
    if (p.id === currentProduct.id) return false;
    return String(p.category || "").trim() !== currentCat;
  });

  const otherCategoryLabels = [
    ...new Set(fromOtherCategories.map((p) => String(p.category || "").trim()).filter(Boolean))
  ];

  if (!otherCategoryLabels.length) {
    section.setAttribute("hidden", "");
    return;
  }

  const pickCat = otherCategoryLabels[Math.floor(Math.random() * otherCategoryLabels.length)];
  const pool = fromOtherCategories.filter((p) => String(p.category || "").trim() === pickCat);
  const items = shuffleInPlace(pool).slice(0, 8);

  container.innerHTML = "";
  section.removeAttribute("hidden");
  renderSimilarProductCards(container, items);
  bindSimilarRailScroll(container, prevBtn, nextBtn);
}
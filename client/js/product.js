const SITE_ORIGIN = "https://evryka3d.com";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/images/text_logo.png`;

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function ensureMetaProperty(property, content) {
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function ensureMetaName(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function ensureCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function resolveOgImage(product) {
  const raw = product?.images?.[0];
  if (!raw) return DEFAULT_OG_IMAGE;
  const s = String(raw);
  if (/^https?:\/\//i.test(s)) return s;
  if (typeof API_URL !== "undefined" && API_URL) {
    return `${API_URL}${s.startsWith("/") ? s : "/" + s}`;
  }
  return s.startsWith("/") ? SITE_ORIGIN + s : `${SITE_ORIGIN}/${s}`;
}

/** Абсолютний URL зображення товару для JSON-LD / OG */
function resolveProductImageUrl(raw) {
  if (!raw) return null;
  const s = String(raw);
  if (/^https?:\/\//i.test(s)) return s;
  if (typeof API_URL !== "undefined" && API_URL) {
    return `${API_URL}${s.startsWith("/") ? s : "/" + s}`;
  }
  return s.startsWith("/") ? SITE_ORIGIN + s : `${SITE_ORIGIN}/${s}`;
}

function removeProductJsonLd() {
  document.querySelectorAll('script[type="application/ld+json"][data-evryka-product-schema]').forEach((el) => {
    el.remove();
  });
}

/**
 * Product schema (JSON-LD) для Google Shopping / Merchant Center та rich results.
 */
function applyProductJsonLd(product, id) {
  removeProductJsonLd();

  const canonicalUrl = `${SITE_ORIGIN}/product?id=${encodeURIComponent(id)}`;
  const name = String(product?.name || "Товар").trim();
  let description = stripHtml(product?.description || "").trim();
  if (!description) {
    description = `${name} — 3D-друк EVRYKA. Доставка Новою Поштою по Україні.`;
  }

  const imageUrls = Array.isArray(product?.images)
    ? product.images.map((img) => resolveProductImageUrl(img)).filter(Boolean)
    : [];
  if (imageUrls.length === 0) {
    imageUrls.push(DEFAULT_OG_IMAGE);
  }

  const priceNum = Number(product?.price);
  const priceOk = Number.isFinite(priceNum) && priceNum >= 0;

  const availability =
    product?.availability === "https://schema.org/OutOfStock" ||
    product?.availability === "OutOfStock" ||
    product?.inStock === false
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: imageUrls.length === 1 ? imageUrls[0] : imageUrls,
    sku: String(id),
    url: canonicalUrl,
    brand: {
      "@type": "Brand",
      name: "EVRYKA"
    },
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "UAH",
      price: priceOk ? priceNum : 0,
      availability,
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "EVRYKA",
        url: SITE_ORIGIN
      }
    }
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.setAttribute("data-evryka-product-schema", "1");
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

function applyProductSeo(product, id) {
  const name = String(product?.name || "Товар").trim();
  const rawDesc = stripHtml(product?.description || "");
  let desc = rawDesc.slice(0, 155);
  if (rawDesc.length > 155) desc += "…";
  if (!desc) desc = `${name} — 3D-друк EVRYKA. Доставка Новою Поштою по Україні.`;

  document.title = `${name} — купити в EVRYKA`;
  ensureMetaName("description", desc);
  ensureMetaProperty("og:type", "website");
  ensureMetaProperty("og:title", `${name} | EVRYKA`);
  ensureMetaProperty("og:description", desc);
  const canonicalUrl = `${SITE_ORIGIN}/product?id=${encodeURIComponent(id)}`;
  ensureCanonical(canonicalUrl);
  ensureMetaProperty("og:url", canonicalUrl);
  const ogImg = resolveOgImage(product);
  ensureMetaProperty("og:image", ogImg);
  ensureMetaName("twitter:title", `${name} | EVRYKA`);
  ensureMetaName("twitter:description", desc);
  ensureMetaName("twitter:image", ogImg);
}

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

    applyProductSeo(product, id);
    applyProductJsonLd(product, id);

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
    const apiReviews = await getProductReviews(product.id);
    renderReviews(product, apiReviews);
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
  window.location.href = "/order";
};

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>Помилка завантаження</h2>";
  }
}

async function getProductReviews(productId) {
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(String(productId))}/reviews`, {
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
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
  const mainImageWrap = mainImage?.closest(".main-image");

  thumbnails.innerHTML = "";

  if (!product.images || product.images.length === 0) return;

  let currentImageIndex = 0;
  const altBase = String(product?.name || "Товар EVRYKA").trim();

  const setActiveImage = (nextIndex) => {
    if (!Array.isArray(product.images) || !product.images.length) return;
    const clamped = Math.max(0, Math.min(product.images.length - 1, Number(nextIndex) || 0));
    currentImageIndex = clamped;
    mainImage.src = `${API_URL}${product.images[currentImageIndex]}`;
    mainImage.alt = `${altBase} — головне фото`;
    document.querySelectorAll(".thumbnails img").forEach((thumb, idx) => {
      thumb.classList.toggle("thumb-active", idx === currentImageIndex);
    });
  };

  setActiveImage(0);

  product.images.forEach((img, i) => {
    const el = document.createElement("img");
    el.src = `${API_URL}${img}`;
    el.alt = `${altBase} — мініатюра ${i + 1}`;
    if (i === 0) el.classList.add("thumb-active");

    el.onclick = () => {
      setActiveImage(i);
    };

    thumbnails.appendChild(el);
  });

  if (!mainImageWrap || mainImageWrap.dataset.swipeBound === "1") return;
  mainImageWrap.dataset.swipeBound = "1";

  let startX = 0;
  let startY = 0;
  let moveX = 0;
  let moveY = 0;
  let swipeActive = false;
  const SWIPE_MIN_DISTANCE = 40;

  mainImageWrap.addEventListener(
    "touchstart",
    (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      moveX = startX;
      moveY = startY;
      swipeActive = true;
    },
    { passive: true }
  );

  mainImageWrap.addEventListener(
    "touchmove",
    (event) => {
      if (!swipeActive || !event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      moveX = touch.clientX;
      moveY = touch.clientY;
      const dx = moveX - startX;
      const dy = moveY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  mainImageWrap.addEventListener("touchend", () => {
    if (!swipeActive) return;
    const dx = moveX - startX;
    const dy = moveY - startY;
    if (Math.abs(dx) >= SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.2) {
      const direction = dx < 0 ? 1 : -1;
      const nextIndex = (currentImageIndex + direction + product.images.length) % product.images.length;
      setActiveImage(nextIndex);
    }
    swipeActive = false;
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
      window.location.href = `/product?id=${p.id}`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderStars(rating) {
  const safeRating = Math.max(1, Math.min(5, Number(rating) || 5));
  return "★".repeat(safeRating) + "☆".repeat(5 - safeRating);
}

function renderReviews(product, apiReviews = []) {
  const list = document.getElementById("reviewsList");
  if (!list) return;

  const reviews = Array.isArray(apiReviews) && apiReviews.length
    ? apiReviews
    : (Array.isArray(product?.reviews) ? product.reviews : []);
  if (!reviews.length) {
    list.innerHTML = `
      <article class="review-card review-card--empty">
        <p class="review-empty-title">Поки що немає відгуків</p>
        <p class="review-empty-text">Станьте першим, хто поділиться враженнями про цей товар.</p>
      </article>
    `;
    return;
  }

  list.innerHTML = reviews
    .map((review) => {
      const author = escapeHtml(review?.author || "Покупець");
      const text = escapeHtml(review?.text || "");
      const date = escapeHtml(review?.date || "");
      const stars = renderStars(review?.rating);
      return `
        <article class="review-card">
          <div class="review-head">
            <strong class="review-author">${author}</strong>
            <span class="review-rating" aria-label="Оцінка ${stars}">${stars}</span>
          </div>
          ${date ? `<div class="review-date">${date}</div>` : ""}
          <p class="review-text">${text}</p>
        </article>
      `;
    })
    .join("");
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
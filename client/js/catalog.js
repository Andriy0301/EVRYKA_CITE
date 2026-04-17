let catalogPopularList = null;
/** Якщо задано (з URL ?cats=...), показуємо товари з кількох категорій одночасно */
let catalogMultiCats = null;
/** Текстовий пошук з URL (?q=...) після переходу з живого пошуку в шапці */
let catalogTextQuery = "";
const CATALOG_FILTERS_STORAGE_KEY = "catalogFiltersState";
let catalogFiltersStateReady = false;

function readCatalogFiltersState() {
  try {
    const raw = sessionStorage.getItem(CATALOG_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCatalogFiltersState() {
  const sortEl = document.getElementById("catalogSort");
  const catEl = document.getElementById("catalogFilterCategory");
  const minEl = document.getElementById("catalogPriceMin");
  const maxEl = document.getElementById("catalogPriceMax");

  const state = {
    sort: String(sortEl?.value || "default"),
    category: String(catEl?.value || "all"),
    min: String(minEl?.value || "").trim(),
    max: String(maxEl?.value || "").trim(),
    multiCats: Array.isArray(catalogMultiCats) ? catalogMultiCats : null,
    textQuery: String(catalogTextQuery || "").trim()
  };
  sessionStorage.setItem(CATALOG_FILTERS_STORAGE_KEY, JSON.stringify(state));
}

function clearCatalogFiltersState() {
  sessionStorage.removeItem(CATALOG_FILTERS_STORAGE_KEY);
}

function hasSelectOption(selectEl, value) {
  if (!selectEl) return false;
  return Array.from(selectEl.options || []).some((opt) => String(opt?.value || "") === String(value || ""));
}

function getCatalogCategories(products) {
  const set = new Set();
  (products || []).forEach((p) => {
    const c = String(p?.category || "").trim();
    if (c) set.add(c);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
}

function catalogPriceBounds(products) {
  let min = Infinity;
  let max = 0;
  (products || []).forEach((p) => {
    const n = Number(p?.price || 0);
    if (Number.isFinite(n)) {
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
  });
  if (!Number.isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}

async function ensureCatalogPopularList() {
  if (catalogPopularList) return catalogPopularList;
  try {
    catalogPopularList = await getProducts("popular");
  } catch {
    catalogPopularList = Array.isArray(allProducts) ? [...allProducts] : [];
  }
  return catalogPopularList;
}

function renderCatalogGrid(products) {
  const container = document.getElementById("catalogPageGrid");
  if (!container) return;

  container.innerHTML = "";

  if (!products.length) {
    container.innerHTML = "<p class=\"catalog-empty\">Немає товарів за обраними фільтрами.</p>";
    return;
  }

  products.forEach((p) => {
    const div = document.createElement("div");
    div.className = "product";
    div.onclick = () => goToProduct(p.id);

    div.innerHTML = `
      <img src="${API_URL}${p.images?.[0] || ""}" alt="">

      <div class="product-content">
        <h3>${p.name || "Без назви"}</h3>
        <div class="price-row">
          <p class="price">${p.price || 0} грн</p>
          <button class="favorite-btn ${isFavorite(p.id) ? "active" : ""}" onclick='toggleFavorite(event, ${JSON.stringify(p)}, true)'>
            <svg class="heart-icon" viewBox="0 0 512 512" aria-hidden="true">
              <path d="M257 88L255 88C248.355 74.9828 235.475 63.8415 224 55.1304C173.114 16.5016 99.2988 19.267 51 61.2894C-1.26738 106.765 -12.8083 185.773 13.0116 248C25.4527 277.984 45.9981 303.467 67.9105 327C103.494 365.215 144.281 398.581 184 432.421C198.063 444.402 211.938 456.598 226 468.579C233.971 475.37 241.993 483.022 253 483.907C268.121 485.122 278.342 475.197 289 466C306.641 450.778 324.263 435.533 342 420.421C356.437 408.121 370.854 395.797 385 383.166C443.359 331.055 512 269.827 512 185C512 178.072 512.538 170.886 511.715 164C506.476 120.199 486.854 78.636 450 52.7207C401.715 18.7669 334.983 19.4645 288 55.1304C276.525 63.8415 263.645 74.9828 257 88z"></path>
            </svg>
          </button>
        </div>
      </div>

      <button class="buy-btn" onclick='buy(event, ${JSON.stringify(p)})'>
        Купити
      </button>
    `;

    container.appendChild(div);
  });
}

async function applyCatalogFilters() {
  if (!document.getElementById("catalogPageGrid")) return;

  const sortEl = document.getElementById("catalogSort");
  const catEl = document.getElementById("catalogFilterCategory");
  const minEl = document.getElementById("catalogPriceMin");
  const maxEl = document.getElementById("catalogPriceMax");

  const sort = sortEl?.value || "default";
  let list = [];

  if (sort === "popular") {
    list = [...(await ensureCatalogPopularList())];
  } else {
    list = Array.isArray(allProducts) ? [...allProducts] : [];
    if (sort === "price_asc") {
      list.sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0));
    } else if (sort === "price_desc") {
      list.sort((a, b) => Number(b?.price || 0) - Number(a?.price || 0));
    }
  }

  const cat = catEl?.value || "all";
  if (cat === "__multi__" && catalogMultiCats && catalogMultiCats.length > 0) {
    list = list.filter((p) =>
      catalogMultiCats.some(
        (c) =>
          String(p?.category || "").toLowerCase().trim() === String(c).toLowerCase().trim()
      )
    );
  } else if (cat && cat !== "all") {
    list = list.filter(
      (p) => String(p?.category || "").toLowerCase().trim() === String(cat).toLowerCase().trim()
    );
  }

  const minP = parseFloat(String(minEl?.value || "").replace(",", "."));
  const maxP = parseFloat(String(maxEl?.value || "").replace(",", "."));
  if (Number.isFinite(minP)) {
    list = list.filter((p) => Number(p?.price || 0) >= minP);
  }
  if (Number.isFinite(maxP)) {
    list = list.filter((p) => Number(p?.price || 0) <= maxP);
  }

  if (catalogTextQuery && typeof searchProducts === "function") {
    list = searchProducts(list, catalogTextQuery);
  }

  renderCatalogGrid(list);
  if (catalogFiltersStateReady) {
    writeCatalogFiltersState();
  }
}

function initCatalogFilterControls() {
  const sortEl = document.getElementById("catalogSort");
  const catEl = document.getElementById("catalogFilterCategory");
  const minEl = document.getElementById("catalogPriceMin");
  const maxEl = document.getElementById("catalogPriceMax");
  const resetBtn = document.getElementById("catalogResetFilters");

  [sortEl, catEl, minEl, maxEl].forEach((el) => {
    if (el) {
      el.addEventListener("change", () => applyCatalogFilters());
      if (el === minEl || el === maxEl) {
        el.addEventListener("input", () => applyCatalogFilters());
      }
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (sortEl) sortEl.value = "default";
      if (catEl) {
        catEl.querySelector('option[value="__multi__"]')?.remove();
        catEl.value = "all";
        catalogMultiCats = null;
      }
      if (minEl) minEl.value = "";
      if (maxEl) maxEl.value = "";
      clearCatalogFiltersState();
      document.querySelectorAll(".catalog-select-wrap").forEach((w) => syncCatalogSelectUI(w));
      applyCatalogFilters();
    });
  }

  if (catEl) {
    catEl.addEventListener("change", () => {
      if (catEl.value !== "__multi__") {
        catalogMultiCats = null;
        catEl.querySelector('option[value="__multi__"]')?.remove();
        const wrap = catEl.closest(".catalog-select-wrap");
        if (wrap) syncCatalogSelectUI(wrap);
      }
    });
  }
}

function initCatalogPage() {
  if (!document.getElementById("catalogPageGrid")) return;
  catalogFiltersStateReady = false;

  initCatalogCustomSelect("catalogSort");

  const products = Array.isArray(allProducts) ? allProducts : [];
  const params = new URLSearchParams(window.location.search);
  const savedState = readCatalogFiltersState();
  const urlTextQuery = (params.get("q") || "").trim();
  catalogTextQuery = String(savedState?.textQuery || "").trim();
  if (urlTextQuery) {
    catalogTextQuery = urlTextQuery;
  }
  const headerSearch = document.getElementById("search");
  if (headerSearch && catalogTextQuery) {
    headerSearch.value = catalogTextQuery;
  } else if (headerSearch) {
    headerSearch.value = "";
  }

  const catsParam = params.get("cats");
  const hasCatsInUrl = Boolean(catsParam);
  if (hasCatsInUrl) {
    catalogMultiCats = catsParam.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    catalogMultiCats = Array.isArray(savedState?.multiCats) ? savedState.multiCats.filter(Boolean) : null;
  }

  const shouldRestoreSavedState = Boolean(savedState);
  if (shouldRestoreSavedState) {
    if (headerSearch) headerSearch.value = catalogTextQuery;
  }

  const catSelect = document.getElementById("catalogFilterCategory");
  if (catSelect) {
    const categories = getCatalogCategories(products);
    catSelect.innerHTML = `<option value="all">Усі категорії</option>`;
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      catSelect.appendChild(opt);
    });
    if (catalogMultiCats && catalogMultiCats.length > 0) {
      const opt = document.createElement("option");
      opt.value = "__multi__";
      opt.textContent = "Іграшки та брелоки";
      catSelect.appendChild(opt);
      catSelect.value = "__multi__";
    }

    if (shouldRestoreSavedState) {
      const savedCategory = String(savedState.category || "all");
      if (hasCatsInUrl) {
        catSelect.value = "__multi__";
      } else if (savedCategory === "__multi__" && catalogMultiCats && catalogMultiCats.length > 0) {
        catSelect.value = "__multi__";
      } else if (savedCategory !== "__multi__" && hasSelectOption(catSelect, savedCategory)) {
        catSelect.value = savedCategory;
      } else {
        catSelect.value = "all";
      }
    }
  }

  initCatalogCustomSelect("catalogFilterCategory");

  const { min, max } = catalogPriceBounds(products);
  const minEl = document.getElementById("catalogPriceMin");
  const maxEl = document.getElementById("catalogPriceMax");
  if (minEl && Number.isFinite(min)) minEl.placeholder = `від ${min}`;
  if (maxEl && Number.isFinite(max)) maxEl.placeholder = `до ${max}`;
  if (shouldRestoreSavedState) {
    const savedSort = String(savedState.sort || "default");
    const sortEl = document.getElementById("catalogSort");
    if (sortEl && hasSelectOption(sortEl, savedSort)) {
      sortEl.value = savedSort;
    }
    if (minEl) minEl.value = String(savedState.min || "");
    if (maxEl) maxEl.value = String(savedState.max || "");
  }

  initCatalogFilterControls();
  document.querySelectorAll(".catalog-select-wrap").forEach((w) => syncCatalogSelectUI(w));
  catalogFiltersStateReady = true;
  applyCatalogFilters();

  const backBtn = document.getElementById("catalogBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }
}

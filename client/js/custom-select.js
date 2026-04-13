/**
 * Кастомний випадаючий список (прихований native select + тригер + панель).
 * Використовується на сторінці каталогу та в формах кабінету / замовлення.
 */
function closeAllCatalogSelects() {
  document.querySelectorAll(".catalog-select-wrap.is-open").forEach((wrap) => {
    wrap.classList.remove("is-open");
    const trigger = wrap.querySelector(".catalog-select-trigger");
    const panel = wrap.querySelector(".catalog-select-panel");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (panel) panel.hidden = true;
  });
}

function syncCatalogSelectUI(wrap) {
  const select = wrap.querySelector("select.catalog-filter-select-native");
  if (!select) return;
  const valueSpan = wrap.querySelector(".catalog-select-value");
  const opt = select.selectedOptions[0];
  if (valueSpan && opt) valueSpan.textContent = opt.textContent;
  wrap.querySelectorAll(".catalog-select-option").forEach((li) => {
    const sel = li.dataset.value === select.value;
    li.classList.toggle("is-selected", sel);
    li.setAttribute("aria-selected", sel ? "true" : "false");
  });
}

function rebuildCatalogSelectPanel(wrap) {
  const select = wrap.querySelector("select.catalog-filter-select-native");
  const panel = wrap.querySelector(".catalog-select-panel");
  if (!select || !panel) return;
  panel.innerHTML = "";
  Array.from(select.options).forEach((opt) => {
    const li = document.createElement("li");
    li.className = "catalog-select-option";
    li.setAttribute("role", "option");
    li.dataset.value = opt.value;
    li.textContent = opt.textContent;
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.dataset.justSelectedAt = String(Date.now());
      if (select.value !== opt.value) {
        select.value = opt.value;
        syncCatalogSelectUI(wrap);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      closeAllCatalogSelects();
    });
    panel.appendChild(li);
  });
  syncCatalogSelectUI(wrap);
}

function bindCatalogSelectOutsideOnce() {
  if (window.__catalogSelectOutsideBound) return;
  window.__catalogSelectOutsideBound = true;
  document.addEventListener("click", () => closeAllCatalogSelects());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllCatalogSelects();
  });
}

function initCatalogCustomSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return () => {};
  const wrap = select.closest(".catalog-select-wrap");
  if (!wrap) return () => {};
  const trigger = wrap.querySelector(".catalog-select-trigger");
  const panel = wrap.querySelector(".catalog-select-panel");
  if (!trigger || !panel) return () => {};

  function rebuild() {
    rebuildCatalogSelectPanel(wrap);
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const justSelectedAt = Number(wrap.dataset.justSelectedAt || "0");
    if (Date.now() - justSelectedAt < 250) {
      delete wrap.dataset.justSelectedAt;
      return;
    }
    const wasOpen = wrap.classList.contains("is-open");
    closeAllCatalogSelects();
    if (!wasOpen) {
      wrap.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      panel.hidden = false;
    }
  });

  bindCatalogSelectOutsideOnce();
  rebuild();
  return rebuild;
}

(function () {
  function buildMobileBottomNav(toggle, panel, closeNavRef, openNavRef) {
    if (document.getElementById("mobileBottomNav")) return;

    const nav = document.createElement("nav");
    nav.id = "mobileBottomNav";
    nav.className = "mobile-bottom-nav";
    nav.setAttribute("aria-label", "Швидке нижнє меню");

    nav.innerHTML =
      '<a href="catalog.html" class="mobile-bottom-nav__item" data-item="catalog">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
      "<span>Каталог</span>" +
      "</a>" +
      '<button type="button" class="mobile-bottom-nav__item" data-item="favorites" aria-label="Відкрити обране">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4l-1.05-.95C6.9 15.8 4 13.2 4 9.95 4 7.35 6.02 5.4 8.55 5.4c1.45 0 2.84.68 3.45 1.77.61-1.09 2-1.77 3.45-1.77C17.98 5.4 20 7.35 20 9.95c0 3.25-2.9 5.85-6.95 9.5L12 20.4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "<span>Обране</span>" +
      "</button>" +
      '<button type="button" class="mobile-bottom-nav__item mobile-bottom-nav__item--cart" data-item="cart" aria-label="Відкрити кошик">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 7H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>' +
      "<span>Кошик</span>" +
      '<span class="mobile-bottom-nav__badge" id="mobileBottomCartCount">0</span>' +
      "</button>" +
      '<button type="button" class="mobile-bottom-nav__item" data-item="more" aria-label="Відкрити меню">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      "<span>Ще</span>" +
      "</button>";

    document.body.appendChild(nav);
    document.body.classList.add("has-mobile-bottom-nav");

    let moreSheet = document.getElementById("mobileMoreSheet");
    if (!moreSheet) {
      moreSheet = document.createElement("div");
      moreSheet.id = "mobileMoreSheet";
      moreSheet.className = "mobile-more-sheet";
      moreSheet.setAttribute("aria-hidden", "true");
      moreSheet.innerHTML =
        '<button type="button" class="mobile-more-sheet__backdrop" aria-label="Закрити меню"></button>' +
        '<div class="mobile-more-sheet__panel" role="dialog" aria-modal="true" aria-label="Додаткове меню">' +
        '<div class="mobile-more-sheet__head">' +
        '<strong>Меню</strong>' +
        '<button type="button" class="mobile-more-sheet__close" aria-label="Закрити меню">×</button>' +
        "</div>" +
        '<a href="index.html" class="mobile-more-sheet__link">Головна</a>' +
        '<a href="catalog.html" class="mobile-more-sheet__link">Каталог</a>' +
        '<a href="about.html" class="mobile-more-sheet__link">Про нас</a>' +
        '<a href="order-3d-print.html" class="mobile-more-sheet__link">Замовити 3D друк</a>' +
        '<a href="cabinet.html" class="mobile-more-sheet__link">Кабінет</a>' +
        '<a href="index.html#contacts" class="mobile-more-sheet__link">Контакти</a>' +
        "</div>";
      document.body.appendChild(moreSheet);
    }

    const closeMoreSheet = function () {
      document.body.classList.remove("mobile-more-open");
      if (moreSheet) moreSheet.setAttribute("aria-hidden", "true");
    };

    const openMoreSheet = function () {
      closeNavRef(toggle, panel);
      document.body.classList.add("mobile-more-open");
      if (moreSheet) moreSheet.setAttribute("aria-hidden", "false");
    };

    const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    const activeItem =
      path === "catalog.html" || path === "product.html"
        ? "catalog"
        : path === "cabinet.html"
          ? "more"
          : null;
    if (activeItem) {
      const activeNode = nav.querySelector('[data-item="' + activeItem + '"]');
      if (activeNode) activeNode.classList.add("is-active");
    }

    const favoritesBtn = nav.querySelector('[data-item="favorites"]');
    favoritesBtn?.addEventListener("click", function () {
      closeNavRef(toggle, panel);
      if (typeof window.toggleFavorites === "function") window.toggleFavorites(true);
    });

    const cartBtn = nav.querySelector('[data-item="cart"]');
    cartBtn?.addEventListener("click", function () {
      closeNavRef(toggle, panel);
      if (typeof window.toggleCart === "function") window.toggleCart(true);
    });

    const moreBtn = nav.querySelector('[data-item="more"]');
    moreBtn?.addEventListener("click", function () {
      if (document.body.classList.contains("mobile-more-open")) closeMoreSheet();
      else openMoreSheet();
    });

    moreSheet?.querySelector(".mobile-more-sheet__backdrop")?.addEventListener("click", closeMoreSheet);
    moreSheet?.querySelector(".mobile-more-sheet__close")?.addEventListener("click", closeMoreSheet);
    moreSheet?.querySelectorAll(".mobile-more-sheet__link").forEach(function (link) {
      link.addEventListener("click", closeMoreSheet);
    });

    const mobileCount = document.getElementById("mobileBottomCartCount");
    const desktopCount = document.getElementById("cartCount");
    const syncCount = function () {
      const value = Number(desktopCount?.textContent || 0) || 0;
      if (mobileCount) {
        mobileCount.textContent = String(value);
        mobileCount.hidden = value < 1;
      }
    };
    syncCount();
    if (desktopCount) {
      new MutationObserver(syncCount).observe(desktopCount, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  function closeNav(toggle, panel) {
    if (!toggle || !panel) return;
    panel.classList.remove("is-open");
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("header-nav-open");
  }

  function openNav(toggle, panel) {
    panel.classList.add("is-open");
    toggle.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("header-nav-open");

    const firstInteractive = panel.querySelector("a, button, input, [tabindex]:not([tabindex='-1'])");
    if (firstInteractive) {
      firstInteractive.focus({ preventScroll: true });
    }
  }

  function init() {
    const toggle = document.getElementById("navToggle");
    const panel = document.getElementById("headerNavPanel");
    if (!toggle || !panel) return;
    buildMobileBottomNav(toggle, panel, closeNav, openNav);

    toggle.addEventListener("click", function () {
      if (panel.classList.contains("is-open")) closeNav(toggle, panel);
      else openNav(toggle, panel);
    });

    panel.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        closeNav(toggle, panel);
      });
    });

    document.addEventListener("click", function (event) {
      if (!panel.classList.contains("is-open")) return;
      const target = event.target;
      const mobileNav = document.getElementById("mobileBottomNav");
      if (
        panel.contains(target) ||
        toggle.contains(target) ||
        (mobileNav && mobileNav.contains(target))
      ) {
        return;
      }
      closeNav(toggle, panel);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeMoreSheet();
      closeNav(toggle, panel);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) {
        closeNav(toggle, panel);
        closeMoreSheet();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

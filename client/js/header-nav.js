(function () {
  function buildMobileBottomNav(toggle, panel, closeNavRef, openNavRef) {
    if (document.getElementById("mobileBottomNav")) return;

    const nav = document.createElement("nav");
    nav.id = "mobileBottomNav";
    nav.className = "mobile-bottom-nav";
    nav.setAttribute("aria-label", "Швидке нижнє меню");

    nav.innerHTML =
      '<a href="catalog.html" class="mobile-bottom-nav__item" data-item="catalog">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      "<span>Каталог</span>" +
      "</a>" +
      '<button type="button" class="mobile-bottom-nav__item" data-item="favorites" aria-label="Відкрити обране">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.7-4.35-9.33-8.17C.6 9.94 2.2 6 6.05 6c2.2 0 3.5 1.28 3.95 2.18C10.45 7.28 11.75 6 13.95 6 17.8 6 19.4 9.94 21.33 12.83 18.7 16.65 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
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
      if (panel.classList.contains("is-open")) closeNavRef(toggle, panel);
      else openNavRef(toggle, panel);
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
      closeNav(toggle, panel);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) closeNav(toggle, panel);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

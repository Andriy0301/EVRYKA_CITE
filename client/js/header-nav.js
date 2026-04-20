(function () {
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
      if (panel.contains(target) || toggle.contains(target)) return;
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

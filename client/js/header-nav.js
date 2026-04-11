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

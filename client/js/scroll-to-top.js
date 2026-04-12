(function () {
  "use strict";

  if (!document.body.classList.contains("page-catalog")) return;
  if (document.getElementById("scrollToTopBtn")) return;

  /** Висота документа для обчислення «докрутив майже до низу». */
  function documentScrollHeight() {
    const b = document.body;
    const e = document.documentElement;
    return Math.max(
      b.scrollHeight,
      b.offsetHeight,
      e.clientHeight,
      e.scrollHeight,
      e.offsetHeight
    );
  }

  /** Показувати лише коли залишилось ≈ не більше 18% висоти вікна або 120px до низу (що менше). */
  function isNearPageBottom() {
    const winH = window.innerHeight;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const docH = documentScrollHeight();
    const maxScroll = Math.max(0, docH - winH);
    if (maxScroll <= 0) return false;
    const margin = Math.max(120, Math.round(winH * 0.18));
    return scrollY >= maxScroll - margin;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "scrollToTopBtn";
  btn.className = "scroll-to-top-btn";
  btn.setAttribute("aria-label", "Повернутися вгору");
  btn.title = "Повернутися вгору";
  btn.hidden = true;
  btn.setAttribute("aria-hidden", "true");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M5 12l7-7 7 7"/>' +
    "</svg>";
  document.body.appendChild(btn);

  function sync() {
    const show = isNearPageBottom();
    btn.hidden = !show;
    btn.setAttribute("aria-hidden", show ? "false" : "true");
  }

  btn.addEventListener("click", function () {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  var t;
  window.addEventListener(
    "scroll",
    function () {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(sync, 60);
    },
    { passive: true }
  );

  var rt;
  window.addEventListener(
    "resize",
    function () {
      if (rt) window.clearTimeout(rt);
      rt = window.setTimeout(sync, 120);
    },
    { passive: true }
  );
  sync();
})();

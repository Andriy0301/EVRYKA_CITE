(function () {
  const suspiciousPattern = /[ÃÂÊÐÑÒÓÎÏÇËÌÍÐÏÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]|пїЅ|�/;
  const cyrillicPattern = /[А-Яа-яІіЇїЄєҐґ]/g;
  const latinPattern = /[A-Za-z]/g;
  const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("windows-1251") : null;
  if (!decoder) return;

  function scoreText(text) {
    const cyr = (text.match(cyrillicPattern) || []).length;
    const lat = (text.match(latinPattern) || []).length;
    return cyr - lat * 0.2;
  }

  function decodeLatin1To1251(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code > 255) return text;
      bytes[i] = code;
    }
    return decoder.decode(bytes);
  }

  function fixText(value) {
    if (!value || typeof value !== "string") return value;
    let nextValue = value;
    if (nextValue.includes("�")) {
      // Hard requirement: never show replacement symbol on UI.
      nextValue = nextValue.replace(/�+/g, "");
      nextValue = nextValue.replace(/\s{2,}/g, " ").trim();
    }
    if (!suspiciousPattern.test(nextValue)) return nextValue;
    if (nextValue.includes("пїЅ")) return nextValue;
    const decoded = decodeLatin1To1251(nextValue);
    if (!decoded || decoded === nextValue) return nextValue;
    if (decoded.includes("\uFFFD")) return nextValue;

    const beforeScore = scoreText(nextValue);
    const afterScore = scoreText(decoded);
    return afterScore > beforeScore + 1 ? decoded : nextValue;
  }

  function fixElementText(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const original = node.nodeValue;
    const fixed = fixText(original);
    if (fixed !== original) node.nodeValue = fixed;
  }

  function fixElementAttributes(el) {
    if (!(el instanceof Element)) return;
    const attrs = ["title", "placeholder", "aria-label", "alt"];
    attrs.forEach((attr) => {
      const val = el.getAttribute(attr);
      if (!val) return;
      const fixed = fixText(val);
      if (fixed !== val) el.setAttribute(attr, fixed);
    });
    if (el.tagName === "OPTION") {
      const val = el.textContent;
      const fixed = fixText(val);
      if (fixed !== val) el.textContent = fixed;
    }
  }

  function walkAndFix(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) fixElementText(walker.currentNode);
    root.querySelectorAll("*").forEach((el) => fixElementAttributes(el));
  }

  function run() {
    walkAndFix(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        fixElementText(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          fixElementText(node);
          return;
        }
        if (node instanceof Element) {
          fixElementAttributes(node);
          walkAndFix(node);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

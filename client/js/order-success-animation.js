(function initOrderSuccessAnimationModule(global) {
  const DEFAULT_PLACEHOLDER_LABEL = "ITEM";

  function pickImageSource(item) {
    const image = item?.image || item?.images?.[0] || "";
    if (!image) return "";
    if (/^https?:\/\//i.test(image)) return image;
    if (image.startsWith("images/")) return image;
    if (image.startsWith("/")) return image;
    const apiUrl = String(global.API_URL || "").replace(/\/$/, "");
    if (apiUrl) {
      return `${apiUrl}${image}`;
    }
    return image;
  }

  function normalizeItems(items) {
    const source = Array.isArray(items) ? items : [];
    const expanded = [];

    source.forEach((item) => {
      const qty = Math.max(1, Number(item?.qty || 1));
      const repeats = Math.min(qty, 4);
      for (let i = 0; i < repeats; i += 1) {
        expanded.push({
          name: String(item?.name || DEFAULT_PLACEHOLDER_LABEL),
          image: pickImageSource(item)
        });
      }
    });

    return expanded.slice(0, 9);
  }

  class OrderSuccessAnimation {
    constructor(options = {}) {
      this.options = {
        message: "Замовлення оформлено",
        showSkipButton: true,
        exitDirection: "right",
        ...options
      };
      this.root = null;
      this.timeline = null;
      this.resolveCurrent = null;
      this.active = false;
    }

    ensureRoot() {
      if (this.root) return;

      const root = document.createElement("div");
      root.id = "orderSuccessAnimationRoot";
      root.className = "order-success-animation";
      root.innerHTML = `
        <div class="order-success-animation__overlay"></div>
        <button type="button" class="order-success-animation__skip">Пропустити анімацію</button>
        <div class="order-success-animation__scene">
          <div class="order-success-animation__items"></div>
          <div class="order-success-animation__box-wrap">
            <div class="order-success-animation__box-lid"></div>
            <div class="order-success-animation__box-base"></div>
          </div>
          <div class="order-success-animation__message">Замовлення оформлено</div>
        </div>
      `;

      document.body.appendChild(root);
      this.root = root;

      const skipBtn = root.querySelector(".order-success-animation__skip");
      if (skipBtn) {
        skipBtn.addEventListener("click", () => this.finish(true));
      }
    }

    createToken(item, index) {
      const token = document.createElement("div");
      token.className = "order-success-animation__item";
      token.style.setProperty("--token-index", String(index));

      if (item.image) {
        const img = document.createElement("img");
        img.src = item.image;
        img.alt = item.name;
        img.loading = "lazy";
        token.appendChild(img);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = String(item.name || DEFAULT_PLACEHOLDER_LABEL).slice(0, 1).toUpperCase();
        token.appendChild(placeholder);
      }

      return token;
    }

    resetState(messageText, showSkipButton) {
      if (!this.root) return;

      const itemsLayer = this.root.querySelector(".order-success-animation__items");
      const message = this.root.querySelector(".order-success-animation__message");
      const skipBtn = this.root.querySelector(".order-success-animation__skip");
      const lid = this.root.querySelector(".order-success-animation__box-lid");
      const scene = this.root.querySelector(".order-success-animation__scene");
      const overlay = this.root.querySelector(".order-success-animation__overlay");

      if (itemsLayer) itemsLayer.innerHTML = "";
      if (message) {
        message.textContent = messageText;
      }
      if (skipBtn) {
        skipBtn.style.display = showSkipButton ? "inline-flex" : "none";
      }

      this.root.classList.add("is-active");

      if (global.gsap) {
        global.gsap.set(overlay, { opacity: 0 });
        global.gsap.set(scene, { opacity: 0, scale: 0.82, x: 0, y: 0 });
        global.gsap.set(lid, { y: -28, rotateX: -67 });
        global.gsap.set(message, { opacity: 0, y: 20 });
      }
    }

    finish(skipped = false) {
      if (!this.active) return;
      this.active = false;

      if (this.timeline) {
        this.timeline.kill();
        this.timeline = null;
      }

      if (this.root) {
        this.root.classList.remove("is-active");
      }

      if (typeof this.resolveCurrent === "function") {
        this.resolveCurrent({ skipped });
      }
      this.resolveCurrent = null;
    }

    play(config = {}) {
      this.ensureRoot();
      if (!this.root) return Promise.resolve({ skipped: true });
      if (!global.gsap) return Promise.resolve({ skipped: true });

      const message = config.message || this.options.message;
      const showSkipButton = config.showSkipButton ?? this.options.showSkipButton;
      const exitDirection = config.exitDirection || this.options.exitDirection;
      const items = normalizeItems(config.items);

      this.finish(true);
      this.resetState(message, showSkipButton);
      this.active = true;

      const overlay = this.root.querySelector(".order-success-animation__overlay");
      const scene = this.root.querySelector(".order-success-animation__scene");
      const itemsLayer = this.root.querySelector(".order-success-animation__items");
      const boxWrap = this.root.querySelector(".order-success-animation__box-wrap");
      const lid = this.root.querySelector(".order-success-animation__box-lid");
      const info = this.root.querySelector(".order-success-animation__message");

      const tokenNodes = (items.length ? items : [{ name: DEFAULT_PLACEHOLDER_LABEL, image: "" }]).map((item, index) =>
        this.createToken(item, index)
      );
      tokenNodes.forEach((node) => itemsLayer.appendChild(node));

      const radius = Math.max(120, Math.min(window.innerWidth, window.innerHeight) * 0.24);
      tokenNodes.forEach((node, index) => {
        const angle = (Math.PI * 2 * index) / tokenNodes.length;
        const jitter = (Math.random() - 0.5) * 48;
        const startX = Math.cos(angle) * radius + jitter;
        const startY = Math.sin(angle) * radius + jitter;
        const startRotation = (Math.random() - 0.5) * 80;
        global.gsap.set(node, {
          x: startX,
          y: startY,
          rotation: startRotation,
          opacity: 0,
          scale: 0.84
        });
      });

      const exitVars =
        exitDirection === "down"
          ? { x: 0, y: Math.min(window.innerHeight * 0.65, 360) }
          : { x: Math.min(window.innerWidth * 0.65, 440), y: 0 };

      this.timeline = global.gsap.timeline({
        onComplete: () => this.finish(false)
      });

      this.timeline
        .to(overlay, { opacity: 1, duration: 0.22, ease: "power2.out" }, 0)
        .to(scene, { opacity: 1, scale: 1, duration: 0.36, ease: "power3.out" }, 0.08);

      tokenNodes.forEach((node, index) => {
        const endRotation = (Math.random() - 0.5) * 30;
        this.timeline.to(
          node,
          {
            x: 0,
            y: 0,
            scale: 0.24,
            opacity: 0.95,
            rotation: endRotation,
            duration: 0.52,
            ease: "power3.out"
          },
          0.42 + index * 0.06
        );
      });

      const closeStart = 1.1 + tokenNodes.length * 0.03;
      this.timeline
        .to(lid, { y: -4, rotateX: -14, duration: 0.13, ease: "power1.inOut" }, closeStart)
        .to(lid, { y: 0, rotateX: 0, duration: 0.2, ease: "power3.inOut" }, closeStart + 0.13)
        .to(boxWrap, { ...exitVars, duration: 0.36, ease: "power3.in" }, closeStart + 0.26)
        .to(info, { opacity: 1, y: 0, duration: 0.24, ease: "power3.out" }, closeStart + 0.48)
        .to({}, { duration: 0.42 }, closeStart + 0.72);

      return new Promise((resolve) => {
        this.resolveCurrent = resolve;
      });
    }
  }

  global.OrderSuccessAnimation = OrderSuccessAnimation;
})(window);

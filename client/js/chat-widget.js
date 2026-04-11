(function () {
  const root = document.getElementById("chatWidgetRoot");
  const toggle = document.getElementById("chatWidgetToggle");
  const panel = document.getElementById("chatWidgetPanel");
  const closeBtn = document.querySelector(".chat-widget-close");
  const sendBtn = document.getElementById("chatWidgetSend");
  const textEl = document.getElementById("chatWidgetText");
  const statusEl = document.getElementById("chatWidgetStatus");
  const messagesEl = document.getElementById("chatWidgetMessages");

  const WELCOME_LOGGED_IN = "Добрий день, можете задавати будь які запитання";
  const WELCOME_GUEST =
    "Добрий день, можете задавати будь які запитання, але спершу увійдіть або зареєструйтесь, щоб ми могли з вами зв'язатися.";
  const PROFILE_KEY = "userProfile";

  if (!toggle || !panel || !root) return;

  function isLoggedIn() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      return Boolean(p?.id);
    } catch {
      return false;
    }
  }

  function getWelcomeText() {
    return isLoggedIn() ? WELCOME_LOGGED_IN : WELCOME_GUEST;
  }

  function getProfileContacts() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return {};
      const p = JSON.parse(raw);
      const email = String(p?.email || "").trim();
      const phone = String(p?.phone || "").trim();
      const name = [p?.name, p?.lastName].filter(Boolean).join(" ").trim();
      return {
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(name ? { name } : {})
      };
    } catch {
      return {};
    }
  }

  function appendBubble(kind, text) {
    if (!messagesEl) return;
    const bubble = document.createElement("div");
    bubble.className =
      kind === "user" ? "chat-widget-msg chat-widget-msg-user" : "chat-widget-msg chat-widget-msg-bot";
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function seedWelcome() {
    if (!messagesEl || messagesEl.dataset.welcomePlaced === "1") return;
    appendBubble("bot", getWelcomeText());
    messagesEl.dataset.welcomePlaced = "1";
    messagesEl.dataset.welcomeFor = isLoggedIn() ? "in" : "out";
  }

  function syncWelcomeIfOnlyGreeting() {
    if (!messagesEl || messagesEl.dataset.welcomePlaced !== "1") return;
    const kids = messagesEl.querySelectorAll(".chat-widget-msg");
    if (kids.length !== 1 || !kids[0].classList.contains("chat-widget-msg-bot")) return;
    const want = isLoggedIn() ? "in" : "out";
    if (messagesEl.dataset.welcomeFor === want) return;
    kids[0].textContent = getWelcomeText();
    messagesEl.dataset.welcomeFor = want;
  }

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      seedWelcome();
      syncWelcomeIfOnlyGreeting();
      textEl?.focus();
    }
  }

  function showStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  seedWelcome();

  toggle.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
  closeBtn?.addEventListener("click", () => setOpen(false));

  document.addEventListener("mousedown", (e) => {
    if (!panel.classList.contains("is-open")) return;
    if (!root.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("is-open")) {
      setOpen(false);
    }
  });

  textEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn?.click();
    }
  });

  sendBtn?.addEventListener("click", async () => {
    const message = textEl?.value?.trim() || "";

    if (message.length < 3) {
      showStatus("Введіть запитання (мінімум 3 символи).", true);
      return;
    }

    showStatus("", false);
    sendBtn.disabled = true;

    appendBubble("user", message);

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          page: typeof location !== "undefined" ? location.href : "",
          ...getProfileContacts()
        })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Не вдалося надіслати");
      }

      if (textEl) textEl.value = "";
      appendBubble(
        "bot",
        "Дякуємо! Ми отримали ваше повідомлення і відповімо найближчим часом."
      );
    } catch (err) {
      showStatus(err.message || "Помилка з’єднання. Спробуйте пізніше.", true);
    } finally {
      sendBtn.disabled = false;
    }
  });
})();

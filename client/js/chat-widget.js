(function () {
  const root = document.getElementById("chatWidgetRoot");
  const toggle = document.getElementById("chatWidgetToggle");
  const panel = document.getElementById("chatWidgetPanel");
  const closeBtn = document.querySelector(".chat-widget-close");
  const sendBtn = document.getElementById("chatWidgetSend");
  const textEl = document.getElementById("chatWidgetText");
  const statusEl = document.getElementById("chatWidgetStatus");
  const messagesEl = document.getElementById("chatWidgetMessages");

  const WELCOME_TEXT = "Добрий день, можете задавати будь які запитання";

  if (!toggle || !panel || !root) return;

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
    appendBubble("bot", WELCOME_TEXT);
    messagesEl.dataset.welcomePlaced = "1";
  }

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      seedWelcome();
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
          page: typeof location !== "undefined" ? location.href : ""
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

(function () {
  const root = document.getElementById("chatWidgetRoot");
  const toggle = document.getElementById("chatWidgetToggle");
  const panel = document.getElementById("chatWidgetPanel");
  const closeBtn = document.querySelector(".chat-widget-close");
  const sendBtn = document.getElementById("chatWidgetSend");
  const textEl = document.getElementById("chatWidgetText");
  const emailEl = document.getElementById("chatWidgetEmail");
  const statusEl = document.getElementById("chatWidgetStatus");
  const messagesEl = document.getElementById("chatWidgetMessages");

  if (!toggle || !panel || !root) return;

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      textEl?.focus();
    }
  }

  function showStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

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

  sendBtn?.addEventListener("click", async () => {
    const message = textEl?.value?.trim() || "";
    const email = emailEl?.value?.trim() || "";

    if (message.length < 3) {
      showStatus("Введіть запитання (мінімум 3 символи).", true);
      return;
    }

    showStatus("Надсилаємо…", false);
    sendBtn.disabled = true;

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          email: email || undefined,
          page: typeof location !== "undefined" ? location.href : ""
        })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Не вдалося надіслати");
      }

      if (messagesEl) {
        const bubble = document.createElement("div");
        bubble.className = "chat-widget-msg chat-widget-msg-user";
        bubble.textContent = message;
        messagesEl.appendChild(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      if (textEl) textEl.value = "";
      showStatus("Дякуємо! Ми отримали ваше запитання і відповімо найближчим часом.", false);
    } catch (err) {
      showStatus(err.message || "Помилка з’єднання. Спробуйте пізніше.", true);
    } finally {
      sendBtn.disabled = false;
    }
  });
})();

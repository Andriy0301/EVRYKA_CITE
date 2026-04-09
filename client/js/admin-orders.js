function showAdminOrdersMessage(message, isError = true) {
  const el = document.getElementById("adminOrdersMessage");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paymentLabel(value) {
  if (value === "liqpay") return "Оплата LiqPay";
  if (value === "cod") return "Оплата при отриманні";
  return value || "-";
}

function renderAdminOrders(orders) {
  const list = document.getElementById("adminOrdersList");
  if (!list) return;

  if (!Array.isArray(orders) || !orders.length) {
    list.innerHTML = `<div class="admin-order-card">Поки немає замовлень.</div>`;
    return;
  }

  list.innerHTML = orders
    .map((order) => {
      const delivery = order?.customer?.delivery || {};
      const items = (order?.items || [])
        .map((item) => `<li>${escapeHtml(item.name)} x ${Number(item.qty || 1)}</li>`)
        .join("");
      return `
        <article class="admin-order-card">
          <p><b>Номер:</b> ${escapeHtml(order.orderNumber)}</p>
          <p><b>Дата:</b> ${new Date(order.createdAt).toLocaleString("uk-UA")}</p>
          <p><b>Клієнт:</b> ${escapeHtml(order?.customer?.lastName)} ${escapeHtml(order?.customer?.name)}</p>
          <p><b>Телефон:</b> ${escapeHtml(order?.customer?.phone)}</p>
          <p><b>Email:</b> ${escapeHtml(order?.customer?.email)}</p>
          <p><b>Доставка:</b> ${escapeHtml(delivery.provider)} / ${escapeHtml(delivery.deliveryType)}</p>
          <p><b>Оплата:</b> ${escapeHtml(paymentLabel(delivery.paymentMethod || "cod"))}</p>
          <p><b>Місто:</b> ${escapeHtml(delivery.city)}</p>
          <p><b>Точка:</b> ${escapeHtml(delivery.branchText)}</p>
          <p><b>Адреса:</b> ${escapeHtml(delivery.address)}</p>
          <p><b>ТТН:</b> ${escapeHtml(order.ttn || "-")}</p>
          <p><b>Сума:</b> ${Number(order.total || 0)} грн</p>
          <ul>${items}</ul>
        </article>
      `;
    })
    .join("");
}

async function onLoadOrders() {
  const key = document.getElementById("adminKeyInput")?.value?.trim();
  if (!key) {
    showAdminOrdersMessage("Введіть адмін-ключ");
    return;
  }

  try {
    const data = await getAllOrders(key);
    renderAdminOrders(data?.orders || []);
    showAdminOrdersMessage(`Завантажено: ${(data?.orders || []).length}`, false);
  } catch (error) {
    renderAdminOrders([]);
    showAdminOrdersMessage(error.message || "Помилка завантаження");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loadOrdersBtn")?.addEventListener("click", onLoadOrders);
});

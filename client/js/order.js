const PROFILE_STORAGE_KEY = "userProfile";
const CHECKOUT_ITEMS_KEY = "checkoutItems";

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function getCheckoutItems() {
  const direct = JSON.parse(localStorage.getItem(CHECKOUT_ITEMS_KEY) || "[]");
  if (direct.length) return direct;
  return JSON.parse(localStorage.getItem("cart") || "[]");
}

function fillForm(profile) {
  document.getElementById("orderName").value = profile?.name || "";
  document.getElementById("orderLastName").value = profile?.lastName || "";
  document.getElementById("orderPhone").value = profile?.phone || "";
  document.getElementById("orderEmail").value = profile?.email || "";
  document.getElementById("orderProvider").value = profile?.delivery?.provider || "nova_poshta";
  document.getElementById("orderCity").value = profile?.delivery?.city || "";
  document.getElementById("orderBranch").value = profile?.delivery?.branch || "";
  document.getElementById("orderAddress").value = profile?.delivery?.address || "";
}

function renderItems(items) {
  const container = document.getElementById("orderItems");
  const totalEl = document.getElementById("orderTotal");
  container.innerHTML = "";
  let total = 0;

  items.forEach((item) => {
    const qty = Number(item.qty || 1);
    total += Number(item.price || 0) * qty;
    const row = document.createElement("div");
    row.className = "favorite-item";
    row.innerHTML = `
      <img src="${API_URL}${item.image || item.images?.[0] || ""}" alt="${item.name}">
      <div style="flex:1;">
        <h4 style="margin:0 0 4px;">${item.name}</h4>
        <p style="margin:0;">${item.price} грн x ${qty}</p>
      </div>
    `;
    container.appendChild(row);
  });

  totalEl.innerText = total;
}

function showMessage(msg, isError = true) {
  const el = document.getElementById("orderMessage");
  el.innerText = msg;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

async function submitOrder(e) {
  e.preventDefault();
  const items = getCheckoutItems();
  if (!items.length) {
    showMessage("Немає товарів для оформлення");
    return;
  }

  const profile = {
    id: getProfile()?.id,
    name: document.getElementById("orderName").value.trim(),
    lastName: document.getElementById("orderLastName").value.trim(),
    phone: document.getElementById("orderPhone").value.trim(),
    email: document.getElementById("orderEmail").value.trim(),
    delivery: {
      provider: document.getElementById("orderProvider").value,
      city: document.getElementById("orderCity").value.trim(),
      branch: document.getElementById("orderBranch").value.trim(),
      address: document.getElementById("orderAddress").value.trim()
    }
  };

  if (!profile.name || !profile.lastName || !profile.phone || !profile.email) {
    showMessage("Заповніть контактні дані");
    return;
  }

  try {
    if (profile.id) {
      const updated = await updateUserProfile(profile);
      setProfile(updated);
    }
    await trackPopularity(items.map((item) => ({ productId: item.id, qty: item.qty || 1 })));
    localStorage.removeItem(CHECKOUT_ITEMS_KEY);
    localStorage.removeItem("cart");
    showMessage("Замовлення оформлено успішно", false);
  } catch (error) {
    showMessage("Не вдалося оформити замовлення");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const items = getCheckoutItems();
  fillForm(getProfile());
  renderItems(items);
  document.getElementById("orderForm").addEventListener("submit", submitOrder);
});

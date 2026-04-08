const PROFILE_STORAGE_KEY = "userProfile";

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function showCabinetMessage(message = "", isError = true) {
  const el = document.getElementById("cabinetMessage");
  if (!el) return;
  el.innerText = message;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function renderInitials(profile) {
  const initialsEl = document.getElementById("authInitials");
  const authIcon = document.getElementById("authIcon");
  if (!initialsEl) return;
  const first = String(profile?.name || "").trim().charAt(0).toUpperCase();
  const second = String(profile?.lastName || "").trim().charAt(0).toUpperCase();
  const initials = `${first}${second || ""}`;
  if (!initials.trim()) {
    initialsEl.style.display = "none";
    initialsEl.innerText = "";
    if (authIcon) authIcon.style.display = "block";
    return;
  }
  initialsEl.innerText = initials;
  initialsEl.style.display = "flex";
  if (authIcon) authIcon.style.display = "none";
}

function fillCabinet(profile) {
  document.getElementById("cabName").value = profile?.name || "";
  document.getElementById("cabLastName").value = profile?.lastName || "";
  document.getElementById("cabPhone").value = profile?.phone || "";
  document.getElementById("cabEmail").value = profile?.email || "";
  document.getElementById("cabProvider").value = profile?.delivery?.provider || "nova_poshta";
  document.getElementById("cabCity").value = profile?.delivery?.city || "";
  document.getElementById("cabBranch").value = profile?.delivery?.branch || "";
  document.getElementById("cabAddress").value = profile?.delivery?.address || "";
}

async function saveCabinet(e) {
  e.preventDefault();
  const current = getProfile();
  if (!current?.id && !current?.email && !current?.phone) {
    showCabinetMessage("Потрібно увійти в акаунт повторно");
    return;
  }

  const name = document.getElementById("cabName").value.trim();
  const lastName = document.getElementById("cabLastName").value.trim();
  const phone = document.getElementById("cabPhone").value.trim();
  const email = (document.getElementById("cabEmail").value || current?.email || "").trim();

  if (!name || !lastName || !phone || !email) {
    showCabinetMessage("Обов'язкові поля: ім'я, прізвище, телефон, email");
    return;
  }

  const payload = {
    id: current.id,
    email: email,
    name: name,
    lastName: lastName,
    phone: phone,
    delivery: {
      provider: document.getElementById("cabProvider").value,
      city: document.getElementById("cabCity").value.trim(),
      branch: document.getElementById("cabBranch").value.trim(),
      address: document.getElementById("cabAddress").value.trim()
    }
  };

  try {
    const updated = await updateUserProfile(payload);
    setProfile(updated);
    renderInitials(updated);
    showCabinetMessage("Дані профілю збережено", false);
  } catch (error) {
    console.error("Не вдалося зберегти профіль", error);
    showCabinetMessage("Не вдалося зберегти зміни профілю");
  }
}

function logout() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const profile = getProfile();
  if (!profile?.id) {
    window.location.href = "index.html";
    return;
  }

  fillCabinet(profile);
  renderInitials(profile);
  const authBtn = document.getElementById("authBtn");
  if (authBtn) authBtn.addEventListener("click", () => window.location.href = "cabinet.html");
  document.getElementById("cabinetForm").addEventListener("submit", saveCabinet);
  document.getElementById("logoutBtn").addEventListener("click", logout);
});

const PROFILE_STORAGE_KEY = "userProfile";

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function renderInitials(profile) {
  const initialsEl = document.getElementById("authInitials");
  if (!initialsEl) return;
  const first = String(profile?.name || "").trim().charAt(0).toUpperCase();
  const second = String(profile?.lastName || "").trim().charAt(0).toUpperCase();
  const initials = `${first}${second || ""}`;
  if (!initials.trim()) {
    initialsEl.style.display = "none";
    initialsEl.innerText = "";
    return;
  }
  initialsEl.innerText = initials;
  initialsEl.style.display = "flex";
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
  if (!current?.id) {
    window.location.href = "index.html";
    return;
  }

  const payload = {
    id: current.id,
    name: document.getElementById("cabName").value.trim(),
    lastName: document.getElementById("cabLastName").value.trim(),
    phone: document.getElementById("cabPhone").value.trim(),
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
    alert("Профіль оновлено");
  } catch (error) {
    alert("Не вдалося зберегти профіль");
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

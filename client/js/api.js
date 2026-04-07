const API_URL = ""; // важливо — пусто

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getProducts(sort = "default") {
  const query = sort === "popular" ? "?sort=popular" : "";
  const url = `/api/products${query}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      if (attempt === 1) throw error;
      await sleep(1200);
    }
  }
}

async function registerUser(profile) {
  const res = await fetch(`/api/users/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  });

  if (!res.ok) {
    throw new Error("Не вдалося зберегти дані профілю");
  }

  return res.json();
}

async function loginUser(payload) {
  const res = await fetch(`/api/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error("Користувача не знайдено");
  }

  return res.json();
}

async function googleAuthLogin(payload) {
  const res = await fetch(`/api/users/google-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error("Google login failed");
  }

  return res.json();
}

async function trackPopularity(items) {
  const res = await fetch(`/api/popularity/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items })
  });

  if (!res.ok) {
    throw new Error("Не вдалося оновити популярність");
  }

  return res.json();
}
const API_URL = ""; // важливо — пусто
const CITY_SEARCH_CACHE = new Map();
const CITY_SEARCH_PENDING = new Map();
const WAREHOUSE_CACHE = new Map();
const WAREHOUSE_PENDING = new Map();

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

async function updateUserProfile(payload) {
  const res = await fetch(`/api/users/update-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не вдалося оновити профіль");
  }

  return res.json();
}

async function getUserCart(profile) {
  const params = new URLSearchParams();
  if (profile?.id) params.set("id", String(profile.id));
  if (profile?.email) params.set("email", String(profile.email));
  if (profile?.phone) params.set("phone", String(profile.phone));

  const res = await fetch(`/api/users/cart?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не вдалося завантажити кошик");
  }
  return res.json();
}

async function saveUserCart(profile, items) {
  const res = await fetch(`/api/users/cart`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: profile?.id,
      email: profile?.email,
      phone: profile?.phone,
      items: items || []
    })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не вдалося зберегти кошик");
  }

  return res.json();
}

async function getUserFavorites(profile) {
  const params = new URLSearchParams();
  if (profile?.id) params.set("id", String(profile.id));
  if (profile?.email) params.set("email", String(profile.email));
  if (profile?.phone) params.set("phone", String(profile.phone));

  const res = await fetch(`/api/users/favorites?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не вдалося завантажити обрані");
  }
  return res.json();
}

async function saveUserFavorites(profile, items) {
  const res = await fetch(`/api/users/favorites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: profile?.id,
      email: profile?.email,
      phone: profile?.phone,
      items: items || []
    })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не вдалося зберегти обрані");
  }

  return res.json();
}

async function searchNovaPoshtaCities(query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return [];

  if (CITY_SEARCH_CACHE.has(normalizedQuery)) {
    return CITY_SEARCH_CACHE.get(normalizedQuery);
  }

  if (CITY_SEARCH_PENDING.has(normalizedQuery)) {
    return CITY_SEARCH_PENDING.get(normalizedQuery);
  }

  const request = (async () => {
    const res = await fetch(`/api/shipping/nova-poshta/cities?query=${encodeURIComponent(normalizedQuery)}`);
    if (!res.ok) {
      throw new Error("Не вдалося завантажити список міст");
    }
    const data = await res.json();
    CITY_SEARCH_CACHE.set(normalizedQuery, data);
    return data;
  })();

  CITY_SEARCH_PENDING.set(normalizedQuery, request);
  try {
    return await request;
  } finally {
    CITY_SEARCH_PENDING.delete(normalizedQuery);
  }
}

async function getNovaPoshtaWarehouses(cityRef, type = "warehouse") {
  const cacheKey = `${String(cityRef || "").trim()}|${String(type || "warehouse").trim()}`;
  if (!cityRef) return [];

  if (WAREHOUSE_CACHE.has(cacheKey)) {
    return WAREHOUSE_CACHE.get(cacheKey);
  }

  if (WAREHOUSE_PENDING.has(cacheKey)) {
    return WAREHOUSE_PENDING.get(cacheKey);
  }

  const request = (async () => {
    const res = await fetch(
      `/api/shipping/nova-poshta/warehouses?cityRef=${encodeURIComponent(cityRef)}&type=${encodeURIComponent(type)}`
    );
    if (!res.ok) {
      throw new Error("Не вдалося завантажити список відділень");
    }
    const data = await res.json();
    WAREHOUSE_CACHE.set(cacheKey, data);
    return data;
  })();

  WAREHOUSE_PENDING.set(cacheKey, request);
  try {
    return await request;
  } finally {
    WAREHOUSE_PENDING.delete(cacheKey);
  }
}

async function createNovaPoshtaTtn(payload) {
  const res = await fetch(`/api/shipping/nova-poshta/create-ttn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не вдалося створити ТТН");
  }

  return res.json();
}
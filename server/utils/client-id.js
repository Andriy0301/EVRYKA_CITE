const { randomUUID } = require("crypto");

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function buildClientId() {
  return `CL-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function ensureClientIdForUser(user, users = []) {
  if (!user || typeof user !== "object") return user;
  const current = normalizeText(user.clientId);
  if (current) return user;

  const known = new Set(
    (Array.isArray(users) ? users : [])
      .map((x) => normalizeText(x?.clientId))
      .filter(Boolean)
  );

  let next = buildClientId();
  while (known.has(next)) {
    next = buildClientId();
  }
  user.clientId = next;
  return user;
}

function ensureClientIds(users) {
  if (!Array.isArray(users)) return { users: [], changed: false };
  let changed = false;
  users.forEach((user) => {
    const before = normalizeText(user?.clientId);
    ensureClientIdForUser(user, users);
    const after = normalizeText(user?.clientId);
    if (!before && after) changed = true;
  });
  return { users, changed };
}

function findUserByIdentity(users, identity = {}) {
  const list = Array.isArray(users) ? users : [];
  const wantedId = normalizeText(identity.id);
  const wantedClientId = normalizeText(identity.clientId);
  const wantedEmail = normalizeEmail(identity.email);
  const wantedPhone = normalizeText(identity.phone);

  return list.find((user) => {
    const userId = normalizeText(user?.id);
    const userClientId = normalizeText(user?.clientId);
    const userEmail = normalizeEmail(user?.email);
    const userPhone = normalizeText(user?.phone);
    return (
      (wantedClientId && userClientId === wantedClientId) ||
      (wantedId && userId === wantedId) ||
      (wantedEmail && userEmail === wantedEmail) ||
      (wantedPhone && userPhone === wantedPhone)
    );
  }) || null;
}

module.exports = {
  ensureClientIds,
  ensureClientIdForUser,
  findUserByIdentity
};

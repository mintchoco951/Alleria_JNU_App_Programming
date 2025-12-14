const KEYS = {
  USERS: "alleria:users",
  SESSION: "alleria:session",
};

function readJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getUsers() {
  return readJson(KEYS.USERS, []);
}

export function createUser({ id, email, password }) {
  const users = getUsers();
  if (users.some((u) => u.email === email)) throw new Error("이미 존재하는 이메일입니다.");
  const newUser = { id, email, password, createdAt: Date.now() };
  writeJson(KEYS.USERS, [...users, newUser]);
  return { id, email };
}

export function loginUser({ email, password, token }) {
  const users = getUsers();
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
  const session = { token, userId: user.id, email: user.email };
  writeJson(KEYS.SESSION, session);
  return session;
}

export function logoutUser() {
  localStorage.removeItem(KEYS.SESSION);
}

export function getSession() {
  return readJson(KEYS.SESSION, null);
}

export function profileKey(userId) {
  return `alleria:profile:${userId}`;
}

export function scansKey(userId) {
  return `alleria:scans:${userId}`;
}
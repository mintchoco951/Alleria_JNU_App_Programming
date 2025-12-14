export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // fallback
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
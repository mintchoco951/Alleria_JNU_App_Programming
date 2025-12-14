import { scansKey } from "./storage";

function readJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listScans(userId) {
  const scans = readJson(scansKey(userId), []);
  return [...scans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getScan(userId, scanId) {
  const scans = readJson(scansKey(userId), []);
  return scans.find((s) => s.id === scanId) || null;
}

export function saveScan(userId, scan) {
  const scans = readJson(scansKey(userId), []);
  const next = [scan, ...scans];
  writeJson(scansKey(userId), next);
  return scan;
}

export function clearScans(userId) {
  localStorage.removeItem(scansKey(userId));
}
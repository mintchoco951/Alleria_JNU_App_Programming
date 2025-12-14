const inflight = new Map(); // key -> Promise
const cache = new Map();    // key -> {expiresAt, data}

export function getCached(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) {
    cache.delete(key);
    return null;
  }
  return v.data;
}

export function setCached(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function runDeduped(key, fn) {
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try { return await fn(); }
    finally { inflight.delete(key); }
  })();

  inflight.set(key, p);
  return p;
}
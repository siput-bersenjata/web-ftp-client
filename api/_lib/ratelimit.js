/**
 * Rate limiter sederhana (in-memory, per-instance serverless).
 * Cukup untuk meredam brute force / abuse ringan. Untuk produksi skala
 * besar gunakan store eksternal (Upstash Redis) — tapi pola pemakaiannya sama.
 */
const buckets = new Map();

/** Bersihkan bucket kedaluwarsa secara berkala. */
const SWEEP_INTERVAL = 60_000;
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = now;
  for (const [k, v] of buckets) {
    if (now > v.reset) buckets.delete(k);
  }
}

/**
 * @returns {{ ok: boolean, remaining: number, reset: number, retryAfter: number }}
 */
function rateLimit(key, limit, windowMs) {
  sweep();
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    ok: bucket.count <= limit,
    remaining,
    reset: bucket.reset,
    retryAfter: Math.ceil((bucket.reset - now) / 1000),
  };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

module.exports = { rateLimit, clientIp };

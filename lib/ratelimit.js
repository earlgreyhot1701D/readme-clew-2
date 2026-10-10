// Best-effort per-IP limit (PRD 7.4). Serverless instances do not share memory, so this is NOT a real ceiling.
// The real protection is the prepaid Glasser balance, the Anthropic spend cap, and the Vercel firewall rule.
export function makeLimiter({ max = 10, windowMs = 60_000, now = Date.now, maxKeys = 5000 } = {}) {
  const hits = new Map(); // ip -> array of timestamps
  const check = function check(ip) {
    const t = now();
    const key = String(ip || 'unknown');
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return { ok: false, retryAfterMs: windowMs - (t - recent[0]) };
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > maxKeys) { // keep memory bounded
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    }
    return { ok: true, retryAfterMs: 0 };
  };
  check.size = () => hits.size; // for tests: how many IPs are tracked
  return check;
}

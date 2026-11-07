export const createRateLimit = ({ windowMs, max, message }) => {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(req.ip || req.socket?.remoteAddress || "unknown");
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ message });
    }

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    next();
  };
};

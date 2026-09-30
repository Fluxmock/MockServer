import redisClient from "../../../../config/redis.js";

// Redis key structure:
//   ratelimit:{scope}:{scopeId}:{window}
//
// scope    → "project" | "endpoint"
// scopeId  → projectId | endpointId
// window   → current unix second (for requestsPerSecond) or minute (for burst)

const getRateLimitKey = (scope, scopeId, window) => {
  return `ratelimit:${scope}:${scopeId}:${window}`;
};

// Atomic increment + set TTL on first request in window
// Returns current count for this window
const incrementCounter = async (key, ttlSeconds) => {
  const count = await redisClient.incr(key);
  if (count === 1) {
    // first request in this window — set expiry
    await redisClient.expire(key, ttlSeconds);
  }
  return count;
};

const send429 = (res, config, limitType, current, limit) => {
  const retryAfter = config.retryAfterSeconds ?? 1;

  res.set("Retry-After", String(retryAfter));
  res.set("X-RateLimit-Limit", String(limit));
  res.set("X-RateLimit-Remaining", "0");
  res.set("X-RateLimit-Type", limitType);

  res.status(429).json({
    success: false,
    message: config.message ?? "Too many requests — rate limit exceeded",
    chaosRule: "rateLimit",
    limitType,
    limit,
    current,
    retryAfter,
  });

  console.log(`[rateLimit] 429 → type:${limitType} count:${current}/${limit}`);
  return true;
};

export const applyRateLimitRule = async (rule, req, res) => {
  const config = rule?.config ?? {};
  const limitType = config.type ?? "requestsPerSecond";

  // --- requestsPerSecond ---
  // Counts requests in the current 1-second window per project
  if (limitType === "requestsPerSecond") {
    const limit = Number(config.requestsPerSecond ?? 10);
    const window = Math.floor(Date.now() / 1000); // current unix second
    const key = getRateLimitKey("project", req.projectId, window);

    const count = await incrementCounter(key, 2); // TTL 2s so key cleans itself up

    if (count > limit) {
      return send429(res, config, limitType, count, limit);
    }

    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    return false;
  }

  // --- burstLimit ---
  // Counts requests in a rolling N-second window per project
  // config: { type: "burstLimit", burstLimit: 50, windowSeconds: 10 }
  if (limitType === "burstLimit") {
    const limit = Number(config.burstLimit ?? 50);
    const windowSeconds = Number(config.windowSeconds ?? 10);
    const window = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = getRateLimitKey("project-burst", req.projectId, window);

    const count = await incrementCounter(key, windowSeconds + 1);

    if (count > limit) {
      return send429(res, config, limitType, count, limit);
    }

    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    return false;
  }

  // --- perEndpoint ---
  // Counts requests in a 1-second window scoped to this specific endpoint
  // config: { type: "perEndpoint", requestsPerSecond: 5 }
  if (limitType === "perEndpoint") {
    const limit = Number(config.requestsPerSecond ?? 5);
    const endpointId = String(req.endpoint?._id ?? "unknown");
    const window = Math.floor(Date.now() / 1000);
    const key = getRateLimitKey("endpoint", endpointId, window);

    const count = await incrementCounter(key, 2);

    if (count > limit) {
      return send429(res, config, limitType, count, limit);
    }

    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    return false;
  }

  // --- perApiKey ---
  // Counts requests per projectKey in a 1-second window
  // config: { type: "perApiKey", requestsPerSecond: 20 }
  if (limitType === "perApiKey") {
    const limit = Number(config.requestsPerSecond ?? 20);
    const projectKey = req.path.split("/")[1] ?? "unknown"; // pk_abc123
    const window = Math.floor(Date.now() / 1000);
    const key = getRateLimitKey("apikey", projectKey, window);

    const count = await incrementCounter(key, 2);

    if (count > limit) {
      return send429(res, config, limitType, count, limit);
    }

    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    return false;
  }

  console.warn(`[rateLimit] unknown limitType: ${limitType}`);
  return false;
};

export default { applyRateLimitRule };

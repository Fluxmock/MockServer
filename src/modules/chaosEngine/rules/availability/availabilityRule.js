import redisClient from "../../../../config/redis.js";

export const AVAILABILITY_TYPES = ["serviceDown", "circuitBreaker", "partialOutage"];

// ── Redis key helpers ──────────────────────────────────────────────────────

// Tracks consecutive failure count for circuit breaker
const circuitFailureKey = (projectId) =>
  `circuit:failures:${projectId}`;

// Tracks whether the circuit is currently open (tripped)
const circuitStateKey = (projectId) =>
  `circuit:state:${projectId}`;

// ── sub-type handlers ──────────────────────────────────────────────────────

// serviceDown
// Every request returns 503 regardless of endpoint.
// config: { type: "serviceDown", message: "..." }
const handleServiceDown = (config, res) => {
  res.status(503).json({
    success: false,
    message: config.message ?? "Service unavailable — simulated outage",
    chaosRule: "availability",
    type: "serviceDown",
  });

  console.log("[availability] serviceDown — 503 sent");
  return true;
};

// circuitBreaker
// Counts failures per project in Redis.
// Once failureThreshold is reached, the circuit opens and stays open for
// cooldownSeconds. While open, every request gets 503 immediately.
// After cooldown, circuit half-opens and allows requests through again.
//
// config: {
//   type: "circuitBreaker",
//   failureThreshold: 5,    // how many failures before circuit trips
//   cooldownSeconds: 30,    // how long circuit stays open
//   triggerOnStatus: [500, 502, 503]  // which status codes count as failures
// }
const handleCircuitBreaker = async (config, req, res) => {
  const projectId = req.projectId;
  const failureThreshold = Number(config.failureThreshold ?? 5);
  const cooldownSeconds = Number(config.cooldownSeconds ?? 30);

  // check if circuit is already open
  const circuitOpen = await redisClient.get(circuitStateKey(projectId));

  if (circuitOpen === "open") {
    const ttl = await redisClient.ttl(circuitStateKey(projectId));

    res.status(503).json({
      success: false,
      message: "Circuit breaker open — service is unavailable",
      chaosRule: "availability",
      type: "circuitBreaker",
      retryAfter: ttl > 0 ? ttl : cooldownSeconds,
    });

    console.log(`[availability] circuit OPEN → 503 (resets in ${ttl}s)`);
    return true;
  }

  // circuit is closed — only count as failure if the response status matches triggerOnStatus
  // We hook into res.on("finish") to check the actual status code sent
  const triggerOnStatus = Array.isArray(config.triggerOnStatus)
    ? config.triggerOnStatus.map(Number)
    : [500, 502, 503, 504];

  // attach a one-time finish listener to check actual response status
  res.once("finish", async () => {
    if (!triggerOnStatus.includes(res.statusCode)) {
      console.log(`[availability] circuit — status ${res.statusCode} not in triggerOnStatus, not counting`);
      return;
    }

    const failures = await redisClient.incr(circuitFailureKey(projectId));

    if (failures === 1) {
      await redisClient.expire(circuitFailureKey(projectId), cooldownSeconds * 2);
    }

    console.log(`[availability] circuit failure count: ${failures}/${failureThreshold} (triggered by ${res.statusCode})`);

    if (failures >= failureThreshold) {
      await redisClient.set(circuitStateKey(projectId), "open", "EX", cooldownSeconds);
      await redisClient.del(circuitFailureKey(projectId));
      console.log(`[availability] circuit TRIPPED → open for ${cooldownSeconds}s`);
    }
  });

  // let the request through — failure counting happens after response is sent
  return false;
};

// partialOutage
// Only specific endpoints are down. Others respond normally.
// config: {
//   type: "partialOutage",
//   affectedPaths: ["/api/v1/payments", "/api/v1/orders"],
//   message: "..."
// }
const handlePartialOutage = (config, req, res) => {
  const affectedPaths = config.affectedPaths ?? [];

  if (!Array.isArray(affectedPaths) || affectedPaths.length === 0) {
    console.warn("[availability] partialOutage: no affectedPaths configured");
    return false;
  }

  const currentPath = req.mockPath ?? req.path;

  const isAffected = affectedPaths.some((p) => {
    // support exact match and prefix match
    return currentPath === p || currentPath.startsWith(p + "/");
  });

  if (!isAffected) {
    return false; // this endpoint is fine
  }

  res.status(503).json({
    success: false,
    message: config.message ?? "Endpoint unavailable — partial outage",
    chaosRule: "availability",
    type: "partialOutage",
    affectedPath: currentPath,
  });

  console.log(`[availability] partialOutage → ${currentPath} is down`);
  return true;
};

// ── main rule ──────────────────────────────────────────────────────────────

export const applyAvailabilityRule = async (rule, req, res) => {
  const config = rule?.config ?? {};
  const type = config.type;

  if (!AVAILABILITY_TYPES.includes(type)) {
    console.warn(`[availability] unknown type: ${type}`);
    return false;
  }

  if (type === "serviceDown") return handleServiceDown(config, res);
  if (type === "circuitBreaker") return handleCircuitBreaker(config, req, res);
  if (type === "partialOutage") return handlePartialOutage(config, req, res);

  return false;
};

export default { applyAvailabilityRule };

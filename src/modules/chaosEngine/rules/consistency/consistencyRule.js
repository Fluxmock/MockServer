import redisClient from "../../../../config/redis.js";
import resolveTemplate from "../../../templating/resolveTemplate.js";

export const CONSISTENCY_TYPES = ["outOfOrder", "duplicate", "raceCondition"];

// ── Redis key helpers ──────────────────────────────────────────────────────

// Stores the last N resolved response bodies for an endpoint
const responseQueueKey = (projectId, endpointId) =>
  `consistency:queue:${projectId}:${endpointId}`;

// Tracks concurrent in-flight requests per endpoint for race simulation
// (defined at module level for reference — used as inline template string inside handleRaceCondition)
const buildInflightKey = (projectId, endpointId) =>
  `consistency:inflight:${projectId}:${endpointId}`;

// ── helpers ────────────────────────────────────────────────────────────────

const getResolvedBody = (req) => {
  const endpoint = req.endpoint ?? {};
  const bodyTemplate = endpoint.responseBodyTemplate ?? {};
  return resolveTemplate(bodyTemplate, req.pathParams ?? {});
};

const getStatusCode = (req) => Number(req.endpoint?.statusCode ?? 200);

// ── sub-type handlers ──────────────────────────────────────────────────────

// outOfOrder
// Maintains a rolling queue of the last `queueSize` responses for this endpoint.
// Instead of returning the current response, returns a random previous one.
// First request always gets the real response (queue is empty).
//
// config: { type: "outOfOrder", queueSize: 5 }
const handleOutOfOrder = async (config, req, res) => {
  const projectId = req.projectId;
  const endpointId = String(req.endpoint?._id ?? "unknown");
  const queueSize = Number(config.queueSize ?? 5);
  const queueKey = responseQueueKey(projectId, endpointId);

  const currentBody = getResolvedBody(req);
  const statusCode = getStatusCode(req);

  // fetch existing queue
  const raw = await redisClient.lrange(queueKey, 0, queueSize - 1);
  const queue = raw.map((item) => {
    try { return JSON.parse(item); } catch { return null; }
  }).filter(Boolean);

  // push current response to the back of the queue
  await redisClient.rpush(queueKey, JSON.stringify(currentBody));
  await redisClient.ltrim(queueKey, -queueSize, -1); // keep last N only
  await redisClient.expire(queueKey, 300);

  if (queue.length === 0) {
    // no history yet — return the real response this time
    console.log("[consistency] outOfOrder — no history yet, returning real response");
    res.status(statusCode).json(currentBody);
    return true;
  }

  // return a random past response instead of the current one
  const staleBody = queue[Math.floor(Math.random() * queue.length)];

  res.status(statusCode).json(staleBody);
  console.log(`[consistency] outOfOrder — returned stale response from queue (${queue.length} items)`);
  return true;
};

// duplicate
// Wraps the real response body in a structure that contains it twice,
// simulating receiving the same event/message delivered twice.
// Also sends a custom header so the client can detect it.
//
// config: { type: "duplicate" }
const handleDuplicate = (config, req, res) => {
  const currentBody = getResolvedBody(req);
  const statusCode = getStatusCode(req);

  // wrap both copies under a consistent structure
  const duplicatedBody = {
    __chaos_type: "duplicate",
    __delivery_count: 2,
    responses: [currentBody, currentBody],
  };

  res.status(statusCode)
    .set("X-Chaos-Duplicate", "true")
    .set("X-Delivery-Count", "2")
    .json(duplicatedBody);

  console.log("[consistency] duplicate — response sent twice in payload");
  return true;
};

// raceCondition
// Simulates two concurrent writes racing each other.
// Uses Redis to track in-flight requests for this endpoint.
// If another request is already in-flight:
//   → this one gets a "conflicted" mid-state response immediately
// If this is the first in-flight:
//   → marks itself in-flight, waits a random delay, returns real response, clears flag
//
// config: { type: "raceCondition", minDelayMs: 50, maxDelayMs: 300 }
const handleRaceCondition = async (config, req, res) => {
  const projectId = req.projectId;
  const endpointId = String(req.endpoint?._id ?? "unknown");
  const inflightKey = buildInflightKey(projectId, endpointId);

  const minDelay = Number(config.minDelayMs ?? 50);
  const maxDelay = Number(config.maxDelayMs ?? 300);
  const currentBody = getResolvedBody(req);
  const statusCode = getStatusCode(req);

  const isInflight = await redisClient.get(inflightKey);

  if (isInflight) {
    // race detected — return a conflicted mid-state response
    const conflictedBody = {
      ...currentBody,
      __chaos_type: "raceCondition",
      __conflict: true,
      __message: "Conflict detected — another request was in progress",
    };

    res.status(409).json(conflictedBody);
    console.log("[consistency] raceCondition — conflict detected, returned 409");
    return true;
  }

  // mark as in-flight
  await redisClient.set(inflightKey, "1", "EX", 5); // 5s max lock

  // simulate processing delay
  const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // clear in-flight flag
  await redisClient.del(inflightKey);

  res.status(statusCode).json(currentBody);
  console.log(`[consistency] raceCondition — completed after ${delay}ms`);
  return true;
};

// ── main rule ──────────────────────────────────────────────────────────────

export const applyConsistencyRule = async (rule, req, res) => {
  const config = rule?.config ?? {};
  const type = config.type;

  if (!CONSISTENCY_TYPES.includes(type)) {
    console.warn(`[consistency] unknown type: ${type}`);
    return false;
  }

  if (type === "outOfOrder") return handleOutOfOrder(config, req, res);
  if (type === "duplicate") return handleDuplicate(config, req, res);
  if (type === "raceCondition") return handleRaceCondition(config, req, res);

  return false;
};

export default { applyConsistencyRule };

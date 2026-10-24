import redisClient from "../../config/redis.js";
import { buildLogDoc } from "./buildLogDoc.js";
import { randomUUID } from "node:crypto";

const REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const REQUEST_COUNTER_RETENTION_SECONDS = 24 * 60 * 60 + 60;

/**
 * emitRequestLog(req, res)
 *
 * Call this at the TOP of the final handler in app.js — before
 * res.status().json() — so the res.on("finish") listener is
 * registered before the response flushes.
 *
 * What it does:
 *   1. Stamps req._startTime so buildLogDoc can compute responseTime
 *   2. Registers a one-shot "finish" listener on res
 *   3. Inside "finish": builds the log doc and publishes it to Redis
 *
 * Channel: "project:<projectId>:requests"
 * AppServer's redisSub is psubscribed to "project:*:requests" and
 * forwards each message to the matching Socket.IO room.
 *
 * Errors are caught and logged — a logging failure must never
 * crash or delay the actual mock response.
 */
export function emitRequestLog(req, res) {
  // Stamp as early as possible so responseTime includes serialisation
  req._startTime = Date.now();

  res.on("finish", async () => {
    // projectId is set by projectResolution middleware.
    // If it's missing the request never got past project lookup,
    // so there is nothing useful to log.
    if (!req.projectId) return;

    const logDoc = { ...buildLogDoc(req, res), id: randomUUID() };
    const channel = `project:${req.projectId}:requests`;
    const historyKey = `project:${req.projectId}:request-history`;
    const requestCounterKey = `project:${req.projectId}:request-events:24h`;

    try {
      const payload = JSON.stringify(logDoc);
      const transaction = redisClient.multi();

      // Count only requests that resolved to one of this project's configured
      // endpoints. Unmatched paths still remain visible in Live traffic, but
      // do not inflate the overview metric.
      if (req.endpoint) {
        const now = Date.now();
        transaction
          .zadd(requestCounterKey, now, logDoc.id)
          .zremrangebyscore(requestCounterKey, 0, now - REQUEST_WINDOW_MS)
          .expire(requestCounterKey, REQUEST_COUNTER_RETENTION_SECONDS);
      }

      const results = await transaction
        .lpush(historyKey, payload)
        .ltrim(historyKey, 0, 4999)
        .expire(historyKey, 900)
        .publish(channel, payload)
        .exec();
      const failure = results?.find(([error]) => error);
      if (failure) throw failure[0];

      console.log(
        `[emit] ${logDoc.method} ${logDoc.path}` +
        ` → ${logDoc.statusCode} ${logDoc.responseTime}ms` +
        (logDoc.chaosApplied ? ` chaos:[${logDoc.chaosRules.join(",")}]` : "")
      );
    } catch (err) {
      // Never let a Redis failure surface as a request error
      console.error("[emit] Redis publish failed:", err.message);
    }
  });
}

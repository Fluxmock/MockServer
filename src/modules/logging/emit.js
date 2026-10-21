import redisClient from "../../config/redis.js";
import { buildLogDoc } from "./buildLogDoc.js";

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

    const logDoc = buildLogDoc(req, res);
    const channel = `project:${req.projectId}:requests`;

    try {
      await redisClient.publish(channel, JSON.stringify(logDoc));

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

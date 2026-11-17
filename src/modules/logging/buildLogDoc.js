/**
 * buildLogDoc
 *
 * Assembles the log event from the Express req/res objects.
 * Called inside res.on("finish") so res.statusCode is already final.
 *
 * What each middleware puts on req before this runs:
 *   projectResolution   → req.projectId  (string), req.mockPath (string)
 *   endpointResolution  → req.endpoint   ({ _id, method, path, ... })
 *                         req.pathParams ({ param: value })
 *   chaos engine        → req.appliedChaosRules (types actually injected)
 *   emit.js             → req._startTime (Date.now() ms, stamped before middlewares)
 */
export function buildLogDoc(req, res) {
  const responseTime = Date.now() - (req._startTime ?? Date.now());

  const appliedRules = [...new Set(req.appliedChaosRules ?? [])];

  return {
    projectId:    req.projectId          ?? null,
    endpointId:   req.endpoint?._id      ?? null,

    method:       req.method,
    path:         req.mockPath           ?? req.path,
    query:        req.query              ?? {},

    statusCode:   res.statusCode,
    responseTime,                        // ms — used for p95 latency

    chaosApplied: appliedRules.length > 0,
    chaosRules:   appliedRules,          // e.g. ["delay", "error"]

    timestamp:    new Date().toISOString(),
  };
}

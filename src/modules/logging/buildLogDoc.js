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
 *   chaosResolution     → req.chaosRules (array of rule objects)
 *   emit.js             → req._startTime (Date.now() ms, stamped before middlewares)
 */
export function buildLogDoc(req, res) {
  const responseTime = Date.now() - (req._startTime ?? Date.now());

  // Only collect rules that were actually active/enabled
  const appliedRules = (req.chaosRules ?? [])
    .filter((r) => r.isEnabled)
    .map((r) => r.ruleType);

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

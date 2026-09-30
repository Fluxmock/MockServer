import resolveTemplate from "../../../templating/resolveTemplate.js";

export const PAYLOAD_TYPES = [
  "malformedJson",
  "truncatedBody",
  "emptyResponse",
  "wrongContentType",
  "oversizedPayload",
];

// --- helpers ---

const sendRaw = (res, statusCode, contentType, body) => {
  res.status(statusCode).set("Content-Type", contentType).end(body);
};

// Corrupts a JSON string by randomly breaking it in one of several ways
const corruptJson = (jsonString) => {
  const strategies = [
    // cut off mid-string
    () => jsonString.slice(0, Math.floor(jsonString.length * 0.6)),
    // remove closing brace
    () => jsonString.replace(/\}$/, ""),
    // introduce an unquoted key
    () => jsonString.replace(/"([^"]+)"\s*:/, "$1:"),
    // duplicate a colon
    () => jsonString.replace(/:/, "::"),
    // inject a stray character
    () => jsonString.slice(0, 5) + "@@##" + jsonString.slice(5),
  ];

  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  return strategy();
};

// Builds an oversized string of N kilobytes
const buildPadding = (kb = 100) => {
  return "x".repeat(kb * 1024);
};

// --- main rule ---

export const applyPayloadRule = async (rule, req, res) => {
  const config = rule?.config ?? {};
  const type = config.type;

  if (!PAYLOAD_TYPES.includes(type)) {
    console.warn(`[payload] unknown type: ${type}`);
    return false;
  }

  // resolve the real body from the endpoint template so we have something to corrupt
  const endpoint = req.endpoint ?? {};
  const bodyTemplate = endpoint.responseBodyTemplate ?? {};
  const resolvedBody = resolveTemplate(bodyTemplate, req.pathParams ?? {});
  const statusCode = Number(endpoint.statusCode ?? 200);

  // ── malformedJson ──────────────────────────────────────────────────────────
  // Sends a response with Content-Type: application/json but a broken body
  if (type === "malformedJson") {
    const validJson = JSON.stringify(resolvedBody);
    const broken = corruptJson(validJson);

    sendRaw(res, statusCode, "application/json", broken);
    console.log(`[payload] malformedJson injected (${broken.length} chars)`);
    return true;
  }

  // ── truncatedBody ──────────────────────────────────────────────────────────
  // Sends only the first N% of the valid JSON body
  if (type === "truncatedBody") {
    const percentage = Number(config.percentage ?? 40) / 100;
    const validJson = JSON.stringify(resolvedBody);
    const truncated = validJson.slice(0, Math.floor(validJson.length * percentage));

    sendRaw(res, statusCode, "application/json", truncated);
    console.log(`[payload] truncatedBody at ${config.percentage ?? 40}% (${truncated.length}/${validJson.length} chars)`);
    return true;
  }

  // ── emptyResponse ──────────────────────────────────────────────────────────
  // Sends status code with no body at all
  if (type === "emptyResponse") {
    res.status(statusCode).end();
    console.log(`[payload] emptyResponse injected (status ${statusCode})`);
    return true;
  }

  // ── wrongContentType ──────────────────────────────────────────────────────
  // Sends valid JSON body but with a misleading Content-Type header
  if (type === "wrongContentType") {
    const wrongTypes = [
      "text/html",
      "text/plain",
      "application/xml",
      "application/octet-stream",
      "multipart/form-data",
    ];

    const contentType =
      config.contentType ??
      wrongTypes[Math.floor(Math.random() * wrongTypes.length)];

    sendRaw(res, statusCode, contentType, JSON.stringify(resolvedBody));
    console.log(`[payload] wrongContentType injected → ${contentType}`);
    return true;
  }

  // ── oversizedPayload ──────────────────────────────────────────────────────
  // Sends the real body + a huge padding field to simulate bloated responses
  if (type === "oversizedPayload") {
    const kb = Number(config.sizeKb ?? 500);
    const bloated = {
      ...resolvedBody,
      __chaos_padding: buildPadding(kb),
    };

    res.status(statusCode).json(bloated);
    console.log(`[payload] oversizedPayload injected (~${kb}KB padding)`);
    return true;
  }

  return false;
};

export default { applyPayloadRule };

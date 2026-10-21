import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import projectResolver from "./middlewares/projectResolution.middleware.js";
import endpointResolver from "./middlewares/endpointResolution.middleware.js";
import chaosResolutionMiddleware from "./middlewares/chaosRuleResolution.middleware.js";
import resolveTemplate from "./modules/templating/resolveTemplate.js";
import { emitRequestLog } from "./modules/logging/emit.js";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "MockServer" });
});

app.use(projectResolver);

// Register the finish listener immediately after projectId is set.
// This way every response — normal mock, chaos-injected, or 404 —
// gets logged. emitRequestLog only stamps req._startTime and attaches
// res.on("finish"), so it adds zero latency to the request path.
app.use((req, res, next) => {
  emitRequestLog(req, res);
  next();
});

app.use(async (req, res, next) => {
  try {
    await endpointResolver(req, res, next);
  } catch (error) {
    next(error);
  }
});

app.use(chaosResolutionMiddleware);

app.use((req, res) => {
  if (!req.endpoint) {
    return res.status(404).json({
      success: false,
      message: "Endpoint not found",
    });
  }

  const endpoint = req.endpoint;
  const statusCode = Number(endpoint.statusCode ?? 200);
  const headers = endpoint.responseHeaders ?? {};
  const bodyTemplate = endpoint.responseBodyTemplate ?? {};

  // Resolve faker tokens and path params in the response body
  const resolvedBody = resolveTemplate(bodyTemplate, req.pathParams || {});

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  return res.status(statusCode).json(resolvedBody);
});

export default app;

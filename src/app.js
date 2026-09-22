import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import projectResolver from "./middlewares/projectResolution.middleware.js";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// health check — useful to confirm the server is up
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "MockServer" });
});

// resolves /pk_abc123/... → strips key, attaches req.project + req.mockPath
app.use(projectResolver);

// mock traffic handler will be mounted here in Layer 5
// app.use("/", mockRouter);


export default app;

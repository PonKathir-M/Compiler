import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import runRoute from "./routes/run.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  }),
);
app.use(
  express.json({
    limit: "256kb",
    strict: true,
  }),
);

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "java-compiler-api",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", runRoute);

app.get("/", (_req, res) => {
  res.send("Java Compiler Backend is Running 🚀");
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    status: "not_found",
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    requestId: req.requestId || null,
  });
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "Malformed JSON in request body.",
      requestId: _req.requestId || null,
    });
  }

  res.status(err.status || 500).json({
    ok: false,
    status: "server_error",
    message: err.message || "Unexpected server error.",
    requestId: _req.requestId || null,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Java compiler backend running on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down backend...`);

  server.close(() => {
    console.log("Backend shutdown complete.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 5_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

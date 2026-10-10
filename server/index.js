import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalysis, createLiveLine, createTopicPack } from "./llm.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.post("/api/llm", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const operation = req.body?.operation;
    const data = operation === "topic-pack"
      ? await createTopicPack(req.body, controller.signal)
      : operation === "live-line"
        ? await createLiveLine(req.body, controller.signal)
        : operation === "analysis"
          ? await createAnalysis(req.body, controller.signal)
        : null;
    if (!data) return res.status(400).json({ ok: false, error: "Unknown LLM operation." });
    if (!controller.signal.aborted && !res.headersSent) res.status(200).json({ ok: true, data });
  } catch (error) {
    if (controller.signal.aborted || res.headersSent) return;
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    // Keep upstream details and platform credentials out of the browser response.
    console.warn("GD Arena LLM request failed:", status, error?.message || "unknown error");
    res.status(status).json({ ok: false, error: "The AI service is unavailable right now. The room will continue with its topic bank." });
  }
});

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  const dist = path.join(projectRoot, "dist");
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

const port = Number(isProduction ? (process.env.PORT || 3000) : (process.env.API_PORT || 3001));
const host = "0.0.0.0";
app.listen(port, host, () => console.log(`GD Arena API listening on ${host}:${port}`));

/**
 * statusRoutes.ts
 * Enhanced system status and diagnostics API endpoints.
 * Provides real-time health, uptime, and service connectivity information.
 */

import { Router, type Request, type Response } from "express";
import { getAllHealth } from "./Health";
import os from "os";

const statusRouter = Router();

const startTime = Date.now();

/**
 * GET /api/status
 * Returns comprehensive system status including server uptime,
 * memory usage, database health, and environment info.
 */
statusRouter.get("/api/status", async (_req: Request, res: Response) => {
  try {
    const dbHealth = await getAllHealth();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const status = {
      server: {
        status: "UP",
        uptime_seconds: uptimeSeconds,
        uptime_human: formatUptime(uptimeSeconds),
        node_version: process.version,
        environment: process.env.NODE_ENV || "development",
        port: process.env.PORT || 5000,
        pid: process.pid,
      },
      memory: {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        system_total_mb: Math.round(totalMem / 1024 / 1024),
        system_free_mb: Math.round(freeMem / 1024 / 1024),
        system_used_percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Unknown",
        load_avg_1m: os.loadavg()[0].toFixed(2),
        load_avg_5m: os.loadavg()[1].toFixed(2),
        load_avg_15m: os.loadavg()[2].toFixed(2),
      },
      databases: dbHealth.databases,
      python_api: {
        url: process.env.VITE_BACKEND_URL || "http://localhost:8000",
        note: "Check /api/python-health for Python FastAPI status",
      },
      timestamp: new Date().toISOString(),
    };

    const allDbsHealthy = dbHealth.databases.every((db: any) => db.status === "HEALTHY");
    const httpStatus = allDbsHealthy ? 200 : 207;

    res.status(httpStatus).json(status);
  } catch (err: any) {
    res.status(500).json({
      server: { status: "ERROR" },
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/python-health
 * Proxies a health check to the Python FastAPI backend.
 */
statusRouter.get("/api/python-health", async (_req: Request, res: Response) => {
  const pythonUrl = process.env.VITE_BACKEND_URL || "http://localhost:8000";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${pythonUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();
    res.json({
      python_api: {
        status: response.ok ? "UP" : "DEGRADED",
        http_status: response.status,
        url: pythonUrl,
        response: data,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      python_api: {
        status: "DOWN",
        url: pythonUrl,
        error: err.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/routes
 * Lists all registered API routes for discoverability.
 */
statusRouter.get("/api/routes", (_req: Request, res: Response) => {
  res.json({
    message: "TF_genie Trade Finance API — Route Registry",
    node_server: {
      base_url: `http://localhost:${process.env.PORT || 5000}`,
      routes: [
        { method: "GET",  path: "/api/health",        description: "Database health check" },
        { method: "POST", path: "/api/login",          description: "User authentication" },
        { method: "GET",  path: "/api/status",         description: "Full system status dashboard" },
        { method: "GET",  path: "/api/python-health",  description: "Python FastAPI health proxy" },
        { method: "GET",  path: "/api/routes",         description: "This route registry" },
      ],
    },
    python_api: {
      base_url: process.env.VITE_BACKEND_URL || "http://localhost:8000",
      docs_url: `${process.env.VITE_BACKEND_URL || "http://localhost:8000"}/docs`,
      note: "114 routes registered — see /docs for full Swagger UI",
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export default statusRouter;

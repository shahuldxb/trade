import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cron from "node-cron";
import { getAllHealth } from "./Health";
import { buildExpressErrorLog, buildProcessErrorLog, insertErrorLog } from "./errorLogService";

import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const PORT = process.env.PORT || 5000;
const originalConsoleError = console.error.bind(console);
let forwardingConsoleError = false;

function safeSerializeConsoleArgs(value: unknown): string | null {
  try {
    return JSON.stringify(value, (_key, currentValue) =>
      currentValue instanceof Error
        ? { name: currentValue.name, message: currentValue.message, stack: currentValue.stack }
        : currentValue,
    );
  } catch {
    return String(value);
  }
}

function isErrorLogInsertFailure(value: unknown): boolean {
  const text = String(value ?? "").toLowerCase();
  return text.includes("dbo.error_logs") || text.includes("table 'cosmicdust.dbo.error_logs'");
}

console.error = (...args: unknown[]) => {
  originalConsoleError(...args);

  if (forwardingConsoleError) {
    return;
  }

  if (args.some(isErrorLogInsertFailure)) {
    return;
  }

  forwardingConsoleError = true;
  const [first, ...rest] = args;
  const error = first instanceof Error ? first : rest.find((item) => item instanceof Error);

  void insertErrorLog({
    module_name: "node-console",
    function_name: "console.error",
    error_code: typeof first === "object" && first !== null ? String((first as { code?: unknown }).code ?? "") : null,
    error_message:
      (error instanceof Error ? error.message : typeof first === "string" ? first : String(first)) ||
      "console.error",
    error_type: error instanceof Error ? error.name : typeof first,
    severity: "HIGH",
    remarks: error instanceof Error ? error.stack ?? null : safeSerializeConsoleArgs(rest),
  })
    .catch(() => {})
    .finally(() => {
      forwardingConsoleError = false;
    });
};

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  void insertErrorLog(buildProcessErrorLog("unhandledRejection", reason)).catch(() => {});
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void insertErrorLog(buildProcessErrorLog("uncaughtException", error)).catch(() => {});
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    void insertErrorLog(buildExpressErrorLog(_req, err)).catch(() => {});

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const stack = process.env.NODE_ENV === 'development' ? err.stack : undefined;

    console.error('\n Error:', err.message);
    if (stack) {
      console.error('\nStack trace:\n', stack.split('\n').slice(1).join('\n'));
    }

    res.status(status).json({
      error: {
        message,
        status,
        stack: process.env.NODE_ENV === 'development' ? stack : undefined
      }
    });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.get("/", (req, res) => {
    res.send("Server running ");
  });
  (async () => {
    const data = await getAllHealth();
    console.log("Initial Health:", data);
  })();

  // 🔁 Then run every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    const data = await getAllHealth();
    console.log("Health:", data);
  });
  app.listen(Number(PORT), "0.0.0.0", () => {
  }).on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(` Port ${PORT} is already in use.`);
    } else {
      console.error(" Server error:", err);
    }
  });
})();

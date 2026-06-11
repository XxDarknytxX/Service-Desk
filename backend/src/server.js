// src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { getPool } from "./config/db.js";
import { makeAuthController } from "./controllers/authController.js";
import { makeTicketController } from "./controllers/ticketController.js";
import { makeUserController } from "./controllers/userController.js";
import { makeTeamController } from "./controllers/teamController.js";
import { makeOrganizationController } from "./controllers/organizationController.js";
import { makeMetaController } from "./controllers/metaController.js";
import { makeDashboardController } from "./controllers/dashboardController.js";
import { makeKbController } from "./controllers/kbController.js";
import { makeAssetController } from "./controllers/assetController.js";
import { makeSlaController } from "./controllers/slaController.js";
import { makeReportController } from "./controllers/reportController.js";
import { makeDepartmentController } from "./controllers/departmentController.js";
import { makeHierarchyController } from "./controllers/hierarchyController.js";
import { makeApprovalController } from "./controllers/approvalController.js";
import { makeAiChatController } from "./controllers/aiChatController.js";
import { makeTemplateController } from "./controllers/templateController.js";
import { makeTemplateApprovalController } from "./controllers/templateApprovalController.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeTicketRouter } from "./routes/tickets.js";
import { makeUserRouter } from "./routes/users.js";
import { makeTeamRouter } from "./routes/teams.js";
import { makeOrganizationRouter } from "./routes/organizations.js";
import { makeMetaRouter } from "./routes/meta.js";
import { makeDashboardRouter } from "./routes/dashboard.js";
import { makeKbRouter } from "./routes/kb.js";
import { makeAssetRouter } from "./routes/assets.js";
import { makeSlaRouter } from "./routes/sla.js";
import { makeReportRouter } from "./routes/reports.js";
import { makeDepartmentRouter } from "./routes/departments.js";
import { makeHierarchyRouter } from "./routes/hierarchy.js";
import { makeApprovalRouter } from "./routes/approvals.js";
import { makeAiChatRouter } from "./routes/aiChat.js";
import { makeTemplateRouter } from "./routes/templates.js";
import { makeTemplateApprovalRouter } from "./routes/templateApprovals.js";
import { makeSlaService } from "./services/slaService.js";
import { processAutoApprovals } from "./services/approvalWorkflow.js";

const isProd = process.env.NODE_ENV === "production";

// Validate required environment variables in production
if (isProd) {
  const required = ["JWT_SECRET", "DATABASE_PASSWORD", "CORS_ORIGIN"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET === "dev-secret-change-me") {
    console.error("JWT_SECRET must be changed from default in production");
    process.exit(1);
  }
}

const app = express();

// Trust NGINX reverse proxy
if (isProd) {
  app.set("trust proxy", 1);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // let NGINX handle CSP if needed
  crossOriginEmbedderPolicy: false,
}));

// Gzip compression
app.use(compression());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api", apiLimiter);

// Stricter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later" },
});
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);

// Request logging - only in development or minimal in production
app.use((req, res, next) => {
  if (!isProd) {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
  }
  next();
});

// CORS - supports comma-separated origins for port forwarding / tunnels
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return cb(null, true);
    // Allow VS Code devtunnels and configured origins
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".devtunnels.ms")
    ) {
      return cb(null, true);
    }
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// DB + controllers
const pool = await getPool();
const auth = makeAuthController(pool);
const tickets = makeTicketController(pool);
const users = makeUserController(pool);
const teams = makeTeamController(pool);
const organizations = makeOrganizationController(pool);
const meta = makeMetaController(pool);
const dashboard = makeDashboardController(pool);
const kb = makeKbController(pool);
const assets = makeAssetController(pool);
const sla = makeSlaController(pool);
const reports = makeReportController(pool);
const departments = makeDepartmentController(pool);
const hierarchy = makeHierarchyController(pool);
const approvals = makeApprovalController(pool);
const aiChat = makeAiChatController(pool);
const templateCtrl = makeTemplateController(pool);
const templateApprovalCtrl = makeTemplateApprovalController(pool);

// Routes
app.use("/api", makeAuthRouter(auth));
app.use("/api", makeTicketRouter(tickets));
app.use("/api", makeUserRouter(users));
app.use("/api", makeTeamRouter(teams));
app.use("/api", makeOrganizationRouter(organizations));
app.use("/api", makeMetaRouter(meta));
app.use("/api", makeDashboardRouter(dashboard));
app.use("/api", makeKbRouter(kb));
app.use("/api", makeAssetRouter(assets));
app.use("/api", makeSlaRouter(sla));
app.use("/api", makeReportRouter(reports));
app.use("/api", makeDepartmentRouter(departments));
app.use("/api", makeHierarchyRouter(hierarchy));
app.use("/api", makeApprovalRouter(approvals));
app.use("/api", makeAiChatRouter(aiChat));
app.use("/api", makeTemplateApprovalRouter(templateApprovalCtrl));
app.use("/api", makeTemplateRouter(templateCtrl));

// Health check
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// Global error handler - don't leak stack traces in production
app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(err.status || 500).json({
    error: isProd ? "Internal server error" : err.message,
  });
});

// Background jobs: SLA breach detection & auto-approval timeout
const slaService = makeSlaService(pool);
const SLA_CHECK_INTERVAL = 2 * 60 * 1000;      // every 2 minutes
const AUTO_APPROVE_INTERVAL = 5 * 60 * 1000;    // every 5 minutes

setInterval(async () => {
  try {
    await slaService.checkAndMarkBreaches();
  } catch (err) {
    console.error("[Cron] SLA breach check error:", err.message);
  }
}, SLA_CHECK_INTERVAL);

setInterval(async () => {
  try {
    const count = await processAutoApprovals(pool);
    if (count > 0) console.log(`[Cron] Auto-approved ${count} timed-out approvals`);
  } catch (err) {
    console.error("[Cron] Auto-approval check error:", err.message);
  }
}, AUTO_APPROVE_INTERVAL);

const port = process.env.PORT || 5000;
// In production, bind to 127.0.0.1 so only NGINX can reach the backend
const host = isProd ? "127.0.0.1" : "0.0.0.0";
app.listen(port, host, () => {
  console.log(`API listening on ${host}:${port} [${isProd ? "production" : "development"}]`);
  console.log(`[Cron] SLA breach check every ${SLA_CHECK_INTERVAL / 1000}s, auto-approval every ${AUTO_APPROVE_INTERVAL / 1000}s`);
});

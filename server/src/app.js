import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export function createApp(io) {
  const app = express();
  if (io) app.set("io", io);

  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true
    })
  );
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan("dev"));

  app.use("/uploads", express.static(path.resolve("server/uploads")));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "nextalk-api" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api", chatRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

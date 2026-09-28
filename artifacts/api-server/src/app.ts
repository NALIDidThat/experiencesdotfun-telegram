import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startAnalyticsRetentionCleanup } from "./lib/analytics";
import { startTelegramBot } from "./lib/telegram";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

startAnalyticsRetentionCleanup();
app.use("/api", router);
if (process.env.NODE_ENV === "development") {
  void startTelegramBot();
} else {
  logger.info(
    { nodeEnv: process.env.NODE_ENV ?? "unset" },
    "Telegram polling is disabled outside development.",
  );
}

export default app;

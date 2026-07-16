import Fastify from "fastify";
import { env } from "./lib/env.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { createZaloSessionService } from "./services/zalo-session-service.js";

const app = Fastify({ logger: true });
const zaloSessionService = createZaloSessionService();

await app.register(registerInternalRoutes, { prefix: "/internal", zaloSessionService });

app.get("/health", async () => ({ status: "ok", service: "zalo-bot-service", adapter: env.ZALO_ADAPTER }));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  if (env.ZALO_BOT_ENABLED) {
    void restoreWithRetry();
  } else {
    app.log.info("Zalo bot auto-restore is disabled for this service instance");
  }
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

async function restoreWithRetry(attempt = 1): Promise<void> {
  try {
    await zaloSessionService.restore();
  } catch (error) {
    const delayMs = Math.min(30_000, attempt * 5_000);
    app.log.warn({ attempt, delayMs, error }, "Zalo session restore failed; retrying");
    setTimeout(() => {
      void restoreWithRetry(attempt + 1);
    }, delayMs);
  }
}

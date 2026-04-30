import { createServer } from "http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";
import { createApp } from "./app.js";
import { setupSocket } from "./sockets/index.js";

async function bootstrap() {
  await connectDatabase(env.mongoUri);

  const app = createApp(null);
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      credentials: true
    }
  });

  app.set("io", io);

  setupSocket(io);

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Nextalk API running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});

import { config } from './config.js';
import { buildServer } from './server.js';

const port = config.port;
const host = process.env.HOST ?? '0.0.0.0';
const app = await buildServer();

try {
  await app.listen({
    host,
    port
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

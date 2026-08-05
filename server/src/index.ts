import { buildApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './thefloor.db';
/**
 * Returning one-time codes in the HTTP response is a development affordance and
 * nothing else. It stays off unless explicitly asked for, so shipping without
 * an SMS transport fails closed rather than handing out codes.
 */
const exposeCodes = process.env.EXPOSE_DEV_CODES === 'true';

const app = buildApp({ dbPath, exposeCodes, logger: true });
app.sessions.start();

app.fastify
  .listen({ port, host })
  .then(() => {
    app.fastify.log.info({ dbPath, exposeCodes }, 'the floor server listening');
    if (exposeCodes) {
      app.fastify.log.warn(
        'EXPOSE_DEV_CODES is on — one-time codes are returned in responses. Never enable this in production.'
      );
    }
  })
  .catch((error) => {
    app.fastify.log.error(error);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.sessions.stop();
    app.fastify.close().finally(() => process.exit(0));
  });
}

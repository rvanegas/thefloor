import { buildApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './thefloor.db';

/**
 * Accepts any code from anyone, as whoever they claim to be. It exists only
 * because there is no SMS or email transport yet, so no real user could receive
 * a code — sign-in would otherwise be impossible rather than merely insecure.
 *
 * This is not a weakened check; it is the absence of one. Delete it, and the
 * `authBypass` branches it feeds, the moment a transport lands.
 */
const authBypass = process.env.AUTH_DEV_BYPASS === 'true';

// A config file travelling from a laptop to a server is the realistic way this
// ends up somewhere it must never be, so refuse to start rather than serve.
if (authBypass && process.env.NODE_ENV === 'production') {
  console.error(
    'FATAL: AUTH_DEV_BYPASS is set with NODE_ENV=production.\n' +
      'It accepts any code as valid, which means anyone can sign in as anyone.\n' +
      'Refusing to start.'
  );
  process.exit(1);
}

const app = buildApp({ dbPath, authBypass, logger: true });
app.sessions.start();

app.fastify
  .listen({ port, host })
  .then(() => {
    app.fastify.log.info({ dbPath, authBypass }, 'the floor server listening');
    if (authBypass) {
      app.fastify.log.warn(
        { host, port },
        'AUTHENTICATION IS DISABLED (AUTH_DEV_BYPASS). Any code signs in as any identifier. ' +
          'Do not expose this to a network you do not control.'
      );
      if (host !== '127.0.0.1' && host !== 'localhost') {
        app.fastify.log.warn(
          { host },
          'Bypass is on and the server is bound beyond loopback — anyone who can reach this port can sign in as anyone. Set HOST=127.0.0.1 unless you intend that.'
        );
      }
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

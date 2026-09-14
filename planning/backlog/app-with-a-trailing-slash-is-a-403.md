# `/app/` with a trailing slash is a 403

Found 2026-09-01 by `curl`, while auditing whether the web work was finished.
`https://thefloor.rvanegas.co/app` is 200 and `/app/index.html` is 200, but
**`/app/` is 403** — and the same for `/beta/`. It looks like `@fastify/static`
answering the directory request itself, before the per-prefix not-found handler
that would have served `index.html`.

Small, and it is the front door of the stable train: a URL people type, and one
that anything appending a slash will produce. Nothing in the app links that way
— `/open` forwards to `/app` without the slash — so it has probably never bitten
anybody, which is also why nobody has seen it.

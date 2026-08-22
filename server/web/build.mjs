import { build } from 'esbuild';

/**
 * The guest page's only build step.
 *
 * It exists because `livekit-client` is an npm package and a browser cannot
 * ask npm for anything. Everything else in this server runs from source —
 * `tsx` on the box, deliberately — and this does not change that: the bundle
 * is one file, produced from sources that are committed, and the output is
 * ignored by git.
 *
 * **Run by `bin/deploy` on the box**, after `npm install` and before the
 * restart. Committing the bundle instead was the alternative and was declined:
 * a compiled artefact in the tree drifts from its source and nobody notices,
 * which is the same failure as a stale line in AGENTS.md and harder to see.
 */
await build({
  entryPoints: ['web/guest.ts'],
  outfile: 'web/dist/guest.js',
  bundle: true,
  format: 'esm',
  target: ['safari15', 'chrome100', 'firefox100'],
  minify: true,
  // Sourcemaps rather than not, because this is the one place in the project
  // where a stack trace comes from somebody else's browser and there is no way
  // to reproduce it locally.
  sourcemap: true,
  logLevel: 'info',
});

/**
 * Just enough of Node to let a test read this package's own source files.
 *
 * **Rather than adding `node` to `types` in tsconfig.json**, which would put
 * `process`, `fs` and the rest in front of every file in the app — including
 * the ones that run on a phone, where none of it exists. The one test that
 * needs any of this is `i18n/__tests__/extracted.test.ts`, which scans the
 * views for prose the way `core/__tests__/purity.test.ts` scans core for
 * imports, and it needs three names.
 *
 * Same reasoning and same shelf as `react-test-renderer.d.ts` beside it:
 * a local declaration of exactly what is used beats a dependency that
 * declares everything.
 */
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { isFile(): boolean };
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

/** The directory of the module being run, which Jest provides. */
declare const __dirname: string;

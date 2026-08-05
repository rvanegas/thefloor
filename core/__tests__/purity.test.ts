import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The app and the server both import this package, so it must run under Metro
 * and under Node alike. The moment something here imports `react-native` — or
 * any package at all — the server build breaks, and it breaks at deploy time
 * rather than here. This asserts the constraint instead of trusting it.
 */
describe('core has no dependencies', () => {
  const dir = join(__dirname, '..');
  const sources = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.d.ts')
  );

  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s imports only from within core', (file) => {
    const contents = readFileSync(join(dir, file), 'utf8');
    const specifiers = [...contents.matchAll(/from\s+'([^']+)'/g)].map(
      (m) => m[1]
    );
    for (const specifier of specifiers) {
      expect({ file, specifier, relative: specifier.startsWith('.') }).toEqual({
        file,
        specifier,
        relative: true,
      });
    }
  });

  it('reaches no further up than its own directory', () => {
    for (const file of sources) {
      const contents = readFileSync(join(dir, file), 'utf8');
      expect(contents).not.toMatch(/from\s+'\.\.\//);
    }
  });
});

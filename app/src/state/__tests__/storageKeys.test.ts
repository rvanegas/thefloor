import { INSTALL_KEYS } from '../storage';

/**
 * `require` rather than an import, because this package's `tsconfig` lists
 * `types: ["jest"]` and so has no Node typings — deliberately, since the app
 * is a React Native one and Node's globals are not its globals. One test that
 * reads the repository is not a reason to change that for every file, so it
 * reaches for the runtime jest already provides and says what it expects back.
 */
declare const require: (module: string) => unknown;
declare const __dirname: string;
const { execSync } = require('child_process') as {
  execSync: (command: string, options: { cwd: string; encoding: 'utf8' }) => string;
};

/**
 * That `INSTALL_KEYS` is all of them.
 *
 * The list is literals rather than the constants they are declared as, because
 * importing every key back into `state/storage.ts` would put that module above
 * half the app and make a cycle out of `AppProvider`. This is the price of
 * that: a test that reads the source the way a person would, so a key added
 * next year is caught here rather than by somebody wondering why *forget this
 * phone* left something behind.
 *
 * It greps rather than parses, and matches **an assignment** rather than the
 * bare literal: `thefloor.rvanegas.co` is a hostname that appears quoted in
 * the api tests, and the prose in `storage.ts` names the pattern it is
 * describing. Every real key is `const SOMETHING_KEY = 'thefloor.…'` today,
 * and one assembled from pieces would defeat both a grep and a reader — which
 * is a reason not to write one.
 *
 * Tests are excluded for the same reason a fixture is not a key.
 */
describe('the keys this install writes', () => {
  it('are all in the list that clears them', () => {
    const found = execSync(
      "grep -rhoE \"= 'thefloor\\.[A-Za-z.]+'\" src " +
        '--include=*.ts --include=*.tsx --exclude-dir=__tests__ | sort -u',
      { cwd: `${__dirname}/../../..`, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(line.indexOf("'") + 1, -1));

    // Not empty, or a grep that silently matched nothing would pass for ever.
    expect(found.length).toBeGreaterThan(10);
    expect([...INSTALL_KEYS].sort()).toEqual(found.sort());
  });
});

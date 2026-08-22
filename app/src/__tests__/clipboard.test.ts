import * as Clipboard from 'expo-clipboard';
import { copyText, pasteText } from '../clipboard';

/**
 * The contract, pinned here rather than at a call site, because the second
 * consumer — the channel clipboard, shipped 2026-08-21 — inherits whatever
 * this does with a failure.
 *
 * The rule is the one every device reader in this app follows: never throw,
 * and never report a success you did not have.
 */

const setString = Clipboard.setStringAsync as jest.Mock;
const getString = Clipboard.getStringAsync as jest.Mock;

beforeEach(() => {
  setString.mockImplementation(async () => true);
  getString.mockImplementation(async () => '');
});

describe('copyText', () => {
  it('reports what the clipboard reported', async () => {
    await expect(copyText('hello')).resolves.toBe(true);
    expect(setString).toHaveBeenCalledWith('hello');
  });

  /**
   * The case the deprecated `react-native` export could not express: it
   * returned void, so declining and succeeding looked identical. Passing the
   * boolean through is the whole reason the dependency is worth its prebuild.
   */
  it('passes through a decline rather than assuming it worked', async () => {
    setString.mockImplementation(async () => false);
    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('turns a throw into false rather than letting it out', async () => {
    setString.mockImplementation(async () => {
      throw new Error('no clipboard');
    });
    await expect(copyText('hello')).resolves.toBe(false);
  });
});

describe('pasteText', () => {
  it('returns what is there', async () => {
    getString.mockImplementation(async () => 'https://example.com');
    await expect(pasteText()).resolves.toBe('https://example.com');
  });

  // Deliberately the same answer as unreadable: nothing a caller could do
  // differs between the two.
  it('reads an empty clipboard as nothing', async () => {
    getString.mockImplementation(async () => '');
    await expect(pasteText()).resolves.toBeNull();
  });

  it('reads an unreadable clipboard as nothing, without throwing', async () => {
    getString.mockImplementation(async () => {
      throw new Error('refused');
    });
    await expect(pasteText()).resolves.toBeNull();
  });
});

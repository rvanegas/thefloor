import { mustUpdate } from '../expiry';

/**
 * The rule that decides whether an install stops working, which is the most
 * total thing this app can do to somebody — so both directions of getting it
 * wrong are pinned here, not just the positive case.
 */
describe('mustUpdate', () => {
  it('expires a build below the floor', () => {
    expect(mustUpdate(35, 36)).toBe(true);
  });

  it('keeps the build that is the floor', () => {
    // MIN_SUPPORTED_BUILD names the oldest build still supported, not the
    // first unsupported one. Off by one here ejects the whole population the
    // server was promising to keep answering.
    expect(mustUpdate(36, 36)).toBe(false);
    expect(mustUpdate(37, 36)).toBe(false);
  });

  it('never expires a build that cannot say what it is', () => {
    // `appBuild()` is null when the platform will not answer. Locking out on
    // silence would lock out on a guess. See build.ts.
    expect(mustUpdate(null, 36)).toBe(false);
    expect(mustUpdate(null, 999)).toBe(false);
  });

  it('never expires on a server that said nothing about a floor', () => {
    // An unreachable server resolves to no answer at all, and a reachable one
    // that omits or garbles the field is the same case: neither is evidence
    // about this install.
    expect(mustUpdate(1, undefined)).toBe(false);
    expect(mustUpdate(1, null)).toBe(false);
    expect(mustUpdate(1, Number.NaN)).toBe(false);
  });
});

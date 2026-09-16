import { CHIME_AMPLITUDE } from '../../../modules/audio-route';

/**
 * `require` rather than an import, on `storageKeys.test.ts`'s reasoning: this
 * package's `tsconfig` lists `types: ["jest"]` and has no Node typings, the
 * app being a React Native one, and one test that reads a file in the
 * repository is not a reason to change that for every file.
 */
declare const require: (module: string) => unknown;
declare const __dirname: string;
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};

/**
 * The two copies of the peak the app plays at, kept equal.
 *
 * It is written down in `app/modules/audio-route/index.ts` as the default
 * argument every caller that says nothing gets, and in `AudioRouteModule.swift`
 * as what the renderer bakes in for a call that carries no peak. There was a
 * third in `core/settings.ts` for one day, when how loud a chime is was an
 * account setting; the ladder went and the constant stayed. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 *
 * **The Swift is read as text rather than trusted to a comment**, which is the
 * one thing jest can do about a number that lives in a language it cannot
 * load. The cost of the two disagreeing is not a crash but a shrug: the lab's
 * *ships at* readout would name one loudness and the phone would make another,
 * and nothing anywhere would say so.
 */
describe('the peak the app plays at', () => {
  it('is the top of the ladder that was offered and withdrawn', () => {
    expect(CHIME_AMPLITUDE).toBe(1);
  });

  /**
   * And is the ceiling rather than merely a choice near it. `clampAmplitude`
   * in the Swift pins every request into `[0.01, 1]` and `chimeKey` is
   * computed from the clamped value, so a peak above full scale would be the
   * same rendered sound under a different name — no louder, no error. A number
   * here that this fails on is somebody asking for a loudness the renderer
   * cannot give, which is a path or a waveform question instead.
   */
  it('is not above what the renderer will accept', () => {
    expect(CHIME_AMPLITUDE).toBeLessThanOrEqual(1);
    expect(CHIME_AMPLITUDE).toBeGreaterThanOrEqual(0.01);
  });

  it('is the same number in the JavaScript and in the Swift', () => {
    const swift = readFileSync(
      `${__dirname}/../../../modules/audio-route/ios/AudioRouteModule.swift`,
      'utf8'
    );
    const match = swift.match(
      /private static let chimeAmplitude = ([0-9.]+)/
    );
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(CHIME_AMPLITUDE);
  });
});

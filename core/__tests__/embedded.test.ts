import { isEmbeddedBrowser, type BrowserFacts } from '../embedded';

/**
 * The detector's first test, two weeks after it shipped.
 *
 * It lived in `server/web/guest.ts`, which nothing in this repository can run
 * — the file says so itself — so a regex that decides whether somebody is
 * warned about a silent microphone had never been executed by anything but a
 * stranger's phone. Moving it into `core/` was mostly so `/app` and `/beta`
 * could call it; this is the other half of the reason.
 *
 * The user agents below are real ones, kept whole rather than trimmed to the
 * token being matched. A shortened UA tests the regex against itself; a real
 * one tests it against what arrives.
 */

/** An ordinary iPhone, so each case states only what it is about. */
function facts(over: Partial<BrowserFacts> = {}): BrowserFacts {
  return {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
    telegramProxy: false,
    standalone: false,
    ...over,
  };
}

describe('browsers that are inside an app', () => {
  it('catches Telegram by its token', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS/10.14',
        })
      )
    ).toBe(true);
  });

  /**
   * The case the exclusion rule exists for. Telegram's webview does not always
   * put a token in the user agent — this UA is Safari's, verbatim, minus the
   * `Version/… Safari` pair — and the object it hangs on `window` is the only
   * other thing it says about itself.
   */
  it('catches Telegram by the object it leaves on window', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          telegramProxy: true,
        })
      )
    ).toBe(true);
  });

  it('catches Facebook, Instagram, LINE and WeChat by their tokens', () => {
    const named = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.42.108]',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.37.90',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.9.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49',
    ];
    for (const userAgent of named) {
      expect({ userAgent, embedded: isEmbeddedBrowser(facts({ userAgent })) }).toEqual({
        userAgent,
        embedded: true,
      });
    }
  });

  /**
   * A named host app is named on any platform. The exclusion rule below is
   * iOS-only; this one is not, and that asymmetry is deliberate — it is the
   * WebKit-owned audio session that makes iOS the dangerous case.
   */
  it('catches a named host app on Android too', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/468.0.0.30.107;]',
          platform: 'Linux armv8l',
        })
      )
    ).toBe(true);
  });

  /** WebKit on iOS with no browser token at all: inside something unnamed. */
  it('catches an unnamed iOS webview by what it fails to say', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        })
      )
    ).toBe(true);
  });
});

describe('browsers that are not', () => {
  it('leaves Safari on iOS alone', () => {
    expect(isEmbeddedBrowser(facts())).toBe(false);
  });

  it('leaves the other iOS browsers alone, which all name themselves', () => {
    const named = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/125.0.0.0 Mobile/15E148 Safari/605.1.15',
    ];
    for (const userAgent of named) {
      expect({ userAgent, embedded: isEmbeddedBrowser(facts({ userAgent })) }).toEqual({
        userAgent,
        embedded: false,
      });
    }
  });

  /**
   * The one an exclusion rule gets wrong if nobody thinks about it. A page
   * added to the home screen runs in its own WKWebView and carries no Safari
   * token either — it looks exactly like the unnamed webview above, and it is
   * the opposite thing.
   */
  it('leaves a page added to the home screen alone', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          standalone: true,
        })
      )
    ).toBe(false);
  });

  /**
   * An iPad calls itself a Mac. `platform` and `maxTouchPoints` are how it is
   * told from one, which is why they are arguments — and Safari on an iPad
   * still carries its token, so it is excluded by the ordinary rule.
   */
  it('recognises an iPad as iOS, and still leaves its Safari alone', () => {
    const ipadSafari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    expect(
      isEmbeddedBrowser(
        facts({ userAgent: ipadSafari, platform: 'MacIntel', maxTouchPoints: 5 })
      )
    ).toBe(false);
    // Same machine, same UA, no browser token: now it is inside something.
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        })
      )
    ).toBe(true);
  });

  it('leaves desktops alone, touchscreen or not', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        })
      )
    ).toBe(false);
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          platform: 'Win32',
          maxTouchPoints: 10,
        })
      )
    ).toBe(false);
  });

  /**
   * The known miss, asserted rather than left to be discovered. An Android
   * WebView announces nothing and is not on iOS, so it goes undetected — and
   * on Android the host app does not own the audio session in the way iOS's
   * does, which is why this is a limit rather than a defect.
   */
  it('misses an unnamed Android webview, which is the accepted limit', () => {
    expect(
      isEmbeddedBrowser(
        facts({
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240705.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36',
          platform: 'Linux armv8l',
        })
      )
    ).toBe(false);
  });
});

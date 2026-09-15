import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';

/**
 * The signed-out screen, and specifically the one thing on it that is not
 * about signing in.
 *
 * `/app` and `/beta` open the same microphone through the same library the
 * guest page does, so they inherit its worst failure: an in-app browser on iOS
 * grants the microphone and delivers silence, with nothing in the WebRTC API
 * reporting it. The notice tested here is the whole of what the web app does
 * about that, and it is at the door because the cure — open this somewhere
 * else — costs the session once it has been paid for.
 *
 * `core/__tests__/embedded.test.ts` covers *which* browsers are embedded. What
 * is covered here is that the answer is acted on, and that a phone is not asked
 * the question at all.
 */

const embedded = { value: false };

// The web sibling reads `navigator` and `window`, neither of which is this
// renderer's business. Metro picks `embedded.web.ts` for a browser and
// `embedded.ts` for a phone; jest resolves the native one, so the false case
// below is the real file rather than a stub of it.
jest.mock('../embedded', () => ({
  inEmbeddedBrowser: () => embedded.value,
  currentLink: () => 'https://thefloor.rvanegas.co/beta',
}));

// Without this the screen renders its *Not configured* branch instead of
// itself: `EXPO_PUBLIC_API_URL` is unset under jest, which is the right answer
// for a phone that was never told where the server is and is not a state the
// web app can be in — `config.web.ts` derives the origin from the page it was
// served by, and cannot fail to.
jest.mock('../../api/config', () => ({
  API_URL: 'https://thefloor.rvanegas.co',
  describeMissingConfig: () => null,
}));

const mockApp = {
  requestCode: jest.fn(async () => {}),
  verify: jest.fn(
    async (
      _identifier: string,
      _code: string,
      _displayName?: string,
      _marketingEmail?: boolean
    ) => {}
  ),
  lastError: null as string | null,
  clearError: jest.fn(),
};

jest.mock('../../state/AppProvider', () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AuthView } from '../AuthView';

function textOf(tree: ReactTestRenderer): string {
  const strings: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return strings.join(' ');
}

function labelOf(instance: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const props = (node as { props?: { children?: unknown } }).props;
      if (props?.children !== undefined) walk(props.children);
    }
  };
  walk(instance.props.children);
  return out.join(' ');
}

function findButton(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  return tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find((n) => labelOf(n).includes(label));
}

function findCheckbox(tree: ReactTestRenderer): ReactTestInstance | undefined {
  return tree.root.findAll((n) => n.props?.accessibilityRole === 'checkbox')[0];
}

/** Gets past the first step, which is where the opt-in is not. */
async function reachTheCodeStep(tree: ReactTestRenderer): Promise<void> {
  const field = tree.root.findAll(
    (n) => n.props?.placeholder === 'Email address'
  )[0];
  await act(async () => {
    field.props.onChangeText('anna.k@example.com');
  });
  await act(async () => {
    findButton(tree, 'Send code')!.props.onPress();
  });
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AuthView />);
  });
  return tree;
}

beforeEach(() => {
  embedded.value = false;
  jest.clearAllMocks();
});

describe('the embedded-browser notice', () => {
  it('is absent in an ordinary browser, and on a phone', () => {
    const text = textOf(render());
    expect(text).not.toContain('built-in browser');
    expect(findButton(render(), 'Copy the link')).toBeUndefined();
    // The screen it is absent from is still the screen.
    expect(text).toContain('Send code');
  });

  it('says what is wrong and what to do instead', () => {
    embedded.value = true;
    const text = textOf(render());
    expect(text).toContain('built-in browser');
    // The failure, in the terms it actually presents in: not "your microphone
    // is broken" but a microphone nobody can hear, which is the observation
    // somebody can check against what the channel tells them.
    expect(text).toContain('produces silence');
    // The cure, and the hint at the control that performs it. The wording is
    // shared with server/web/guest.html deliberately — one failure, one cure,
    // and two descriptions would be two things to keep true.
    expect(text).toContain('Open in Safari');
    expect(text).toContain('Open in browser');
  });

  /**
   * The half of the advice that is a guess. Every host app puts the control
   * somewhere different and some bury it, so the clipboard is what works when
   * the menu cannot be found — and it is the reason the notice has a button on
   * it rather than being prose.
   */
  it('offers the link on the clipboard, and says it did', async () => {
    embedded.value = true;
    const tree = render();
    const button = findButton(tree, 'Copy the link');
    expect(button).toBeDefined();

    await act(async () => {
      button!.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'https://thefloor.rvanegas.co/beta'
    );
    expect(labelOf(findButton(tree, 'Link copied')!)).toContain('Link copied');
  });

  /**
   * It is at the door and the door is where somebody signs in, so it must not
   * be in the way of that. The notice sits above the form rather than in place
   * of it: an embedded browser can still listen once admitted, and refusing to
   * let anybody in would cost more than the warning is worth.
   */
  it('does not take the sign-in form away', () => {
    embedded.value = true;
    const tree = render();
    expect(textOf(tree)).toContain('built-in browser');
    expect(findButton(tree, 'Send code')).toBeDefined();
  });
});

/**
 * The opt-in, which is the one thing this screen asks rather than requires.
 *
 * It is a permission, so what is tested is the shape a permission has to have:
 * clear unless somebody touched it, sent as a grant when they did, and absent
 * from the step where an address has not been proved yet. The server's half —
 * that a clear box never withdraws a consent already given — is
 * `server/__tests__/marketing-opt-in.test.ts`.
 */
describe('the marketing email opt-in', () => {
  it('is not asked before the address is proved', () => {
    expect(findCheckbox(render())).toBeUndefined();
  });

  it('is offered with the code, and starts clear', async () => {
    const tree = render();
    await reachTheCodeStep(tree);
    const box = findCheckbox(tree);
    expect(box).toBeDefined();
    expect(box!.props.accessibilityState.checked).toBe(false);
    expect(box!.props.accessibilityLabel).toContain('Email me');
  });

  it('signs in without permission when nobody touches it', async () => {
    const tree = render();
    await reachTheCodeStep(tree);
    const code = tree.root.findAll(
      (n) => n.props?.placeholder === 'Six-digit code'
    )[0];
    await act(async () => {
      code.props.onChangeText('123456');
    });
    await act(async () => {
      findButton(tree, 'Sign in')!.props.onPress();
    });
    expect(mockApp.verify).toHaveBeenCalledWith(
      'anna.k@example.com',
      '123456',
      undefined,
      false
    );
  });

  it('sends the grant when it is ticked', async () => {
    const tree = render();
    await reachTheCodeStep(tree);
    await act(async () => {
      findCheckbox(tree)!.props.onPress();
    });
    expect(findCheckbox(tree)!.props.accessibilityState.checked).toBe(true);

    const code = tree.root.findAll(
      (n) => n.props?.placeholder === 'Six-digit code'
    )[0];
    await act(async () => {
      code.props.onChangeText('123456');
    });
    await act(async () => {
      findButton(tree, 'Sign in')!.props.onPress();
    });
    expect(mockApp.verify).toHaveBeenCalledWith(
      'anna.k@example.com',
      '123456',
      undefined,
      true
    );
  });
});

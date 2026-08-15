/**
 * The privacy policy link opens the policy served by *this app's server*.
 *
 * App Store Guideline 5.1.1(i) asks for the policy to be reachable from inside
 * the application and not only from the listing, and `GET /privacy` is served by
 * the server it describes — so the link has to be that server's address rather
 * than one written into the app, which could name a different one.
 *
 * A file of its own, and one without JSX, for one reason each. The address is
 * read from the environment at import time, so configuring it means resetting
 * the module registry — which tears down the renderer that views.test.tsx
 * shares across its cases. And a reset registry hands the re-required screen a
 * *second* copy of React, which the renderer then refuses to run hooks for, so
 * React itself has to be required after the reset as well. JSX would import the
 * stale one behind our backs.
 */

const ME = 'acct_me';

const mockApp = {
  me: { id: ME, displayName: 'Me' },
  token: 'token',
  appearance: 'system' as const,
  setAppearance: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(async () => {}),
  saveProfile: jest.fn(async () => {}),
  loadProfile: jest.fn(async (accountId: string) => ({
    account: { id: accountId, displayName: 'Me' },
    bio: null as string | null,
  })),
};

jest.mock('../../state/AppProvider', () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: unknown }) => children,
}));

/** Every label under a node, so a button can be found by what it says. */
function labelOf(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const props = (n as { props?: { children?: unknown; label?: unknown } })
        .props;
      if (typeof props?.label === 'string') out.push(props.label);
      walk(props?.children);
    }
  };
  walk(node);
  return out.join(' ');
}

/**
 * Loads the screen as an app built against `url` would have it, and returns the
 * pieces the test needs — all of them from the registry the screen came from.
 */
async function openWith(url: string) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_URL = url;

  const React = require('react') as typeof import('react');
  const renderer =
    require('react-test-renderer') as typeof import('react-test-renderer');
  const { Linking } = require('react-native') as typeof import('react-native');
  const { HomeSettingsView } =
    require('../HomeSettingsView') as typeof import('../HomeSettingsView');

  const opened = jest
    .spyOn(Linking, 'openURL')
    .mockResolvedValue(undefined as never);

  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(HomeSettingsView, { onBack: () => {} })
    );
  });

  const press = async (label: string) => {
    const button = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => labelOf(n).includes(label))!;
    await renderer.act(async () => button.props.onPress());
  };

  return { tree, opened, press, act: renderer.act };
}

afterEach(() => {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_API_URL;
});

it('opens the policy on the server the app is talking to', async () => {
  const { tree, opened, press, act } = await openWith('https://thefloor.example');

  await press('Privacy policy');
  expect(opened).toHaveBeenCalledWith('https://thefloor.example/privacy');

  opened.mockRestore();
  await act(async () => tree.unmount());
});

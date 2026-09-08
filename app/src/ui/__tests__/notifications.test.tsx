import React from 'react';
import { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import { HomeView } from '../HomeView';
import { NotificationsView } from '../NotificationsView';
import {
  findButton,
  homeNav,
  mockApp,
  render,
  resetHarness,
  textOf,
} from '../testing/harness';

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * Asking to be reachable: the banner that says nobody can reach you, and the
 * screen that says why before the system is allowed to ask.
 *
 * The policy that decides *when* either appears is pure and tested in
 * `state/__tests__/notificationAsk.test.ts`. These are about what somebody
 * actually sees, and about the one thing that must never happen here — a
 * screen asking iOS for anything on its own, which spends a dialog that is
 * granted once per install.
 */

beforeEach(() => {
  resetHarness();
  mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
});

describe('the banner on the tier', () => {
  it('says nothing to a phone that is already reachable', () => {
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).not.toContain('Nobody can reach you');
    act(() => tree.unmount());
  });

  it('says so when nothing can arrive, and offers the explanation', () => {
    mockApp.notifications.ask = 'nudge';
    const opened = jest.fn();
    const tree = render(
      <HomeView {...homeNav} onOpenNotifications={opened} />
    );
    expect(textOf(tree)).toContain('Nobody can reach you');
    act(() => findButton(tree, 'Tell me more')?.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * The day is spent by the banner *appearing*, not by it being answered — so
   * ignoring it costs the same as dismissing it, and a banner that came back
   * until it was formally dismissed would be one that punished ignoring it.
   */
  it('spends the day the moment it appears', () => {
    mockApp.notifications.ask = 'nudge';
    const tree = render(<HomeView {...homeNav} />);
    expect(mockApp.notifications.noteShown).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * Recording the day makes `ask` stop being `'nudge'` a render later, which
   * is exactly the state this test stands in for: what is on screen must not
   * remove itself the instant it appears.
   */
  it('stays up after the day has been recorded', () => {
    mockApp.notifications.ask = 'nudge';
    const tree = render(<HomeView {...homeNav} />);
    act(() => {
      mockApp.notifications.ask = 'none';
      tree.update(<HomeView {...homeNav} />);
    });
    expect(textOf(tree)).toContain('Nobody can reach you');
    act(() => tree.unmount());
  });

  it('goes when it is dismissed, and asks the system for nothing', () => {
    mockApp.notifications.ask = 'nudge';
    const tree = render(<HomeView {...homeNav} />);
    act(() => findButton(tree, 'Not now')?.props.onPress());
    expect(textOf(tree)).not.toContain('Nobody can reach you');
    expect(mockApp.notifications.allow).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('the explanation', () => {
  it('says why it matters, what will be sent, and how loud', () => {
    const tree = render(<NotificationsView onDone={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Being reachable');
    // The promise, which is the half people refuse over.
    expect(text).toContain('Only a person');
    // And that it is not all-or-nothing: the levels, in the settings screen's
    // own words rather than a second copy of them.
    expect(text).toContain('Quiet');
    expect(text).toContain('Pings only');
    expect(text).toContain('Everything');
    act(() => tree.unmount());
  });

  it('counts as having been shown, so the banner does not follow it', () => {
    const tree = render(<NotificationsView onDone={() => {}} />);
    expect(mockApp.notifications.noteShown).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('spends the dialog when there is one to spend', async () => {
    mockApp.notifications.canPrompt = true;
    const done = jest.fn();
    const tree = render(<NotificationsView onDone={done} />);
    await act(async () => {
      findButton(tree, 'Turn on notifications')?.props.onPress();
    });
    expect(mockApp.notifications.allow).toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * iOS shows its dialog once ever, so after a refusal there is nothing left
   * to raise from here. Offering *Allow* and doing nothing visible is how an
   * app teaches somebody that its buttons are decorative.
   */
  it('sends somebody who has already refused to Settings instead', () => {
    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    mockApp.notifications.canPrompt = false;
    const tree = render(<NotificationsView onDone={() => {}} />);
    expect(textOf(tree)).not.toContain('Turn on notifications');
    act(() => findButton(tree, 'Open Settings')?.props.onPress());
    expect(openSettings).toHaveBeenCalled();
    expect(mockApp.notifications.allow).not.toHaveBeenCalled();
    act(() => tree.unmount());
    openSettings.mockRestore();
  });

  it('closes on Not now without asking for anything', () => {
    mockApp.notifications.canPrompt = true;
    const done = jest.fn();
    const tree = render(<NotificationsView onDone={done} />);
    act(() => findButton(tree, 'Not now')?.props.onPress());
    expect(done).toHaveBeenCalled();
    expect(mockApp.notifications.allow).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

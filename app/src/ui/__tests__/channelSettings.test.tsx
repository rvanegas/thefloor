import React from 'react';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import { ChannelSettingsView } from '../ChannelSettingsView';
import {
  ME,
  channelOf,
  findButton,
  mockApp,
  render,
  resetHarness,
} from '../testing/harness';

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * What this screen concludes from a dispatch, which until 2026-09-16 was more
 * than the dispatch told it.
 *
 * `app.act` now answers whether the action reached the socket, and every
 * assertion here is about the branch where it did not: a rename that was
 * queued is not a rename that was saved, and a confirmed Leave that never
 * left the app is not a reason to walk off the screen. The whole account is
 * in planning/decisions/2026-09-16-being-offline-is-one-state.md.
 */

let tree: ReactTestRenderer;
const onBack = jest.fn();
const onLeft = jest.fn();

beforeEach(() => {
  resetHarness();
  onBack.mockClear();
  onLeft.mockClear();
});

/**
 * `GuestLinks` loads on mount and settles a state update after the test body
 * has finished. Nothing here is about it, but an update landing after
 * teardown warns and then tries to import into an environment that is gone —
 * so the effects are flushed while there is still a renderer to flush them
 * into.
 */
afterEach(async () => {
  await act(async () => {});
  tree?.unmount();
});

/** Alone in the channel would make Leave into Delete; THEM is here too. */
const channel = channelOf();

function open(
  /** What the snapshot says, which is what the screen is about. */
  state: { name?: string | null; publicAt?: number | null } = {}
) {
  mockApp.me = { id: ME, displayName: 'Me' } as typeof mockApp.me;
  tree = render(
    <ChannelSettingsView
      publicAt={state.publicAt ?? null}
      channel={{ ...channel, name: state.name ?? null }}
      derivedTitle="Dana Chu"
      onBack={onBack}
      onLeft={onLeft}
    />
  );
  return tree;
}

/**
 * The public page's On and Off, which are the first two buttons after its
 * heading.
 *
 * Found by position rather than by label because the labels are *On* and
 * *Off*: the Recording card one above is the same pair with the same two
 * words, which is the house shape for a yes-or-no and not something to give
 * up to make a test easier. `findAll` answers in render order, so the card is
 * scoped by starting at its heading.
 */
function publicPage(): { on: ReactTestInstance; off: ReactTestInstance } {
  const all = tree.root.findAll(() => true);
  const heading = all.findIndex(
    (node) => node.props?.children === 'This channel has a public page'
  );
  expect(heading).toBeGreaterThan(-1);
  const buttons = all
    .slice(heading)
    .filter(
      (node) =>
        node.props?.accessibilityRole === 'button' &&
        // The `Pressable` rather than the `View` it renders, which carries the
        // role too and none of the handlers.
        typeof node.props?.onPress === 'function'
    );
  return { on: buttons[0]!, off: buttons[1]! };
}

function typeName(value: string) {
  const field = tree.root.findAll((node) => node.type === TextInput)[0]!;
  act(() => field.props.onChangeText(value));
  return field;
}

it('records the rename as saved when it reached the socket', () => {
  open();
  const field = typeName('Thursdays');
  act(() => field.props.onBlur());

  expect(mockApp.act).toHaveBeenCalledWith(channel.id, {
    type: 'SET_NAME',
    name: 'Thursdays',
  });

  // Blurring again with nothing changed says nothing twice.
  mockApp.act.mockClear();
  act(() => field.props.onBlur());
  expect(mockApp.act).not.toHaveBeenCalled();
});

it('retries a rename that was only queued', () => {
  open();
  // The socket is down: the action is held, and nothing may be concluded.
  mockApp.act.mockReturnValue(false);
  const field = typeName('Thursdays');
  act(() => field.props.onBlur());
  expect(mockApp.act).toHaveBeenCalledTimes(1);

  // Back, and the next thing this screen does tries again. This is the whole
  // point: the old code recorded the queued write as saved, so `name` and
  // `saved.current.name` agreed and Done dispatched nothing at all — the
  // premature record was what suppressed the retry, not merely a wrong note.
  mockApp.act.mockReturnValue(true);
  act(() => field.props.onSubmitEditing?.());

  expect(mockApp.act).toHaveBeenCalledTimes(2);
  expect(mockApp.act).toHaveBeenLastCalledWith(channel.id, {
    type: 'SET_NAME',
    name: 'Thursdays',
  });
});

/** Taps the destructive button in the most recent Alert. */
function confirmAlert(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls[spy.mock.calls.length - 1]![2] as Array<{
    text: string;
    onPress?: () => void;
  }>;
  act(() => buttons.find((b) => b.text === label)!.onPress?.());
}

it('leaves the screen only when the leave reached the socket', () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  open();

  mockApp.act.mockReturnValue(false);
  const leave = findButton(tree, 'Leave channel');
  expect(leave).toBeTruthy();
  act(() => leave!.props.onPress());
  confirmAlert('Leave');

  // Still a member, so still on the screen. Navigating away here used to put
  // somebody on a home screen that still listed the channel they had just
  // been told they left.
  expect(onLeft).not.toHaveBeenCalled();

  mockApp.act.mockReturnValue(true);
  act(() => leave!.props.onPress());
  confirmAlert('Leave');
  expect(onLeft).toHaveBeenCalled();
});

/**
 * Only a named channel can be public, which the server holds at both ends —
 * `setPublic` refuses an unnamed channel and `SET_NAME` refuses to empty a
 * public one. This screen is where somebody meets the rule, and it has to
 * meet them before the refusal does: the field to fix it with is the first
 * card above, and a refused socket action is rendered nowhere on this screen.
 */
describe('a public page needs a name', () => {
  it('refuses On while the channel is unnamed, and says why', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    open();
    expect(publicPage().on.props.accessibilityState.disabled).toBe(true);
    expect(
      tree.root
        .findAll((n) => typeof n.props?.children === 'string')
        .some((n) =>
          String(n.props.children).includes('Name this channel first')
        )
    ).toBe(true);

    // And the press does nothing at all. The confirmation is what stands in
    // front of the request, so a press that does not raise one cannot reach it
    // — which is asserted here rather than on the request itself because a
    // disabled `Pressable` swallows the press in the app and this test is
    // calling the handler directly, past it.
    act(() => publicPage().on.props.onPress());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockApp.setChannelPublic).not.toHaveBeenCalled();
  });

  it('offers On once the channel has a name', () => {
    open({ name: 'Thursday mornings' });
    expect(publicPage().on.props.accessibilityState.disabled).toBe(false);
  });

  it('puts the name back rather than emptying it while the page is on', () => {
    open({ name: 'Thursday mornings', publicAt: 1_700_000_000_000 });
    const field = typeName('');
    act(() => field.props.onBlur());

    // Nothing was sent — the server would refuse it, and the refusal arrives
    // as a socket error this screen does not render.
    expect(mockApp.act).not.toHaveBeenCalled();
    const restored = tree.root.findAll((node) => node.type === TextInput)[0]!;
    expect(restored.props.value).toBe('Thursday mornings');
  });

  it('still renames a public channel to something else', () => {
    open({ name: 'Thursday mornings', publicAt: 1_700_000_000_000 });
    const field = typeName('Thursday evenings');
    act(() => field.props.onBlur());
    expect(mockApp.act).toHaveBeenCalledWith(channel.id, {
      type: 'SET_NAME',
      name: 'Thursday evenings',
    });
  });
});

/**
 * **Both directions of the public page confirm, and neither happens on the
 * press itself.** Turning it on was always guarded; turning it off was not,
 * on the reasoning that taking a page down is the safe direction — which is
 * false once a podcast app is subscribed to the feed. What is asserted here
 * is the gap: the press raises the alert and sends nothing, and only the
 * confirming button reaches `setChannelPublic`.
 */
describe('the public page confirms in both directions', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('asks before making the page, and sends only once confirmed', async () => {
    open({ name: 'Thursday mornings' });

    act(() => publicPage().on.props.onPress());
    expect(Alert.alert).toHaveBeenCalled();
    expect(mockApp.setChannelPublic).not.toHaveBeenCalled();

    confirmAlert('Create the page');
    expect(mockApp.setChannelPublic).toHaveBeenCalledWith(channel.id, true);
    // The call settles into `busy` and the new address after the body has
    // finished; flushed here so the state lands inside an `act` rather than
    // during teardown.
    await act(async () => {});
  });

  it('asks before taking the page down, and sends only once confirmed', async () => {
    open({ name: 'Thursday mornings', publicAt: 1_700_000_000_000 });

    act(() => publicPage().off.props.onPress());
    expect(Alert.alert).toHaveBeenCalled();
    expect(mockApp.setChannelPublic).not.toHaveBeenCalled();

    confirmAlert('Take it down');
    expect(mockApp.setChannelPublic).toHaveBeenCalledWith(channel.id, false);
    await act(async () => {});
  });

  it('does nothing when On is pressed on a page that is already on', () => {
    open({ name: 'Thursday mornings', publicAt: 1_700_000_000_000 });
    act(() => publicPage().on.props.onPress());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockApp.setChannelPublic).not.toHaveBeenCalled();
  });

  it('does nothing when Off is pressed on a channel that has no page', () => {
    open({ name: 'Thursday mornings' });
    act(() => publicPage().off.props.onPress());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockApp.setChannelPublic).not.toHaveBeenCalled();
  });
});

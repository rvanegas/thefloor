import React from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
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

function open() {
  mockApp.me = { id: ME, displayName: 'Me' } as typeof mockApp.me;
  tree = render(
    <ChannelSettingsView
      publicAt={null}
      channel={channel}
      derivedTitle="Dana Chu"
      onBack={onBack}
      onLeft={onLeft}
    />
  );
  return tree;
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

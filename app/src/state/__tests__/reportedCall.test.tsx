import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import {
  useReportedCall,
  type ReportedCallBridge,
  type ReportedCallState,
} from '../useReportedCall';
import { useChannelLink } from '../useChannelLink';

/**
 * The ways the *reported call* and the app reach each other: its title and its
 * mute, which follow the app; a mute or an End the system asked for, which come
 * back as the card's Mute and Out; being held for another call, which the
 * room is told; and a tap in Recents, which opens the channel and does not
 * step in.
 */

function fakeBridge(heldAtStart = false) {
  let mute: (muted: boolean) => void = () => {};
  let end: () => void = () => {};
  let held: (value: boolean) => void = () => {};
  const bridge: ReportedCallBridge = {
    setTitle: jest.fn(),
    setMuted: jest.fn(),
    subscribeMute: (handle) => {
      mute = handle;
      return () => {
        mute = () => {};
      };
    },
    subscribeEnd: (handle) => {
      end = handle;
      return () => {
        end = () => {};
      };
    },
    isHeld: () => heldAtStart,
    subscribeHeld: (handle) => {
      held = handle;
      return () => {
        held = () => {};
      };
    },
  };
  return {
    bridge,
    systemMute: (muted: boolean) => mute(muted),
    systemEnd: () => end(),
    systemHeld: (value: boolean) => held(value),
  };
}

const stood = (over: Partial<ReportedCallState> = {}): ReportedCallState => ({
  channelId: 'chan-1',
  title: 'Ana and Bea',
  muted: false,
  canToggle: true,
  onAnotherCall: false,
  ...over,
});

function mount(call: ReportedCallState | null, heldAtStart = false) {
  const fake = fakeBridge(heldAtStart);
  const setMute = jest.fn();
  const stepOut = jest.fn();
  const onAnotherCall = jest.fn();
  function Probe({ state }: { state: ReportedCallState | null }) {
    useReportedCall(state, setMute, stepOut, onAnotherCall, fake.bridge);
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe state={call} />);
  });
  const update = (state: ReportedCallState | null) =>
    act(() => {
      tree.update(<Probe state={state} />);
    });
  return { ...fake, setMute, stepOut, onAnotherCall, update };
}

describe('an End the app did not ask for', () => {
  it('steps out of the channel this device stands in', () => {
    const { systemEnd, stepOut } = mount(stood());
    act(() => systemEnd());
    expect(stepOut).toHaveBeenCalledWith('chan-1');
  });

  it('reads the channel when the End arrives, not when it was subscribed', () => {
    const { systemEnd, stepOut, update } = mount(stood());
    update(stood({ channelId: 'chan-2' }));
    act(() => systemEnd());
    expect(stepOut).toHaveBeenCalledWith('chan-2');
  });

  it('does nothing when no channel is stood in', () => {
    const { systemEnd, stepOut } = mount(null);
    act(() => systemEnd());
    expect(stepOut).not.toHaveBeenCalled();
  });
});

describe('what the call is shown as', () => {
  it("is the channel's title, and follows it when it changes", () => {
    const { bridge, update } = mount(stood({ title: 'Ana' }));
    expect(bridge.setTitle).toHaveBeenLastCalledWith('chan-1', 'Ana');

    // An unnamed channel's title, when a second person arrives.
    update(stood({ title: 'Ana and Bea' }));
    expect(bridge.setTitle).toHaveBeenLastCalledWith('chan-1', 'Ana and Bea');
    expect(bridge.setTitle).toHaveBeenCalledTimes(2);
  });

  it('is not sent without a channel', () => {
    const { bridge } = mount(null);
    expect(bridge.setTitle).not.toHaveBeenCalled();
  });
});

describe('the mute, kept in step', () => {
  it("follows the app's mute, and only when it changes", () => {
    const { bridge, update } = mount(stood({ muted: false }));
    expect(bridge.setMuted).toHaveBeenLastCalledWith('chan-1', false);

    update(stood({ muted: true }));
    expect(bridge.setMuted).toHaveBeenLastCalledWith('chan-1', true);

    // A new title is not a new mute.
    update(stood({ muted: true, title: 'Ana' }));
    expect(bridge.setMuted).toHaveBeenCalledTimes(2);
  });

  it('acts on a mute the system asked for, as the state asked for', () => {
    const { systemMute, setMute } = mount(stood({ muted: false }));
    act(() => systemMute(true));
    expect(setMute).toHaveBeenCalledWith('chan-1', true);
  });

  /**
   * The case the guard is for. The floor-holder may not mute themselves, and a
   * device with no microphone has nothing to unmute; the card greys its button,
   * and a car's screen cannot be greyed — so the app's own mute is sent back,
   * which puts CallKit's flag where the app is.
   */
  it('undoes a mute the card would have refused, without acting', () => {
    const { bridge, systemMute, setMute } = mount(stood({ muted: true, canToggle: false }));
    (bridge.setMuted as jest.Mock).mockClear();

    act(() => systemMute(false));

    expect(setMute).not.toHaveBeenCalled();
    expect(bridge.setMuted).toHaveBeenCalledWith('chan-1', true);
  });

  it('ignores a system mute with no channel stood in', () => {
    const { systemMute, setMute, bridge } = mount(null);
    act(() => systemMute(true));
    expect(setMute).not.toHaveBeenCalled();
    expect(bridge.setMuted).not.toHaveBeenCalled();
  });
});

describe('being held for another call', () => {
  it('tells the room when the call is held, and again when it is not', () => {
    const { systemHeld, onAnotherCall, update } = mount(stood());
    expect(onAnotherCall).not.toHaveBeenCalled();

    act(() => systemHeld(true));
    expect(onAnotherCall).toHaveBeenLastCalledWith('chan-1', true);
    update(stood({ onAnotherCall: true }));

    act(() => systemHeld(false));
    expect(onAnotherCall).toHaveBeenLastCalledWith('chan-1', false);
    update(stood({ onAnotherCall: false }));
    expect(onAnotherCall).toHaveBeenCalledTimes(2);
  });

  /**
   * A reconnect's arrival clears `onAnotherCall` on the server, and a phone
   * still held must say so again rather than reading as *Present*.
   */
  it('says it again when the room forgets', () => {
    const { systemHeld, onAnotherCall, update } = mount(stood());
    act(() => systemHeld(true));
    update(stood({ onAnotherCall: true }));
    onAnotherCall.mockClear();

    update(stood({ onAnotherCall: false }));
    expect(onAnotherCall).toHaveBeenCalledWith('chan-1', true);
  });

  /**
   * A call that ends while held is a step-out, and the module says `held
   * false` as it goes. Before it did, this hook went on holding `true`, and
   * the next step-in told the room *On another call* with nothing left to
   * take it back.
   */
  it('does not carry a hold that ended with the call into the next step-in', () => {
    const { systemHeld, onAnotherCall, update } = mount(stood());
    act(() => systemHeld(true));
    update(stood({ onAnotherCall: true }));

    update(null);
    act(() => systemHeld(false));
    onAnotherCall.mockClear();

    update(stood());
    expect(onAnotherCall).not.toHaveBeenCalled();
  });

  it('starts from what the module already knows', () => {
    const { onAnotherCall } = mount(stood(), true);
    expect(onAnotherCall).toHaveBeenCalledWith('chan-1', true);
  });

  it('sends nothing while the room already agrees, or with no channel', () => {
    const { onAnotherCall } = mount(stood());
    expect(onAnotherCall).not.toHaveBeenCalled();
    const none = mount(null, true);
    expect(none.onAnotherCall).not.toHaveBeenCalled();
  });
});

describe('a tap in Recents', () => {
  let linked: string | null = null;
  function Probe({
    take,
    subscribe,
  }: {
    take: () => string | null;
    subscribe: (handle: (id: string) => void) => () => void;
  }) {
    linked = useChannelLink(take, subscribe).linked;
    return null;
  }

  beforeEach(() => {
    linked = null;
  });

  // Stable across renders, as the module's own functions are: they are the
  // effect's dependencies.
  const none = () => () => {};

  it('opens the channel a cold launch was waiting with', async () => {
    const take = () => 'chan-cold';
    await act(async () => {
      renderer.create(<Probe take={take} subscribe={none} />);
    });
    expect(linked).toBe('chan-cold');
  });

  it('opens the channel tapped while the app is running', async () => {
    let tap: (id: string) => void = () => {};
    const take = () => null;
    const subscribe = (handle: (id: string) => void) => {
      tap = handle;
      return () => {};
    };
    await act(async () => {
      renderer.create(<Probe take={take} subscribe={subscribe} />);
    });
    expect(linked).toBeNull();
    await act(async () => tap('chan-warm'));
    expect(linked).toBe('chan-warm');
  });
});

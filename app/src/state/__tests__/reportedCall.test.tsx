import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useReportedCall } from '../useReportedCall';
import { useChannelLink } from '../useChannelLink';

/**
 * The two ways the *reported call* reaches back into the app: an End this app
 * did not ask for, which is stepping out, and a tap in Recents, which opens the
 * channel and does not step in.
 */

describe('an End the app did not ask for', () => {
  function harness(channelId: string | null) {
    let fire: () => void = () => {};
    const subscribe = (handle: () => void) => {
      fire = handle;
      return () => {
        fire = () => {};
      };
    };
    const stepOut = jest.fn();
    const titled = jest.fn();
    function Probe({ channel }: { channel: string | null }) {
      useReportedCall(channel, channel ? 'Ana and Bea' : null, stepOut, subscribe, titled);
      return null;
    }
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe channel={channelId} />);
    });
    return { fire: () => fire(), stepOut, tree, Probe };
  }

  it('steps out of the channel this device stands in', () => {
    const { fire, stepOut } = harness('chan-1');
    act(() => fire());
    expect(stepOut).toHaveBeenCalledWith('chan-1');
  });

  it('reads the channel when the End arrives, not when it was subscribed', () => {
    const { fire, stepOut, tree, Probe } = harness('chan-1');
    act(() => {
      tree.update(<Probe channel="chan-2" />);
    });
    act(() => fire());
    expect(stepOut).toHaveBeenCalledWith('chan-2');
  });

  it('does nothing when no channel is stood in', () => {
    const { fire, stepOut } = harness(null);
    act(() => fire());
    expect(stepOut).not.toHaveBeenCalled();
  });
});

describe('what the call is shown as', () => {
  const none = () => () => {};

  it("is the channel's title, and follows it when it changes", () => {
    const titled = jest.fn();
    function Probe({ title }: { title: string }) {
      useReportedCall('chan-1', title, jest.fn(), none, titled);
      return null;
    }
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe title="Ana" />);
    });
    expect(titled).toHaveBeenLastCalledWith('chan-1', 'Ana');

    // An unnamed channel's title, when a second person arrives.
    act(() => {
      tree.update(<Probe title="Ana and Bea" />);
    });
    expect(titled).toHaveBeenLastCalledWith('chan-1', 'Ana and Bea');
    expect(titled).toHaveBeenCalledTimes(2);
  });

  it('is not sent without a channel', () => {
    const titled = jest.fn();
    function Probe() {
      useReportedCall(null, null, jest.fn(), none, titled);
      return null;
    }
    act(() => {
      renderer.create(<Probe />);
    });
    expect(titled).not.toHaveBeenCalled();
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

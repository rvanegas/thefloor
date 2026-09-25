import React from 'react';
import renderer, {
  act as reactAct,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { DISCONNECT_GRACE_MS } from '../../../../core/constants';
import { DEFAULT_NOTIFICATION_LEVEL } from '../../../../core/notifications';
import type { ChannelState } from '../../../../core/types';
import type { ChannelView } from '../../../../core/protocol';
import * as liveActivity from '../../../modules/live-activity';
import type { LockScreenState } from '../../../modules/live-activity';
import { lockScreenStateFor, useLockScreen } from '../useLockScreen';
import { channelOfUrl } from '../useChannelLink';
import { en } from '../../i18n/en';

/**
 * The card on the lock screen: what it says, and what its Mute button does.
 *
 * **The rule being defended is that the card and the footer describe one
 * microphone.** `ui/ChannelView.tsx` folds three causes into one appearance —
 * you self-muted, the device has no input, somebody else's claim is silencing
 * you — and calls the result *you are not being heard*. A card wired to the
 * reducer's `selfMuted` instead would be wrong about two of the three, and
 * would offer an Unmute on a Mac mini that cannot open anything. These tests
 * are what stop that narrowing.
 *
 * The other rule is about a *stale* card. A tap can arrive minutes after the
 * card was drawn, from a phone that has been in a pocket, and the channel it
 * should act on is the one being stood in now.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const T0 = 1_700_000_000_000;

function channelWith(present: string[]): ChannelState {
  let channel = createChannel({
    id: 'chan_one',
    initiator: ME,
    invitees: [THEM],
    now: T0,
  });
  for (const userId of [ME, THEM]) {
    const wanted = present.includes(userId);
    if (wanted === channel.present.includes(userId)) continue;
    channel = reduce(
      channel,
      { type: wanted ? 'ENTER' : 'STEP_OUT', userId },
      T0
    );
  }
  return channel;
}

function viewOf(channel: ChannelState): ChannelView {
  return {
    channel,
    participants: [
      { id: ME, displayName: 'Me' },
      { id: THEM, displayName: 'Dana' },
    ],
    recordings: [],
    pingableAt: {},
    notificationLevel: DEFAULT_NOTIFICATION_LEVEL,
    serverNow: T0,
  };
}

describe('lockScreenStateFor', () => {
  it('names the channel after who is in it when nobody has named it', () => {
    const state = lockScreenStateFor(viewOf(channelWith([ME, THEM])), ME, true, en.lockScreen, en.naming);
    // `describeChannel` over the others, which is what the header, the list
    // row and the profile card all draw. A card headed `null` is the bug.
    expect(state.channelName).toBe('Dana');
  });

  it('counts a device with no microphone as muted, and offers no unmute', () => {
    const state = lockScreenStateFor(viewOf(channelWith([ME, THEM])), ME, false, en.lockScreen, en.naming);
    expect(state.muted).toBe(true);
    // Grey rather than a button that would promise a microphone there is not.
    expect(state.canToggle).toBe(false);
  });

  it('offers Mute to somebody present and unmuted', () => {
    const state = lockScreenStateFor(viewOf(channelWith([ME, THEM])), ME, true, en.lockScreen, en.naming);
    expect(state.muted).toBe(false);
    expect(state.canToggle).toBe(true);
  });

  it('greys the button for the floor-holder, who may not mute themselves', () => {
    const channel = reduce(
      channelWith([ME, THEM]),
      { type: 'CLAIM_FLOOR', userId: ME },
      T0
    );
    const state = lockScreenStateFor(viewOf(channel), ME, true, en.lockScreen, en.naming);
    expect(state.muted).toBe(false);
    // `canSetSelfMute` refuses it: the way to stop talking is to release.
    expect(state.canToggle).toBe(false);
  });

  it('keeps the button live for somebody silenced by another claim', () => {
    const channel = reduce(
      channelWith([ME, THEM]),
      { type: 'CLAIM_FLOOR', userId: THEM },
      T0
    );
    const state = lockScreenStateFor(viewOf(channel), ME, true, en.lockScreen, en.naming);
    // Their mute does nothing while the claim stands, and it is still theirs
    // to set — it is what they are left with when the claim ends. The footer
    // keeps the control live here too.
    expect(state.canToggle).toBe(true);
  });
});

/** A harness that drives the hook and records what reached the native side. */
function harness() {
  const shown: LockScreenState[] = [];
  let hidden = 0;
  const acted: Array<{ channelId: string; muted: boolean }> = [];
  let fire: ((muted: boolean) => void) | null = null;

  const show = (state: LockScreenState) => {
    shown.push(state);
  };
  const hide = () => {
    hidden += 1;
  };
  const subscribe = (handle: (muted: boolean) => void) => {
    fire = handle;
    return () => {
      fire = null;
    };
  };
  const onSetMute = (channelId: string, muted: boolean) => {
    acted.push({ channelId, muted });
  };

  function Probe({
    view,
    inputAvailable = true,
    inTouch = true,
  }: {
    view: ChannelView | null;
    inputAvailable?: boolean;
    inTouch?: boolean;
  }) {
    useLockScreen(
      view,
      ME,
      inputAvailable,
      inTouch,
      onSetMute,
      show,
      hide,
      subscribe
    );
    return null;
  }

  return {
    shown,
    acted,
    hidden: () => hidden,
    tap: (muted: boolean) => fire?.(muted),
    Probe,
  };
}

describe('useLockScreen', () => {
  it('puts the card up while present and takes it down on stepping out', () => {
    const h = harness();
    let tree!: ReactTestRenderer;
    reactAct(() => {
      tree = renderer.create(<h.Probe view={viewOf(channelWith([ME, THEM]))} />);
    });
    expect(h.shown).toHaveLength(1);
    expect(h.shown[0].channelId).toBe('chan_one');

    reactAct(() => {
      tree.update(<h.Probe view={null} />);
    });
    expect(h.hidden()).toBeGreaterThan(0);
  });

  it('does not re-push a card that has not changed', () => {
    const h = harness();
    const view = viewOf(channelWith([ME, THEM]));
    let tree!: ReactTestRenderer;
    reactAct(() => {
      tree = renderer.create(<h.Probe view={view} />);
    });
    // A fresh snapshot object carrying the same four scalars. In a busy room
    // this arrives several times a second, and ActivityKit should not hear
    // about any of them.
    reactAct(() => {
      tree.update(<h.Probe view={viewOf(channelWith([ME, THEM]))} />);
    });
    expect(h.shown).toHaveLength(1);
  });

  it('acts on the channel being stood in now, not the one the card was drawn for', () => {
    const h = harness();
    let tree!: ReactTestRenderer;
    reactAct(() => {
      tree = renderer.create(<h.Probe view={viewOf(channelWith([ME, THEM]))} />);
    });
    reactAct(() => {
      h.tap(true);
    });
    expect(h.acted).toEqual([{ channelId: 'chan_one', muted: true }]);

    // Stepped out. A tap arriving now — from a card iOS has not yet taken
    // down — must not mute a channel nobody is in.
    reactAct(() => {
      tree.update(<h.Probe view={null} />);
    });
    reactAct(() => {
      h.tap(true);
    });
    expect(h.acted).toHaveLength(1);
  });

  it('ignores a tap on a button that should be grey', () => {
    const h = harness();
    reactAct(() => {
      renderer.create(
        <h.Probe view={viewOf(channelWith([ME, THEM]))} inputAvailable={false} />
      );
    });
    reactAct(() => {
      h.tap(false);
    });
    // A card can be a moment stale, and the disabled state is the app's answer
    // rather than the extension's. Honouring the tap anyway would re-open a
    // microphone the reducer has no device for.
    expect(h.acted).toHaveLength(0);
  });

  it('holds the card through a blip and takes it down once the grace is out', () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      const view = viewOf(channelWith([ME, THEM]));
      let tree!: ReactTestRenderer;
      reactAct(() => {
        tree = renderer.create(<h.Probe view={view} />);
      });
      expect(h.shown).toHaveLength(1);

      // Out of touch. The last snapshot still says this account is in the
      // room, and for the length of the server's grace it still is.
      reactAct(() => {
        tree.update(<h.Probe view={view} inTouch={false} />);
      });
      reactAct(() => {
        jest.advanceTimersByTime(DISCONNECT_GRACE_MS - 1);
      });
      expect(h.hidden()).toBe(0);

      // And out of it. The server has run `DISCONNECT_EXPIRED` by now, so the
      // card is describing a conversation this device is no longer in.
      reactAct(() => {
        jest.advanceTimersByTime(1);
      });
      expect(h.hidden()).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('puts the card back when contact returns inside the grace', () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      const view = viewOf(channelWith([ME, THEM]));
      let tree!: ReactTestRenderer;
      reactAct(() => {
        tree = renderer.create(<h.Probe view={view} />);
      });
      reactAct(() => {
        tree.update(<h.Probe view={view} inTouch={false} />);
      });
      reactAct(() => {
        jest.advanceTimersByTime(DISCONNECT_GRACE_MS / 2);
      });
      reactAct(() => {
        tree.update(<h.Probe view={view} />);
      });
      reactAct(() => {
        jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
      });
      // A tunnel is not a departure: nothing was taken down and nothing was
      // pushed a second time.
      expect(h.hidden()).toBe(0);
      expect(h.shown).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a tap that arrives after the grace has run out', () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      const view = viewOf(channelWith([ME, THEM]));
      let tree!: ReactTestRenderer;
      reactAct(() => {
        tree = renderer.create(<h.Probe view={view} />);
      });
      reactAct(() => {
        tree.update(<h.Probe view={view} inTouch={false} />);
      });
      reactAct(() => {
        jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
      });
      // iOS may not have taken the card down yet, and the button on it is
      // for a channel this account has been removed from.
      reactAct(() => {
        h.tap(true);
      });
      expect(h.acted).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('carries the word that was on the button rather than a toggle', () => {
    const h = harness();
    reactAct(() => {
      renderer.create(<h.Probe view={viewOf(channelWith([ME, THEM]))} />);
    });
    // The card said Mute, so the tap means muted — even though a toggle read
    // off a stale card could have meant the opposite.
    reactAct(() => {
      h.tap(true);
    });
    expect(h.acted).toEqual([{ channelId: 'chan_one', muted: true }]);
  });
});

describe('useLockScreen, on its own defaults', () => {
  /**
   * The tests above hand the hook stable spies, which is the shape that makes
   * one particular bug invisible: defaults written inline in the parameter
   * list are a new function identity on every render, so the effect that
   * depends on them re-runs every render and pushes the card to ActivityKit
   * several times a second — with `key` comparing equal the whole time.
   *
   * This renders the hook the way `App.tsx` does, passing nothing, and counts
   * what reached the module.
   */
  it('pushes once across many renders when nothing has changed', () => {
    const show = jest.spyOn(liveActivity, 'showLockScreen');
    show.mockResolvedValue(true);
    function Probe({ view }: { view: ChannelView | null }) {
      useLockScreen(view, ME, true, true, () => {});
      return null;
    }
    let tree!: ReactTestRenderer;
    reactAct(() => {
      tree = renderer.create(<Probe view={viewOf(channelWith([ME, THEM]))} />);
    });
    for (let i = 0; i < 4; i += 1) {
      reactAct(() => {
        tree.update(<Probe view={viewOf(channelWith([ME, THEM]))} />);
      });
    }
    expect(show).toHaveBeenCalledTimes(1);
    show.mockRestore();
  });
});

describe('channelOfUrl', () => {
  it('reads the channel out of the card’s link', () => {
    expect(channelOfUrl('thefloor://channel/chan_one')).toBe('chan_one');
  });

  it('ignores anything that is not a channel link', () => {
    expect(channelOfUrl(null)).toBeNull();
    expect(channelOfUrl('https://thefloor.rvanegas.co/app')).toBeNull();
    // An invite link has its own handling, and answering it by opening a
    // channel named after its pin is the failure this guards.
    expect(channelOfUrl('thefloor://invite/123456')).toBeNull();
    // And the address the invite page actually emits, which is the one that
    // matters: `useInviteLink` answers it, and a channel called `annak` is what
    // this would otherwise open. See `inviteLink.test.ts`.
    expect(channelOfUrl('thefloor://i/annak/042317')).toBeNull();
    expect(channelOfUrl('thefloor://channel/')).toBeNull();
  });
});

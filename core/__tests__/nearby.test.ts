import {
  canPing,
  subscribeable,
  createChannel,
  idleMs,
  isPresent,
  isWaiting,
  nearbyMs,
  reduce,
} from '../channel';
import { WAITING_WINDOW_MS } from '../constants';
import type { ChannelState } from '../types';

/**
 * Nearby, declared — the one wire addition of the 2026-09-08 redesign.
 *
 * *Nearby* had one way in, and it was something that happened **to** somebody:
 * you were present, your socket went before the attention window expired, and
 * the grace period filed you under `waiting`. It now has three, and the two
 * new ones are deliberate — *be nearby* from outside a channel, and *be
 * nearby* from inside one, which abandons the claim on the audio system. One
 * name for both since 2026-09-09, when it also gained a way out.
 *
 * What is tested here is that the declared kinds are indistinguishable from
 * the inferred one everywhere it matters: the same field and the same ping.
 *
 * **Not the same clock, since 2026-09-09.** That was the fourth item in this
 * list for a day, and it was the bug: an inferred wait is timed from the last
 * sign of life, and a declared one from the declaration, because a tap *is* a
 * sign of life. The two questions differ, so the two answers do. See
 * `nearbyMs`, and § *The second clock* below.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const alone = (): ChannelState =>
  createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });

/** The same fixture under a name the later describes can use unshadowed. */
const alone_ = alone;

const together = () => reduce(alone(), { type: 'ENTER', userId: B }, T0 + 1_000);

const declare = (state: ChannelState, who: string, now = T0 + 2_000) =>
  reduce(state, { type: 'DECLARE_NEARBY', userId: who }, now);

describe('declaring nearby from inside a channel', () => {
  it('gives up presence and lands in the same field a dropped connection does', () => {
    const s = declare(together(), B);
    expect(isPresent(s, B)).toBe(false);
    expect(s.waiting).toContain(B);
  });

  it('makes them pingable, which is the whole of what nearby is for', () => {
    expect(canPing(together(), A, B)).toBe(false);
    expect(canPing(declare(together(), B), A, B)).toBe(true);
  });

  it('does not stamp `lastPresentAt`, which answers a different question', () => {
    // The stamp is left to the transport, so it goes on being refreshed while
    // the app is alive and freezes when the phone suspends — and the fifteen
    // minutes to *Stepped out* is measured from the last sign of life rather
    // than from the declaration. A tap on Step Out stamps it; this must not,
    // or a phone that declares nearby and is pocketed would read as having
    // been here right up to the moment it was put away.
    const before = together();
    const s = declare(before, B, T0 + 60_000);
    expect(s.lastPresentAt[B]).toBe(before.lastPresentAt[B]);
  });

  it('clears the self-mute and the floor, as every departure does', () => {
    const muted = reduce(
      together(),
      { type: 'SET_SELF_MUTE', userId: B, muted: true },
      T0 + 1_500
    );
    const claimed = reduce(muted, { type: 'CLAIM_FLOOR', userId: B }, T0 + 1_600);
    const s = declare(claimed, B);
    expect(s.selfMuted[B]).toBe(false);
    expect(s.floor.holder).toBeNull();
  });
});

describe('stepping in nearby, from outside', () => {
  it('adds nobody to the room', () => {
    const s = declare(alone(), B);
    expect(isPresent(s, B)).toBe(false);
    expect(s.present).toEqual([A]);
    expect(s.waiting).toContain(B);
  });

  it('is idempotent, a second declaration changing nothing', () => {
    const once = declare(alone(), B);
    expect(declare(once, B, T0 + 3_000)).toBe(once);
  });

  it('does not disturb the ordering of Home', () => {
    // `lastActiveAt` says when the room was last a room. Somebody declaring
    // themselves reachable has not been in it, so a channel must not float to
    // the top of anybody's list on the strength of it.
    const before = alone();
    expect(declare(before, B, T0 + 9_000).lastActiveAt).toBe(before.lastActiveAt);
  });

  it('is refused to somebody who is not a member', () => {
    const before = alone();
    expect(declare(before, 'user-c')).toBe(before);
  });

  it('is cleared by walking in, like every other kind of waiting', () => {
    const nearby = declare(alone(), B);
    const entered = reduce(nearby, { type: 'ENTER', userId: B }, T0 + 4_000);
    expect(entered.waiting).not.toContain(B);
    expect(isPresent(entered, B)).toBe(true);
  });
});

/**
 * The way off the rung, added 2026-09-09 with the three-state controls.
 *
 * Until then `stepOut` returned the state untouched for anybody who was not
 * present, so a declaration could only be ended by stepping in — or by the
 * fifteen-minute window ageing it out, which is not something anybody can
 * choose. See planning/decisions/2026-09-09-presence-is-a-ladder.md.
 */
describe('stepping out of nearby', () => {
  const nearby = () => declare(alone(), B);
  const stepOut = (state: ChannelState, who: string, now = T0 + 5_000) =>
    reduce(state, { type: 'STEP_OUT', userId: who }, now);

  it('ends the declaration', () => {
    const s = stepOut(nearby(), B);
    expect(s.waiting).not.toContain(B);
    expect(isPresent(s, B)).toBe(false);
  });

  it('puts the roster card back to stepped out', () => {
    // The one thing anybody else can see about a declaration: `isWaiting` is
    // what the roster reads, and it is *Nearby* against *Stepped out*. Being
    // worth calling is not affected either way — `canPing` asks only whether
    // somebody is out of earshot, which they are on both rungs.
    // Declared from inside, so there is a `lastPresentAt` for the window to
    // be measured against — the roster says *Nearby* for fifteen minutes from
    // the last sign of life, and nothing at all for somebody it has never
    // heard from.
    const inside = declare(together(), B);
    expect(isWaiting(inside, B)).toBe(true);
    expect(isWaiting(stepOut(inside, B), B)).toBe(false);
    expect(canPing(stepOut(inside, B), A, B)).toBe(true);
  });

  it('does not stamp the clocks, having been in nobody\'s room', () => {
    // `lastPresentAt` would claim they were here until this moment, which is
    // the lie the whole `Exit` distinction exists to avoid — they were not.
    // `lastActiveAt` orders Home by when a room was last a room, and
    // withdrawing a claim on a notification is not the room going quiet.
    const before = nearby();
    const s = stepOut(before, B, T0 + 60_000);
    expect(s.lastPresentAt[B]).toBe(before.lastPresentAt[B]);
    expect(s.lastActiveAt).toBe(before.lastActiveAt);
  });

  it('changes nothing for somebody who was not nearby', () => {
    const before = alone();
    expect(stepOut(before, B)).toBe(before);
  });

  it('is how a wait ends when attention runs out, since 2026-09-09', () => {
    // **This reverses what it asserted for a day.** It read: a clock firing
    // has nothing to say about a declaration, and only a chosen departure ends
    // a wait — which left `ATTENTION_EXPIRED` a no-op for anybody nearby, and
    // so left the rung with no way out at all except stepping in or stepping
    // out by hand. What ended it instead was a fifteen-minute window applied
    // on each reader's screen, which is how two screens came to disagree.
    //
    // The two clocks firing are still not the same event. `DISCONNECT_EXPIRED`
    // *files* somebody under nearby — their phone went, and they are within
    // reach. `ATTENTION_EXPIRED` is the rung below: they have stopped
    // attending anything, and are no longer within reach of anybody.
    const dropped = reduce(
      reduce(together(), { type: 'DISCONNECTED', userId: B }, T0 + 2_000),
      { type: 'DISCONNECT_EXPIRED', userId: B },
      T0 + 120_000
    );
    expect(dropped.waiting).toContain(B);

    const expired = reduce(
      dropped,
      { type: 'ATTENTION_EXPIRED', userId: B },
      T0 + 130_000
    );
    expect(expired.waiting).not.toContain(B);
    expect(isWaiting(expired, B)).toBe(false);
    // And it takes the declaration's clock with it, exactly as a tap does —
    // there is no wait left for it to be timing.
    expect(expired.declaredNearbyAt[B]).toBeUndefined();
    // Still not a claim that they were in the room until this moment.
    expect(expired.lastPresentAt[B]).toBe(dropped.lastPresentAt[B]);
  });

  it('says nothing about somebody who was not waiting at all', () => {
    // Stepped out an hour ago and inattentive ever since: there is no wait to
    // end, and the tick must not manufacture a transition to report.
    const out = reduce(together(), { type: 'STEP_OUT', userId: B }, T0);
    expect(reduce(out, { type: 'ATTENTION_EXPIRED', userId: B }, T0 + 60_000)).toBe(
      out
    );
  });
});

/**
 * The second clock.
 *
 * `waiting` holds two kinds of absence and they are timed from different
 * moments: a lost connection from the last thing anybody heard, a declaration
 * from the declaration. Reading both off `lastPresentAt` produced a card that
 * said "Nearby for four minutes" about a tap one second old, and — since the
 * window is measured from the same number — gave that declaration eleven
 * minutes of life instead of fifteen.
 */
describe('how long a wait has been going on', () => {
  const steppedOutAt = (when: number) =>
    reduce(together(), { type: 'STEP_OUT', userId: B }, when);

  it('times a declaration from the declaration, not from the last sign of life', () => {
    // The case Rodrigo asked about: stepped out four minutes ago, and presses
    // Nearby. The wait is a second old; only the silence is four minutes old.
    const four = T0 + 4 * 60_000;
    const s = declare(steppedOutAt(T0 + 1_000), B, four);
    expect(nearbyMs(s, B, four)).toBe(0);
    expect(nearbyMs(s, B, four + 30_000)).toBe(30_000);
    // And the older question still has its old answer, which is the reason
    // this is a second clock rather than a correction to the first.
    expect(idleMs(s, B, four)).toBe(4 * 60_000 - 1_000);
  });

  it('gives the declaration a full window, however old the silence', () => {
    const four = T0 + 4 * 60_000;
    const s = declare(steppedOutAt(T0 + 1_000), B, four);
    // Stated on the clock rather than on `isWaiting`, which since 2026-09-09
    // is membership: what a wait is worth is decided by the server's tick,
    // reading attention, and this is the fallback clock it reads for anybody
    // whose build does not report any. Eleven minutes in — where it used to
    // lapse — the declaration is eleven minutes old and not fifteen.
    expect(nearbyMs(s, B, four + 11 * 60_000)).toBe(11 * 60_000);
    expect(nearbyMs(s, B, four + WAITING_WINDOW_MS - 1)).toBeLessThan(
      WAITING_WINDOW_MS
    );
    expect(nearbyMs(s, B, four + WAITING_WINDOW_MS)).toBe(WAITING_WINDOW_MS);
  });

  it('accepts a declaration made after the silence outran the window', () => {
    // The sharp case, and the one that was visibly broken: past fifteen
    // minutes the declaration was recorded and `isWaiting` was false from the
    // instant it was made, so the footer lit *Nearby* while the person's own
    // roster card read *Stepped out sixteen minutes ago*.
    const late = T0 + 16 * 60_000;
    const s = declare(steppedOutAt(T0 + 1_000), B, late);
    expect(s.waiting).toContain(B);
    expect(isWaiting(s, B)).toBe(true);
    expect(nearbyMs(s, B, late)).toBe(0);
  });

  it('lets somebody be nearby in a channel they have never entered', () => {
    // No `lastPresentAt` at all, so the old clock had nothing to say and the
    // card said *Invited* for ever. A declaration is knowledge without a
    // stamp.
    const s = declare(alone(), B, T0 + 5_000);
    expect(idleMs(s, B, T0 + 5_000)).toBeNull();
    expect(nearbyMs(s, B, T0 + 5_000)).toBe(0);
    expect(isWaiting(s, B)).toBe(true);
  });

  it('times a lost connection from the last thing heard, as it always did', () => {
    // The other kind, unchanged and deliberately so: a phone in a pocket gives
    // no sign of life, so the last one is all anybody knows.
    const dropped = reduce(
      together(),
      { type: 'DISCONNECT_EXPIRED', userId: B },
      T0 + 60_000
    );
    const later = T0 + 5 * 60_000;
    expect(dropped.waiting).toContain(B);
    expect(dropped.declaredNearbyAt[B]).toBeUndefined();
    expect(nearbyMs(dropped, B, later)).toBe(idleMs(dropped, B, later));
  });

  it('drops the clock when the wait ends, from either rung', () => {
    // Left behind, it would time the *next* declaration from this one — the
    // same fault, arrived at from the other side.
    const nearbyNow = declare(together(), B, T0 + 2_000);
    expect(nearbyNow.declaredNearbyAt[B]).toBe(T0 + 2_000);

    const back = reduce(nearbyNow, { type: 'ENTER', userId: B }, T0 + 3_000);
    expect(back.declaredNearbyAt[B]).toBeUndefined();

    const gone = reduce(nearbyNow, { type: 'STEP_OUT', userId: B }, T0 + 3_000);
    expect(gone.declaredNearbyAt[B]).toBeUndefined();
  });

  it('leaves the clock alone when a declaration is repeated in place', () => {
    // The same object back, which is what the watchers need, and the same
    // stamp. **Not a rule against renewal**, which is what this test said for
    // a day: stepping out and declaring again restarts the window, and the
    // case below is that two taps in the footer do exactly that.
    const first = declare(together(), B, T0 + 2_000);
    const again = declare(first, B, T0 + 10 * 60_000);
    expect(again).toBe(first);
    expect(again.declaredNearbyAt[B]).toBe(T0 + 2_000);
  });

  /**
   * The heartbeat's half, added the same day and for the screen it fails on:
   * nearby, channel open, card reading "Nearby for 14m", and no way to reach
   * the fifteenth minute except stepping in or stepping out and back. The
   * phone was already saying it was awake and holding this channel, several
   * times a minute, and `STILL_HERE` was throwing that away because the sender
   * was not in the room.
   */
  describe('a heartbeat from somebody nearby', () => {
    const beat = (state: ChannelState, at: number) =>
      reduce(state, { type: 'STILL_HERE', userId: B }, at);

    it('keeps a live declaration from ageing', () => {
      let s = declare(together(), B, T0);
      // Fourteen minutes of heartbeats, one a minute, and it never lapses.
      for (let minute = 1; minute <= 14; minute += 1) {
        s = beat(s, T0 + minute * 60_000);
        expect(nearbyMs(s, B, T0 + minute * 60_000)).toBe(0);
      }
      expect(isWaiting(s, B)).toBe(true);
      expect(nearbyMs(s, B, T0 + 14 * 60_000)).toBe(0);
      // And it is the declaration's clock that moved, not the presence one:
      // nothing here says they were in the room.
      expect(s.lastPresentAt[B]).toBe(together().lastPresentAt[B]);
    });

    it('does not resurrect a wait that has already ended', () => {
      // A late heartbeat must not put somebody back to *Nearby* on a screen
      // that has already said *Stepped out*, without anybody declaring
      // anything. The guard used to be the window applied here; it is now
      // membership, `waiting` no longer outliving its own meaning — so what
      // this holds is that the beat cannot undo the expiry.
      const s = declare(together(), B, T0);
      const late = T0 + WAITING_WINDOW_MS + 1;
      const ended = reduce(s, { type: 'ATTENTION_EXPIRED', userId: B }, late);
      expect(isWaiting(ended, B)).toBe(false);
      expect(beat(ended, late + 1_000)).toBe(ended);
      expect(isWaiting(beat(ended, late + 1_000), B)).toBe(false);
    });

    it('leaves a dropped wait timed from the last thing heard', () => {
      // Not a claim anybody made, so not a claim a socket may renew: the whole
      // meaning of that wait is the moment the phone went quiet.
      const dropped = reduce(
        together(),
        { type: 'DISCONNECT_EXPIRED', userId: B },
        T0 + 60_000
      );
      expect(beat(dropped, T0 + 2 * 60_000)).toBe(dropped);
    });

    it('still stamps presence for somebody who is here', () => {
      const s = beat(together(), T0 + 60_000);
      expect(s.lastPresentAt[B]).toBe(T0 + 60_000);
      expect(s.declaredNearbyAt[B]).toBeUndefined();
    });
  });

  it('lets the toggle restart the window, indefinitely, and that is allowed', () => {
    // Found from a screenshot: *Out* and *Nearby* are adjacent slots, so the
    // fifteen minutes is two taps from starting again, however many times.
    //
    // Pinned rather than prevented. The window stops a stale claim outliving
    // somebody who wandered off, and a person tapping their phone is the one
    // person that cannot be true of — the tap is the same evidence of
    // attention the declaration is timed from. Blocking it would take a
    // cooldown, which is machinery to stop somebody asserting something true.
    // What this holds is that nothing accidental stands in the way.
    let s = declare(together(), B, T0);
    for (const minute of [14, 28]) {
      const at = T0 + minute * 60_000;
      s = reduce(s, { type: 'STEP_OUT', userId: B }, at);
      s = declare(s, B, at + 1_000);
      expect(nearbyMs(s, B, at + 1_000)).toBe(0);
      // A fresh fifteen from each toggle, long past the first declaration's.
      expect(isWaiting(s, B)).toBe(true);
      expect(nearbyMs(s, B, at + WAITING_WINDOW_MS - 1)).toBeLessThan(
        WAITING_WINDOW_MS
      );
    }
  });
});

/**
 * What being in a room is *for*, which is the other half of the attention
 * rule.
 *
 * The window hunts a phone in a pocket with nothing on the other end. It must
 * not catch somebody doing exactly what the application is for: listening.
 * `subscribeable` is what tells the two apart, and the whole of the rule that
 * keeps a silent listener where they are — attention itself stopped watching
 * the audio on 2026-09-09, because the audio says nothing about whether
 * anybody is there to hear it.
 */
describe('whether there is anything here to be here for', () => {
  it('is another person in the room', () => {
    expect(subscribeable(together(), B)).toBe(true);
    expect(subscribeable(together(), A)).toBe(true);
  });

  it('is not yourself', () => {
    // The solo wait, which is the case the window was written for: a phone
    // alone in a channel is holding the room open against nobody.
    const alone = reduce(alone_(), { type: 'ENTER', userId: A }, T0);
    expect(alone.present).toEqual([A]);
    expect(subscribeable(alone, A)).toBe(false);
  });

  it('is a track playing to whoever is left', () => {
    // Somebody alone with something on is not alone with nothing on. This is
    // the case that made presence worth keeping without a hand on the phone.
    const alone = reduce(alone_(), { type: 'ENTER', userId: A }, T0);
    const playing = {
      ...alone,
      playback: { ...alone.playback, status: 'playing' as const },
    };
    expect(subscribeable(playing, A)).toBe(true);
  });

  it('is a party playing, on the same reasoning', () => {
    const alone = reduce(alone_(), { type: 'ENTER', userId: A }, T0);
    const watching = {
      ...alone,
      watch: { ...alone.watch, status: 'playing' as const },
    };
    expect(subscribeable(watching, A)).toBe(true);
  });

  it('is somebody at the door, a guest being somebody to hear', () => {
    const alone = reduce(alone_(), { type: 'ENTER', userId: A }, T0);
    const withGuest = {
      ...alone,
      guests: { guest_1: { id: 'guest_1' } },
    } as unknown as typeof alone;
    expect(subscribeable(withGuest, A)).toBe(true);
  });
});

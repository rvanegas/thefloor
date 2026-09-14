import { NOT_OFFERED, type Install } from '../install';
import { arrivalOf, introduction, type Step } from '../introduction';
import { NOTHING_TRIED, type Tried } from '../tried';

/**
 * What a new account is shown, which is two different things for two cohorts
 * and nothing at all for everybody else.
 *
 * The cases worth guarding are the ones where being wrong is not a cosmetic
 * matter: showing a checklist to somebody who finished with it, and — the
 * one that decided the shape — the ladder disappearing out from under an
 * alone arrival at the moment they finally get a contact.
 */

const invite = {
  channelId: 'c1',
  from: { displayName: 'Sam' },
};

/** Everything settled, nothing done: the alone arrival at its first launch. */
const alone = {
  loaded: true,
  home: { contacts: [], rejoinable: [], invites: [] },
  arrival: 'alone' as const,
  conversedAt: null,
  tried: NOTHING_TRIED,
  /** Nothing put away by hand — the dismissal cases add their own. */
  dismissed: [],
  /** Arrived with nobody, so the first contact is somebody they brought. */
  contactsBase: 0,
  conversing: false,
  // A phone, where there is nothing to install. The browser cases say so.
  install: NOT_OFFERED as Install,
};

/** A browser with somewhere to put this and no button of its own to do it. */
const installable: Install = {
  offer: true,
  how: 'Tap Share in Safari, then Add to Home Screen.',
  prompt: false,
};

const stepsOf = (result: ReturnType<typeof introduction>): Step[] =>
  result.show === 'alone' ? result.steps : [];

const done = (result: ReturnType<typeof introduction>, id: string) =>
  stepsOf(result).find((step) => step.id === id)?.done;

/** Everything in `tried` behind somebody — half of what retires the ladder. */
const ALL_TRIED: Tried = {
  floor: true,
  nearby: true,
  guest: true,
  player: true,
};

describe('which arrival this is', () => {
  it('is invited when there is anybody at all, by any of the three routes', () => {
    expect(
      arrivalOf({ contacts: [], rejoinable: [], invites: [invite] })
    ).toBe('invited');
    expect(arrivalOf({ contacts: [{}], rejoinable: [], invites: [] })).toBe(
      'invited'
    );
    expect(arrivalOf({ contacts: [], rejoinable: [{}], invites: [] })).toBe(
      'invited'
    );
  });

  it('is alone only when all three are empty', () => {
    expect(arrivalOf({ contacts: [], rejoinable: [], invites: [] })).toBe(
      'alone'
    );
  });
});

describe('before anything is known', () => {
  it('shows nothing while the keychain is still being read', () => {
    expect(introduction({ ...alone, loaded: false }).show).toBe('none');
  });

  it('shows nothing before the first snapshot', () => {
    expect(introduction({ ...alone, home: null }).show).toBe('none');
  });

  it('shows nothing before the arrival has been latched', () => {
    expect(introduction({ ...alone, arrival: null }).show).toBe('none');
  });
});

describe('the invited arrival', () => {
  const invited = {
    ...alone,
    arrival: 'invited' as const,
    home: { contacts: [], rejoinable: [], invites: [invite] },
  };

  it('is one card rather than a list of things somebody else did', () => {
    const result = introduction(invited);
    expect(result.show).toBe('invited');
  });

  it('names who invited them, and where to go', () => {
    const result = introduction(invited);
    if (result.show !== 'invited') throw new Error('expected the card');
    expect(result.from).toBe('Sam');
    expect(result.channelId).toBe('c1');
  });

  it('still draws when the invitation has been taken up and is gone', () => {
    const result = introduction({
      ...invited,
      home: { contacts: [{}], rejoinable: [{}], invites: [] },
    });
    if (result.show !== 'invited') throw new Error('expected the card');
    // Accepted, in the channel, and not yet present in it: there is nobody to
    // name any more, and the one thing left to do is the same thing.
    expect(result.from).toBeNull();
    expect(result.channelId).toBeNull();
  });
});

describe('the alone arrival', () => {
  it('is the two account rungs, then the four things to try in a channel', () => {
    expect(stepsOf(introduction(alone)).map((step) => step.id)).toEqual([
      'somebody',
      'stepIn',
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
  });

  it('tells every rung where it is done and why it is worth doing', () => {
    // The half the labels never carried: *get somebody here* is the goal, and
    // it says nothing about which of the two lists keeps an invite link.
    for (const step of stepsOf(introduction(alone))) {
      expect(step.instruction).not.toBe('');
      expect(step.note).not.toBe('');
    }
  });

  it('ticks somebody on a request sent, not on one answered', () => {
    const result = introduction({
      ...alone,
      home: { contacts: [{}], rejoinable: [], invites: [] },
    });
    expect(done(result, 'somebody')).toBe(true);
  });

  it('ticks somebody against the line the ladder started from', () => {
    // **A count is not an act.** An account that started with a contact — an
    // invited arrival, or anybody who tapped *Show the checklist again* — has
    // not got somebody here by continuing to have them; it ticks on the next
    // one up. See `contactsBase`.
    const started = { ...alone, contactsBase: 1 };
    expect(
      done(
        introduction({
          ...started,
          home: { contacts: [{}], rejoinable: [], invites: [] },
        }),
        'somebody'
      )
    ).toBe(false);
    expect(
      done(
        introduction({
          ...started,
          home: { contacts: [{}, {}], rejoinable: [], invites: [] },
        }),
        'somebody'
      )
    ).toBe(true);
  });

  it('goes on being the ladder once they have a contact', () => {
    // The reason `arrival` is latched. Recomputed from the snapshot this
    // account would now read as invited, and the ladder would be replaced by
    // a card about an invitation nobody sent, one rung from the top.
    const result = introduction({
      ...alone,
      home: { contacts: [{}], rejoinable: [{}], invites: [] },
    });
    expect(result.show).toBe('alone');
  });

  it('leaves the last rung unticked, which is the whole mechanism', () => {
    expect(done(introduction(alone), 'stepIn')).toBe(false);
  });
});

describe('the install rung', () => {
  it('is absent where there is nothing to install — every phone, and most browsers', () => {
    expect(stepsOf(introduction(alone)).map((step) => step.id)).not.toContain(
      'install'
    );
  });

  it('sits between getting somebody here and stepping in', () => {
    // Not first: nobody installs an app they have not decided to keep. Not
    // below `stepIn`: everything under that rung is done inside a channel, and
    // this is the one rung that is about the client rather than about the
    // account or the room.
    expect(
      stepsOf(introduction({ ...alone, install: installable })).map(
        (step) => step.id
      )
    ).toEqual(['somebody', 'install', 'stepIn', 'floor', 'nearby', 'guest', 'player']);
  });

  it('says what to do in this browser rather than in general', () => {
    const step = stepsOf(introduction({ ...alone, install: installable })).find(
      (candidate) => candidate.id === 'install'
    );
    expect(step?.instruction).toBe(installable.how);
  });

  it('is never ticked, because its absence is the tick', () => {
    // An installed browser answers `NOT_OFFERED`, so there is no state to
    // remember and no row congratulating anybody.
    expect(done(introduction({ ...alone, install: installable }), 'install')).toBe(
      false
    );
  });

  it('joins the invited card, which is otherwise a card and not a list', () => {
    const invited = {
      ...alone,
      arrival: 'invited' as const,
      home: { contacts: [], rejoinable: [], invites: [invite] },
    };
    const without = introduction(invited);
    if (without.show !== 'invited') throw new Error('expected the card');
    expect(without.install).toBeNull();

    const withOffer = introduction({ ...invited, install: installable });
    if (withOffer.show !== 'invited') throw new Error('expected the card');
    expect(withOffer.install?.id).toBe('install');
  });

  it('goes with the rest of it once somebody has had a conversation', () => {
    expect(
      introduction({ ...alone, install: installable, conversing: true }).show
    ).toBe('none');
  });
});

const CONVERSED = 1_700_000_000_000;

describe('the four things to try in a channel', () => {
  it('are drawn under the two rungs, unticked, for an alone arrival', () => {
    const ids = stepsOf(introduction(alone)).map((step) => step.id);
    expect(ids).toEqual(['somebody', 'stepIn', 'floor', 'nearby', 'guest', 'player']);
    expect(done(introduction(alone), 'floor')).toBe(false);
    expect(done(introduction(alone), 'player')).toBe(false);
  });

  it('tick one at a time, off what this install has done', () => {
    const result = introduction({
      ...alone,
      tried: { ...NOTHING_TRIED, floor: true, guest: true },
    });
    expect(done(result, 'floor')).toBe(true);
    expect(done(result, 'guest')).toBe(true);
    expect(done(result, 'nearby')).toBe(false);
    expect(done(result, 'player')).toBe(false);
  });

  it('tick `step in` once a conversation has happened, which it never used to', () => {
    expect(done(introduction(alone), 'stepIn')).toBe(false);
    expect(done(introduction({ ...alone, conversedAt: CONVERSED }), 'stepIn')).toBe(
      true
    );
  });
});

describe('what an invited arrival sees', () => {
  const invitedHome = {
    contacts: [],
    rejoinable: [],
    invites: [invite],
  };

  it('is the single card until it has conversed', () => {
    expect(
      introduction({ ...alone, arrival: 'invited', home: invitedHome }).show
    ).toBe('invited');
  });

  it('becomes the four rungs afterwards, and only the four', () => {
    // The card exists because `somebody` and `stepIn` are born ticked for this
    // cohort and congratulating them on it would be theatre. These four are
    // done by nobody but the reader, so there is an honest ladder to draw —
    // but drawing the two ticked ones above it would be that same theatre.
    const result = introduction({
      ...alone,
      arrival: 'invited',
      home: invitedHome,
      conversedAt: CONVERSED,
    });
    expect(result.show).toBe('alone');
    expect(stepsOf(result).map((step) => step.id)).toEqual([
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
  });
});

describe('retirement', () => {
  it('stops the moment a conversation is happening', () => {
    expect(introduction({ ...alone, conversing: true }).show).toBe('none');
  });

  it('comes back after that conversation, with what is left', () => {
    // The reversal of 2026-09-13. The old rule retired on the first
    // conversation, which is the one moment none of the four rungs below it
    // could ever have been reached.
    const result = introduction({ ...alone, conversedAt: CONVERSED });
    expect(result.show).toBe('alone');
    expect(done(result, 'floor')).toBe(false);
  });

  it('stops for good once the last rung is done', () => {
    expect(
      introduction({ ...alone, conversedAt: CONVERSED, tried: ALL_TRIED }).show
    ).toBe('none');
  });

  it('does not stop on the four alone, without a conversation', () => {
    // Not reachable in practice — the four are done inside a channel — but the
    // rule is *and*, not *or*, and a stray write must not retire the ladder
    // for somebody who has never stepped in.
    expect(introduction({ ...alone, tried: ALL_TRIED }).show).toBe('alone');
  });

  it('retires an invited arrival on the same two conditions', () => {
    const settled = {
      ...alone,
      arrival: 'invited' as const,
      home: { contacts: [], rejoinable: [], invites: [invite] },
      conversedAt: CONVERSED,
    };
    expect(introduction(settled).show).toBe('alone');
    expect(introduction({ ...settled, tried: ALL_TRIED }).show).toBe('none');
  });
});

/**
 * The second exit, added 2026-09-13: a rung somebody has read and decided
 * against, which until then the ladder had no way to express. See
 * `state/introduction.ts` § `dismissed`.
 */
describe('dismissal', () => {
  it('takes one rung out and leaves the rest in their order', () => {
    const result = introduction({ ...alone, dismissed: ['stepIn'] });
    expect(stepsOf(result).map((step) => step.id)).toEqual([
      'somebody',
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
  });

  it('hides a rung rather than ticking it', () => {
    // The distinction the whole feature turns on: `tried` is a fact about the
    // account and this is a statement about the list. A dismissal that read as
    // *done* would tell a second device this person had claimed the floor.
    const result = introduction({ ...alone, dismissed: ['floor'] });
    expect(stepsOf(result).some((step) => step.id === 'floor')).toBe(false);
    expect(done(result, 'somebody')).toBe(false);
  });

  it('takes the install rung away like any other', () => {
    const offered = { ...alone, install: installable };
    expect(
      stepsOf(introduction(offered)).some((step) => step.id === 'install')
    ).toBe(true);
    expect(
      stepsOf(introduction({ ...offered, dismissed: ['install'] })).some(
        (step) => step.id === 'install'
      )
    ).toBe(false);
  });

  it('retires the whole card when the last rung is put away', () => {
    // An empty card is not a quiet card. This is the other way the
    // introduction ends, and it has to end rather than draw a heading over
    // nothing.
    expect(
      introduction({
        ...alone,
        dismissed: ['somebody', 'stepIn', 'floor', 'nearby', 'guest', 'player'],
      }).show
    ).toBe('none');
  });

  it('closes the invited card, which is the one thing it asks', () => {
    const invited = {
      ...alone,
      arrival: 'invited' as const,
      home: { contacts: [], rejoinable: [], invites: [invite] },
    };
    expect(introduction(invited).show).toBe('invited');
    // Not answered with the four rungs below `stepIn`: this is somebody who
    // has not been in a channel, so those four are about a screen they have
    // not reached.
    expect(introduction({ ...invited, dismissed: ['stepIn'] }).show).toBe(
      'none'
    );
  });

  it('leaves the install rung standing when that card is closed', () => {
    // The exception it always is — it is not about a channel, and it was never
    // part of what the card asked for.
    const result = introduction({
      ...alone,
      arrival: 'invited' as const,
      home: { contacts: [], rejoinable: [], invites: [invite] },
      install: installable,
      dismissed: ['stepIn'],
    });
    expect(stepsOf(result).map((step) => step.id)).toEqual(['install']);
  });
});

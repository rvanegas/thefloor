import { en } from '../../i18n/en';
import { NOT_OFFERED, type Install } from '../install';
import { introduction, learningToStepIn, type Step } from '../introduction';
import { NOTHING_TRIED, type Tried } from '../tried';

/**
 * What a new account is shown, which is one ladder or nothing at all.
 *
 * The cases worth guarding are the ones where being wrong is not a cosmetic
 * matter: showing a checklist to somebody who finished with it, and ticking a
 * rung nobody climbed — which for the first rung is every account that arrived
 * with a contact, and is why there is a starting line at all.
 */

/** Everything settled, nothing done: an uninvited account at its first launch. */
const fresh = {
  loaded: true,
  home: { contacts: [] },
  conversedAt: null,
  tried: NOTHING_TRIED,
  /** Nothing put away by hand — the dismissal cases add their own. */
  dismissed: [],
  /** Arrived with nobody, so the first contact is somebody they brought. */
  contactsBase: 0,
  // A phone, where there is nothing to install. The browser cases say so.
  install: NOT_OFFERED as Install,
  words: en.introduction,
};

/** A browser with somewhere to put this and no button of its own to do it. */
const installable: Install = {
  offer: true,
  how: 'Tap Share in Safari, then Add to Home Screen.',
  prompt: false,
};

const stepsOf = (result: ReturnType<typeof introduction>): Step[] =>
  result.show === 'ladder' ? result.steps : [];

const done = (result: ReturnType<typeof introduction>, id: string) =>
  stepsOf(result).find((step) => step.id === id)?.done;

/** Everything in `tried` behind somebody — half of what retires the ladder. */
const ALL_TRIED: Tried = {
  floor: true,
  nearby: true,
  guest: true,
  player: true,
};

describe('before anything is known', () => {
  it('shows nothing while the keychain is still being read', () => {
    expect(introduction({ ...fresh, loaded: false }).show).toBe('none');
  });

  it('shows nothing before the first snapshot', () => {
    expect(introduction({ ...fresh, home: null }).show).toBe('none');
  });

  it('shows nothing before the starting line has been latched', () => {
    // The latch the arrival used to be. Drawing against a line of nought
    // before one has been written would tick the first rung for every account
    // that arrived with somebody, for the frame before the truth lands.
    expect(introduction({ ...fresh, contactsBase: null }).show).toBe('none');
  });
});

describe('an account that arrived with somebody', () => {
  /**
   * An invited arrival: a contact and a channel, neither of which it did
   * anything to get. It used to be shown a one-line card on exactly that
   * ground; it is shown the same ladder as everybody, with nothing ticked.
   */
  const invited = { ...fresh, home: { contacts: [{}] }, contactsBase: 1 };

  it('is the same ladder as everybody else gets', () => {
    const result = introduction(invited);
    expect(result.show).toBe('ladder');
    expect(stepsOf(result).map((step) => step.id)).toEqual([
      'somebody',
      'stepIn',
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
  });

  it('starts with nothing ticked, the contact being nobody of its own', () => {
    expect(stepsOf(introduction(invited)).some((step) => step.done)).toBe(
      false
    );
  });
});

describe('the ladder', () => {
  it('is the two account rungs, then the four things to try in a channel', () => {
    expect(stepsOf(introduction(fresh)).map((step) => step.id)).toEqual([
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
    for (const step of stepsOf(introduction(fresh))) {
      expect(step.instruction).not.toBe('');
      expect(step.note).not.toBe('');
    }
  });

  it('ticks somebody on a request sent, not on one answered', () => {
    const result = introduction({
      ...fresh,
      home: { contacts: [{}] },
    });
    expect(done(result, 'somebody')).toBe(true);
  });

  it('ticks somebody against the line the ladder started from', () => {
    // **A count is not an act.** An account that started with a contact — an
    // invited arrival, or anybody who tapped *Show the checklist again* — has
    // not got somebody here by continuing to have them; it ticks on the next
    // one up. See `contactsBase`.
    const started = { ...fresh, contactsBase: 1 };
    expect(
      done(
        introduction({
          ...started,
          home: { contacts: [{}] },
        }),
        'somebody'
      )
    ).toBe(false);
    expect(
      done(
        introduction({
          ...started,
          home: { contacts: [{}, {}] },
        }),
        'somebody'
      )
    ).toBe(true);
  });

  it('goes on being the ladder once they have a contact', () => {
    // The reason the starting line is latched. Read against today's count the
    // rung would be unticked for ever, since the line would follow it up.
    const result = introduction({ ...fresh, home: { contacts: [{}] } });
    expect(result.show).toBe('ladder');
    expect(done(result, 'somebody')).toBe(true);
  });

  it('leaves the last rung unticked, which is the whole mechanism', () => {
    expect(done(introduction(fresh), 'stepIn')).toBe(false);
  });
});

describe('the install rung', () => {
  it('is absent where there is nothing to install — every phone, and most browsers', () => {
    expect(stepsOf(introduction(fresh)).map((step) => step.id)).not.toContain(
      'install'
    );
  });

  it('sits between getting somebody here and stepping in', () => {
    // Not first: nobody installs an app they have not decided to keep. Not
    // below `stepIn`: everything under that rung is done inside a channel, and
    // this is the one rung that is about the client rather than about the
    // account or the room.
    expect(
      stepsOf(introduction({ ...fresh, install: installable })).map(
        (step) => step.id
      )
    ).toEqual(['somebody', 'install', 'stepIn', 'floor', 'nearby', 'guest', 'player']);
  });

  it('says what to do in this browser rather than in general', () => {
    const step = stepsOf(introduction({ ...fresh, install: installable })).find(
      (candidate) => candidate.id === 'install'
    );
    expect(step?.instruction).toBe(installable.how);
  });

  it('is never ticked, because its absence is the tick', () => {
    // An installed browser answers `NOT_OFFERED`, so there is no state to
    // remember and no row congratulating anybody.
    expect(done(introduction({ ...fresh, install: installable }), 'install')).toBe(
      false
    );
  });

  it('sits between the two account rungs, wherever the account came from', () => {
    // It was the one row allowed to join the invited card, that card being
    // the cohort's whole introduction. With one ladder there is one place for
    // it, and it is the same place for everybody.
    const invited = { ...fresh, home: { contacts: [{}] }, contactsBase: 1 };
    expect(
      stepsOf(introduction({ ...invited, install: installable })).map(
        (step) => step.id
      )
    ).toEqual([
      'somebody',
      'install',
      'stepIn',
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
  });

  it('is drawn while the conversation it asked for is happening', () => {
    // The reversal of 2026-09-14. A conversation in progress used to blank the
    // whole card; the only reader that ever saw the blank was somebody on Home
    // who was still standing in the room — which is exactly who the four rungs
    // below `stepIn` are written for.
    expect(
      introduction({ ...fresh, install: installable, conversedAt: 1 }).show
    ).toBe('ladder');
  });
});

const CONVERSED = 1_700_000_000_000;

describe('the four things to try in a channel', () => {
  it('are drawn under the two account rungs, unticked', () => {
    const ids = stepsOf(introduction(fresh)).map((step) => step.id);
    expect(ids).toEqual(['somebody', 'stepIn', 'floor', 'nearby', 'guest', 'player']);
    expect(done(introduction(fresh), 'floor')).toBe(false);
    expect(done(introduction(fresh), 'player')).toBe(false);
  });

  it('tick one at a time, off what this install has done', () => {
    const result = introduction({
      ...fresh,
      tried: { ...NOTHING_TRIED, floor: true, guest: true },
    });
    expect(done(result, 'floor')).toBe(true);
    expect(done(result, 'guest')).toBe(true);
    expect(done(result, 'nearby')).toBe(false);
    expect(done(result, 'player')).toBe(false);
  });

  it('tick `step in` once a conversation has happened, which it never used to', () => {
    expect(done(introduction(fresh), 'stepIn')).toBe(false);
    expect(done(introduction({ ...fresh, conversedAt: CONVERSED }), 'stepIn')).toBe(
      true
    );
  });
});

describe('retirement', () => {
  it('stays up through the conversation, with what is left', () => {
    // The reversal of 2026-09-13. The old rule retired on the first
    // conversation, which is the one moment none of the four rungs below it
    // could ever have been reached.
    const result = introduction({ ...fresh, conversedAt: CONVERSED });
    expect(result.show).toBe('ladder');
    expect(done(result, 'floor')).toBe(false);
  });

  it('stops for good once the last rung is done', () => {
    expect(
      introduction({ ...fresh, conversedAt: CONVERSED, tried: ALL_TRIED }).show
    ).toBe('none');
  });

  it('does not stop on the four alone, without a conversation', () => {
    // Not reachable in practice — the four are done inside a channel — but the
    // rule is *and*, not *or*, and a stray write must not retire the ladder
    // for somebody who has never stepped in.
    expect(introduction({ ...fresh, tried: ALL_TRIED }).show).toBe('ladder');
  });

  it('retires an account that arrived with somebody on the same two', () => {
    // The cohort that used to be shown a card and retired on its one line.
    // There is nothing special about it any more: it finishes when the last
    // rung is behind it, like everybody.
    const settled = {
      ...fresh,
      home: { contacts: [{}] },
      contactsBase: 1,
      conversedAt: CONVERSED,
    };
    expect(introduction(settled).show).toBe('ladder');
    expect(
      introduction({
        ...settled,
        tried: ALL_TRIED,
        home: { contacts: [{}, {}] },
      }).show
    ).toBe('none');
  });
});

/**
 * The second exit, added 2026-09-13: a rung somebody has read and decided
 * against, which until then the ladder had no way to express. See
 * `state/introduction.ts` § `dismissed`.
 */
describe('dismissal', () => {
  it('takes one rung out and leaves the rest in their order', () => {
    const result = introduction({ ...fresh, dismissed: ['stepIn'] });
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
    const result = introduction({ ...fresh, dismissed: ['floor'] });
    expect(stepsOf(result).some((step) => step.id === 'floor')).toBe(false);
    expect(done(result, 'somebody')).toBe(false);
  });

  it('takes the install rung away like any other', () => {
    const offered = { ...fresh, install: installable };
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
        ...fresh,
        dismissed: ['somebody', 'stepIn', 'floor', 'nearby', 'guest', 'player'],
      }).show
    ).toBe('none');
  });

  it('leaves the rest standing when one rung is put away', () => {
    // The install rung was the exception the invited card made: not about a
    // channel, and never part of what that card asked. With one ladder it is
    // an ordinary rung, and dismissing another leaves it where it was.
    const result = introduction({
      ...fresh,
      install: installable,
      dismissed: ['stepIn'],
    });
    expect(stepsOf(result).map((step) => step.id)).toEqual([
      'somebody',
      'install',
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
  });
});

/**
 * The one thing the ladder says on a screen that is not Home — see
 * `learningToStepIn`, and `ChannelView`'s third sentence under the roster.
 */
describe('whether the channel screen still owes an instruction', () => {
  it('owes one while the rung is standing and unticked', () => {
    expect(learningToStepIn(introduction(fresh))).toBe(true);
  });

  it('stops the moment the first conversation has happened', () => {
    // `conversedAt` is what ticks the rung, and the rung is what this reads:
    // help that outlived being taken up would be repetition of the footer.
    expect(
      learningToStepIn(introduction({ ...fresh, conversedAt: 1_000 }))
    ).toBe(false);
  });

  it('stops when the rung has been put away by hand', () => {
    // The ladder's second exit is the reader's, and it would be a poor one
    // that left the same instruction standing two screens away.
    expect(
      learningToStepIn(introduction({ ...fresh, dismissed: ['stepIn'] }))
    ).toBe(false);
  });

  it('says nothing while nothing is settled', () => {
    // Silence is the default in every uncertain case, here as on Home.
    expect(learningToStepIn(introduction({ ...fresh, loaded: false }))).toBe(
      false
    );
  });
});

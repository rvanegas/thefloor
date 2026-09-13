import { NOT_OFFERED, type Install } from '../install';
import { arrivalOf, introduction, type Step } from '../introduction';

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
  doneAt: null,
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
  it('is the two-rung ladder, the name and the username being derived now', () => {
    expect(stepsOf(introduction(alone)).map((step) => step.id)).toEqual([
      'somebody',
      'stepIn',
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
    // last: stepping in is what the ladder retires on and nothing may sit
    // below it.
    expect(
      stepsOf(introduction({ ...alone, install: installable })).map(
        (step) => step.id
      )
    ).toEqual(['somebody', 'install', 'stepIn']);
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

describe('retirement', () => {
  it('stops the moment a conversation is happening', () => {
    expect(introduction({ ...alone, conversing: true }).show).toBe('none');
  });

  it('stays retired afterwards, with both rungs still unticked', () => {
    // Retiring on the last rung rather than on all of them: a leftover
    // unticked *get somebody here* is not a reason to go on asking somebody
    // who has already had the conversation this was for.
    expect(introduction({ ...alone, doneAt: 1_700_000_000_000 }).show).toBe(
      'none'
    );
  });

  it('retires the invited card on the same event', () => {
    expect(
      introduction({
        ...alone,
        arrival: 'invited',
        home: { contacts: [], rejoinable: [], invites: [invite] },
        doneAt: 1_700_000_000_000,
      }).show
    ).toBe('none');
  });
});

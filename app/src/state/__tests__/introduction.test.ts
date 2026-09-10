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
  displayName: '',
  username: null,
  conversing: false,
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
  it('is the four-rung ladder', () => {
    expect(stepsOf(introduction(alone)).map((step) => step.id)).toEqual([
      'name',
      'username',
      'somebody',
      'stepIn',
    ]);
  });

  it('ticks the name once there is one', () => {
    expect(done(introduction(alone), 'name')).toBe(false);
    expect(done(introduction({ ...alone, displayName: 'Ada' }), 'name')).toBe(
      true
    );
  });

  it('does not count a name of nothing but spaces', () => {
    expect(done(introduction({ ...alone, displayName: '   ' }), 'name')).toBe(
      false
    );
  });

  it('ticks the username once one is chosen', () => {
    expect(done(introduction(alone), 'username')).toBe(false);
    expect(
      done(introduction({ ...alone, username: 'ada' }), 'username')
    ).toBe(true);
  });

  it('withholds the whole ladder while the username is unknown', () => {
    // Rather than drawing three rungs and growing a fourth a beat later.
    expect(introduction({ ...alone, username: undefined }).show).toBe('none');
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

describe('retirement', () => {
  it('stops the moment a conversation is happening', () => {
    expect(introduction({ ...alone, conversing: true }).show).toBe('none');
  });

  it('stays retired afterwards, with three rungs still unticked', () => {
    // Retiring on the last rung rather than on all of them: a leftover
    // unticked *say who you are* is not a reason to go on asking somebody who
    // has already had the conversation this was for.
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

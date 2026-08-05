import { MockBackend } from '../backend';

/**
 * Re-entry is specified but Home has no route to it, so these cover the
 * distinction the two lists draw: an invite is a session you have never
 * entered, a rejoinable session is one you entered and left.
 */
describe('live invites vs. rejoinable sessions', () => {
  let backend: MockBackend;
  let me: string;
  let dana: string;

  beforeEach(() => {
    backend = new MockBackend();
    me = backend.findByIdentifier('+15550000001')!.id;
    dana = backend.findByIdentifier('+15550000002')!.id;
  });

  it('shows an invite to a contact who has never entered', () => {
    backend.startSession(me, dana);
    expect(backend.invitesFor(dana)).toHaveLength(1);
    expect(backend.liveSessionsFor(dana)).toHaveLength(0);
    // The initiator is present, so it is neither for them.
    expect(backend.invitesFor(me)).toHaveLength(0);
    expect(backend.liveSessionsFor(me)).toHaveLength(0);
  });

  it('stops showing an invite once the invitee has entered', () => {
    const id = backend.startSession(me, dana);
    backend.dispatch(id, { type: 'ENTER', userId: dana });
    expect(backend.invitesFor(dana)).toHaveLength(0);
  });

  it('offers a rejoin — not a fresh invite — after the invitee leaves', () => {
    const id = backend.startSession(me, dana);
    backend.dispatch(id, { type: 'ENTER', userId: dana });
    backend.dispatch(id, { type: 'LEAVE', userId: dana });

    // Previously this reappeared as an invite, which read as a new invitation.
    expect(backend.invitesFor(dana)).toHaveLength(0);
    const rejoinable = backend.liveSessionsFor(dana);
    expect(rejoinable).toHaveLength(1);
    expect(rejoinable[0].other.id).toBe(me);
    expect(rejoinable[0].otherPresent).toBe(true);
  });

  it('offers a rejoin to an initiator who leaves — the case with no route back', () => {
    const id = backend.startSession(me, dana);
    backend.dispatch(id, { type: 'ENTER', userId: dana });
    backend.dispatch(id, { type: 'LEAVE', userId: me });

    const rejoinable = backend.liveSessionsFor(me);
    expect(rejoinable).toHaveLength(1);
    expect(rejoinable[0].other.id).toBe(dana);
    expect(rejoinable[0].otherPresent).toBe(true);
  });

  it('flags a session nobody is present in', () => {
    const id = backend.startSession(me, dana);
    backend.dispatch(id, { type: 'ENTER', userId: dana });
    backend.dispatch(id, { type: 'LEAVE', userId: dana });
    backend.dispatch(id, { type: 'LEAVE', userId: me });

    expect(backend.liveSessionsFor(me)[0].otherPresent).toBe(false);
    expect(backend.liveSessionsFor(dana)[0].otherPresent).toBe(false);
  });

  it('drops the session from both lists once it ends', () => {
    const id = backend.startSession(me, dana);
    backend.dispatch(id, { type: 'ENTER', userId: dana });
    backend.dispatch(id, { type: 'LEAVE', userId: dana });
    backend.dispatch(id, { type: 'END', userId: me });

    expect(backend.liveSessionsFor(dana)).toHaveLength(0);
    expect(backend.invitesFor(dana)).toHaveLength(0);
  });

  it('lets a rejoin actually put the user back in', () => {
    const id = backend.startSession(me, dana);
    backend.dispatch(id, { type: 'ENTER', userId: dana });
    backend.dispatch(id, { type: 'LEAVE', userId: me });
    backend.dispatch(id, { type: 'ENTER', userId: me });

    expect(backend.getSession(id)!.present).toContain(me);
    expect(backend.liveSessionsFor(me)).toHaveLength(0);
  });
});

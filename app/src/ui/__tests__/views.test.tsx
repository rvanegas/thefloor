import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { backend } from '../../mock/backend';
import type { Account } from '../../mock/types';
import App from '../../../App';
import { HomeView } from '../HomeView';
import { SessionView } from '../SessionView';

/** Flattens a rendered tree to its visible text, for asserting on copy. */
function textOf(tree: ReactTestRenderer): string {
  const strings: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return strings.join(' ');
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

const me: Account = backend.signIn('+15550000001');
const dana = backend.findByIdentifier('+15550000002')!;

describe('view smoke tests', () => {
  it('renders Auth when signed out', () => {
    const tree = render(<App />);
    expect(textOf(tree)).toContain('The Floor');
    expect(textOf(tree)).toContain('Send code');
    act(() => tree.unmount());
  });

  it('renders Home with contacts and a pending request', () => {
    const tree = render(
      <HomeView me={me} onEnterSession={() => {}} onSignOut={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Start session');
    // Priya's incoming request shows accept/decline in place of tap-to-session.
    expect(text).toContain('Priya Raman');
    expect(text).toContain('Accept');
    act(() => tree.unmount());
  });

  it('renders a session the initiator is waiting alone in', () => {
    const sessionId = backend.startSession(me.id, dana.id);
    const tree = render(
      <SessionView me={me} sessionId={sessionId} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Waiting for them to join');
    expect(text).toContain('Nobody has the floor');
    expect(text).toContain('becomes available once both of you are present');
    // The peer stand-in is pinned below the scroll area, not buried under it.
    expect(text).toContain('Demo controls');
    expect(text).toContain('They join');
    act(() => tree.unmount());
  });

  it('reflects a live claim, and shows the invite banner on Home', () => {
    const sessionId = backend.startSession(me.id, dana.id);
    backend.dispatch(sessionId, { type: 'ENTER', userId: dana.id });
    backend.dispatch(sessionId, { type: 'CLAIM_FLOOR', userId: dana.id });

    const session = render(
      <SessionView me={me} sessionId={sessionId} onExit={() => {}} />
    );
    const text = textOf(session);
    expect(text).toContain('Dana Chu has the floor');
    expect(text).toContain('your mic is cut');
    expect(text).toContain('cannot claim the floor while you are silenced');
    act(() => session.unmount());

    // Dana is present in that session, so from Dana's side there is no invite;
    // a fresh session to Dana that she has not joined does produce one.
    const pending = backend.startSession(me.id, dana.id);
    const home = render(
      <HomeView me={dana} onEnterSession={() => {}} onSignOut={() => {}} />
    );
    expect(textOf(home)).toContain('tap to join');
    act(() => home.unmount());
    backend.dispatch(pending, { type: 'END', userId: me.id });
  });

  it('renders the ended state after the session is ended', () => {
    const sessionId = backend.startSession(me.id, dana.id);
    backend.dispatch(sessionId, { type: 'END', userId: me.id });
    const tree = render(
      <SessionView me={me} sessionId={sessionId} onExit={() => {}} />
    );
    expect(textOf(tree)).toContain('Session ended');
    act(() => tree.unmount());
  });
});

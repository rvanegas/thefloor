import React from 'react';
import { OfflineView } from '../../ui/OfflineView';
import { UpdateRequiredView } from '../../ui/UpdateRequiredView';
import { mockApp, render, resetHarness, textOf } from '../../ui/testing/harness';
import { es } from '../es';
import { TextProvider } from '../index';

jest.mock('../../state/AppProvider', () => require('../../ui/testing/harness').appProviderMock());

/**
 * That a screen rendered under the Spanish catalogue is actually in Spanish.
 *
 * **The rest of the suite proves the opposite**, and deliberately: several
 * hundred assertions name English prose, which is what pins the copy and what
 * made the whole extraction safe to do. None of them exercises the one thing
 * a second language adds — the provider actually reaching a view — so a
 * catalogue could be complete, typechecked, and wired to nothing.
 *
 * Two screens rather than all of them, and two chosen for what they are made
 * of rather than for coverage: one whose words are plain children of a `Text`,
 * and one that also reaches a `Button`'s `label` prop. The catalogue's own
 * completeness is the neighbouring test's job; this one is about the wiring.
 */
describe('a screen in Spanish', () => {
  beforeEach(resetHarness);

  const inSpanish = (element: React.ReactElement) =>
    textOf(render(<TextProvider strings={es}>{element}</TextProvider>));

  it('draws the update wall in Spanish, buttons included', () => {
    // The button is drawn only where there is an App Store to send anybody
    // to, and it is the half of this test that is about a `label` prop.
    mockApp.updateUrl = 'https://apps.apple.com/app/id0';
    const text = inSpanish(<UpdateRequiredView />);
    expect(text).toContain('Toca actualizar');
    expect(text).toContain('demasiado antigua');
    // The label prop, not a child: the two reach the tree by different routes.
    expect(text).toContain('Abrir el App Store');
    expect(text).not.toContain('Time to update');
  });

  it('draws the offline wall in Spanish', () => {
    const text = inSpanish(<OfflineView roster={null} />);
    expect(text).toContain('Sin conexión');
    expect(text).toContain('Reintentando');
    expect(text).not.toContain('Not connected');
  });

  it('is English again without the provider', () => {
    // The default is what every other test in this suite depends on, so it is
    // worth one assertion of its own rather than being inferred from theirs.
    expect(textOf(render(<UpdateRequiredView />))).toContain('Time to update');
  });
});

import React from 'react';
import { act } from 'react-test-renderer';
import { HomeSettingsView } from '../../ui/HomeSettingsView';
import { OfflineView } from '../../ui/OfflineView';
import { UpdateRequiredView } from '../../ui/UpdateRequiredView';
import { mockApp, render, resetHarness, textOf } from '../../ui/testing/harness';
import { es } from '../es';
import { TextProvider, useText } from '../index';
import { LanguageProvider, useLanguagePreference } from '../language';

jest.mock('../../state/AppProvider', () => require('../../ui/testing/harness').appProviderMock());

/** The keychain, which `LanguageProvider` caches the choice in. */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

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

  /**
   * The screen the language is chosen on, in the language it can be chosen
   * into: the labels for the two languages are the same either way round,
   * deliberately, and everything around them is not.
   */
  it('draws the language card in Spanish, with both languages in their own', () => {
    const text = inSpanish(<HomeSettingsView onBack={() => {}} />);
    expect(text).toContain('Idioma');
    expect(text).toContain('Autom\u00e1tico');
    expect(text).toContain('English');
    expect(text).toContain('Espa\u00f1ol');
    expect(text).not.toContain('Language');
  });

  /**
   * The wiring the setting actually needs: a choice changes what every screen
   * below says, without anything restarting. Nothing else in the suite covers
   * it — the tests above hand a catalogue straight to `TextProvider`, which is
   * the state this provider is what moves.
   */
  it('changes the catalogue under a screen when the choice changes', async () => {
    let adopt: ((next: 'en' | 'es' | 'system') => void) | undefined;
    function Card() {
      adopt = useLanguagePreference()?.adopt;
      return <>{useText().homeSettings.language()}</>;
    }
    const tree = render(
      <LanguageProvider>
        <Card />
      </LanguageProvider>
    );
    // English, this device saying nothing about itself in jest.
    expect(textOf(tree)).toContain('Language');

    await act(async () => adopt!('es'));
    expect(textOf(tree)).toContain('Idioma');

    // And back, which is the direction a one-way call would have got away
    // with — see `setRelativeTimeLocale`, which had exactly that shape.
    await act(async () => adopt!('en'));
    expect(textOf(tree)).toContain('Language');
  });

  it('is English again without the provider', () => {
    // The default is what every other test in this suite depends on, so it is
    // worth one assertion of its own rather than being inferred from theirs.
    expect(textOf(render(<UpdateRequiredView />))).toContain('Time to update');
  });
});

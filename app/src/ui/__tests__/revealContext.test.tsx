import React from 'react';
import { Keyboard, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { Reveal, Screen } from '../components';

/**
 * Which side of `Screen` a reveal has to be asked for from.
 *
 * The arithmetic is `reveal.test.ts` and was never wrong. What was wrong is
 * that the notepad card asked from the wrong place: `RevealContext`'s provider
 * lives inside `Screen`'s own tree, so the component that *renders* `<Screen>`
 * reads the default, gets a no-op, and every request it makes is dropped in
 * silence. It shipped looking exactly like a feature that had been written and
 * did not work — wrapper present, keyboard listener firing, nothing moving.
 *
 * So this tests the wiring rather than the sums: that a card rendered among
 * the screen's children reaches the real reveal, and that asking from above it
 * says so instead of going quiet.
 */

/** How many cards asked to hear about the keyboard. */
let listeners: number;

beforeEach(() => {
  listeners = 0;
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string) => {
    if (event === 'keyboardDidShow') listeners += 1;
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function render(element: React.ReactElement) {
  act(() => {
    renderer.create(element);
  });
}

it('reaches the screen from a card rendered inside it', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  render(
    <Screen>
      <Reveal when>
        <Text>a card</Text>
      </Reveal>
    </Screen>
  );

  // Subscribed, and subscribed to something: the listener is registered only
  // once the provider has been found, and the complaint is what stands in for
  // the measurement, which the test renderer does not perform.
  expect(listeners).toBe(1);
  expect(warn).not.toHaveBeenCalled();
});

it('says so out loud when the card asks from outside the screen', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  // The shape the notepad and the ping card both had: the reveal requested by
  // the component that renders the screen, which is above the provider.
  function AboveTheProvider() {
    return (
      <>
        <Reveal when>
          <Text>orphaned</Text>
        </Reveal>
        <Screen>
          <Text>the screen</Text>
        </Screen>
      </>
    );
  }

  render(<AboveTheProvider />);

  expect(listeners).toBe(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('[reveal]'));
});

it('asks for nothing while the form that raises the keyboard is closed', () => {
  render(
    <Screen>
      <Reveal when={false}>
        <Text>a card</Text>
      </Reveal>
    </Screen>
  );

  expect(listeners).toBe(0);
});

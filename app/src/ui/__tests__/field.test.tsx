import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { Field } from '../components';

/**
 * Which keyboards get a return key.
 *
 * A number pad has none, and asking for one anyway makes iOS float a detached
 * "Go" pill above the keypad — over whatever the screen was showing, and beside
 * the button it duplicates. It was on the sign-in screen, which is the first
 * thing anybody sees and the first thing App Review sees.
 */

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

// `findAll` with a predicate rather than `findByType`, which the installed
// react-test-renderer types do not declare.
const propsOf = (tree: ReactTestRenderer) => {
  const [input] = tree.root.findAll((n) => n.type === TextInput);
  if (!input) throw new Error('no TextInput rendered');
  return input.props as { returnKeyType?: string };
};

it('asks for no return key on a number pad', () => {
  const tree = render(
    <Field
      value=""
      onChangeText={() => {}}
      placeholder="Six-digit code"
      keyboardType="number-pad"
      onSubmit={() => {}}
      submitLabel="go"
    />
  );
  expect(propsOf(tree).returnKeyType).toBeUndefined();
  act(() => tree.unmount());
});

it('still labels the return key on a keyboard that has one', () => {
  const tree = render(
    <Field
      value=""
      onChangeText={() => {}}
      placeholder="Email address"
      keyboardType="email-address"
      onSubmit={() => {}}
      submitLabel="send"
    />
  );
  expect(propsOf(tree).returnKeyType).toBe('send');
  act(() => tree.unmount());
});

it('asks for none where there is nothing to submit', () => {
  const tree = render(
    <Field value="" onChangeText={() => {}} placeholder="About you" multiline />
  );
  expect(propsOf(tree).returnKeyType).toBeUndefined();
  act(() => tree.unmount());
});

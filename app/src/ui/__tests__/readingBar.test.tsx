import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { ReadAloudControls } from '../../audio/readAloud';
import { ReadingContext, Screen } from '../components';
import { PaneContext } from '../layout';

/**
 * *Restart* and *Stop* sit immediately above a screen's footer while Claude's
 * reply is being read, and nowhere at any other time — nor in a split's list
 * column, which leaves the one bar to the pane beside it.
 */

const controls = (reading: boolean): ReadAloudControls => ({
  reading,
  restart: jest.fn(),
  stop: jest.fn(),
});

function words(
  value: ReadAloudControls,
  pane: 'list' | 'detail' | null = null
): string[] {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PaneContext.Provider value={pane}>
        <ReadingContext.Provider value={value}>
          <Screen footer={<Text>Footer</Text>}>
            <Text>Body</Text>
          </Screen>
        </ReadingContext.Provider>
      </PaneContext.Provider>
    );
  });
  return tree.root
    .findAll((node) => node.type === Text)
    .map((node) => [node.props.children].flat().join(''));
}

describe('ReadingBar', () => {
  it('is between the body and the footer while a reply is heard', () => {
    expect(words(controls(true))).toEqual([
      'Body',
      'Reading Claude’s reply',
      'Restart',
      'Stop',
      'Footer',
    ]);
  });

  it('is not there when nothing is being read', () => {
    expect(words(controls(false))).toEqual(['Body', 'Footer']);
  });

  it('is left to the detail pane in a split', () => {
    expect(words(controls(true), 'list')).toEqual(['Body', 'Footer']);
    expect(words(controls(true), 'detail')).toContain('Stop');
  });

  it('presses through to the reader', () => {
    const value = controls(true);
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ReadingContext.Provider value={value}>
          <Screen>
            <Text>Body</Text>
          </Screen>
        </ReadingContext.Provider>
      );
    });
    const button = (label: string) =>
      tree.root.findAll(
        (node) =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function' &&
          node.findAll((text) => text.props.children === label).length > 0
      )[0];
    act(() => button('Restart').props.onPress());
    act(() => button('Stop').props.onPress());
    expect(value.restart).toHaveBeenCalledTimes(1);
    expect(value.stop).toHaveBeenCalledTimes(1);
  });
});

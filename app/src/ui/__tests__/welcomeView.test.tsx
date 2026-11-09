import React from 'react';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

/**
 * A new account's first screen (`WelcomeView`), since sign-in moved to
 * dianoia-auth: its name, and the marketing opt-in the old sign-in screen
 * asked. The opt-in keeps the shape a permission has to have: clear unless
 * somebody touched it, and sent as a grant only when they did. The server's
 * half — that a clear box never withdraws a consent — is
 * `server/__tests__/marketing-opt-in.test.ts`.
 */

const mockApp = {
  me: { id: 'acct_me', displayName: 'Anna K' },
  finishWelcome: jest.fn(async (_name: string | undefined, _marketing: boolean) => {}),
};

jest.mock('../../state/AppProvider', () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { WelcomeView } from '../WelcomeView';

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<WelcomeView />);
  });
  return tree;
}

const checkbox = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.findAll((n) => n.props?.accessibilityRole === 'checkbox')[0];
const field = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.findAll((n) => n.props?.placeholder === 'Display name' && n.props?.onChangeText)[0];
const continueButton = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.findAll((n) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function')[0];

beforeEach(() => jest.clearAllMocks());

it('suggests the name the server derived, and keeps it if left alone, without consent', async () => {
  const tree = render();
  expect(field(tree).props.value).toBe('Anna K');
  expect(checkbox(tree).props.accessibilityState?.checked ?? checkbox(tree).props.checked).toBeFalsy();
  await act(async () => {
    continueButton(tree).props.onPress();
  });
  expect(mockApp.finishWelcome).toHaveBeenCalledWith('Anna K', false);
});

it('sends the name typed, and the grant when it is ticked', async () => {
  const tree = render();
  await act(async () => {
    field(tree).props.onChangeText('Anna Kowalski');
  });
  await act(async () => {
    checkbox(tree).props.onPress();
  });
  await act(async () => {
    continueButton(tree).props.onPress();
  });
  expect(mockApp.finishWelcome).toHaveBeenCalledWith('Anna Kowalski', true);
});

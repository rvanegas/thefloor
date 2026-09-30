import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useFilmTakesMicrophone } from '../useFilmTakesMicrophone';

/**
 * **`CALL` is given up only to play a film while the app is in front.** A film
 * on a device that is behind is not being watched, so the device keeps — or
 * retakes — its microphone, which is what keeps a backgrounded process alive
 * through a party-muted run. See `useFilmTakesMicrophone`.
 */

let listeners: ((next: string) => void)[] = [];

beforeEach(() => {
  listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    fn: (next: string) => void
  ) => {
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  }) as unknown as typeof AppState.addEventListener);
  (AppState as unknown as { currentState: string }).currentState = 'active';
});

const appState = (next: string) => {
  (AppState as unknown as { currentState: string }).currentState = next;
  act(() => {
    for (const fn of [...listeners]) fn(next);
  });
};

function mount(screening: boolean) {
  const seen: boolean[] = [];
  function Probe({ on }: { on: boolean }) {
    seen.push(useFilmTakesMicrophone(on));
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe on={screening} />);
  });
  return {
    get takes() {
      return seen[seen.length - 1];
    },
    update(next: boolean) {
      act(() => {
        tree.update(<Probe on={next} />);
      });
    },
  };
}

describe('useFilmTakesMicrophone', () => {
  it('lets the film have the microphone while the app is in front', () => {
    const probe = mount(false);
    expect(probe.takes).toBe(false);
    probe.update(true);
    expect(probe.takes).toBe(true);
  });

  it('takes it back the moment the app starts to leave', () => {
    const probe = mount(true);
    expect(probe.takes).toBe(true);
    appState('inactive');
    expect(probe.takes).toBe(false);
    appState('background');
    expect(probe.takes).toBe(false);
  });

  it('gives it to the film again on return, if the film is still running', () => {
    const probe = mount(true);
    appState('background');
    appState('active');
    expect(probe.takes).toBe(true);
  });

  it('never releases for a film that starts while the app is behind', () => {
    const probe = mount(false);
    appState('background');
    probe.update(true);
    expect(probe.takes).toBe(false);
  });

  it('is nothing without a film on this device', () => {
    const probe = mount(false);
    appState('background');
    appState('active');
    expect(probe.takes).toBe(false);
  });
});

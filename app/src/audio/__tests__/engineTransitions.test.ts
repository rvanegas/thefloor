import { audioDeviceModuleEvents } from '@livekit/react-native';
import { watchEngineTransitions } from '../engineState';

/**
 * The instrument that must not become the fault.
 *
 * These handlers block the audio worker thread and a rejection is read as an
 * error code that **cancels the engine operation being reported on** — so a
 * logging bug here would not merely lose a line, it would stop the audio it was
 * watching. That is the one outcome that would make this worse than having no
 * instrument at all, and it is what these pin.
 *
 * The slot names are pinned too. `willEnableEngine` and `didDisableEngine`
 * carry the SDK's own audio policy and registering on either replaces it, so
 * "which two slots" is a correctness question rather than a detail — and the
 * jest mock deliberately does not offer them, which makes the wrong choice a
 * failure to compile rather than a silent echo weeks later.
 */

const events = audioDeviceModuleEvents as unknown as {
  setWillStartEngineHandler: jest.Mock;
  setDidStopEngineHandler: jest.Mock;
};

beforeEach(() => {
  events.setWillStartEngineHandler.mockClear();
  events.setDidStopEngineHandler.mockClear();
});

/** The handler each slot was given, as the native side would call it. */
function handlerFor(slot: jest.Mock) {
  return slot.mock.calls[0][0] as (params: {
    isPlayoutEnabled: boolean;
    isRecordingEnabled: boolean;
  }) => Promise<void>;
}

it('registers on the two slots the SDK policy does not use', () => {
  watchEngineTransitions(() => {});

  expect(events.setWillStartEngineHandler).toHaveBeenCalledTimes(1);
  expect(events.setDidStopEngineHandler).toHaveBeenCalledTimes(1);
});

it('writes a line naming the transition and both engine flags', async () => {
  const lines: string[] = [];
  watchEngineTransitions((text) => lines.push(text));

  await handlerFor(events.setWillStartEngineHandler)({
    isPlayoutEnabled: true,
    isRecordingEnabled: false,
  });
  await handlerFor(events.setDidStopEngineHandler)({
    isPlayoutEnabled: true,
    isRecordingEnabled: false,
  });

  // `stop` while playout is still enabled is the reading TASKS § *Stepping
  // Back In* is chasing: the engine gone from under a session that still
  // wants it. The pair has to be legible at a glance next to the poll's own
  // `run/rec/play` row, which is why the spelling matches it.
  expect(lines).toEqual([
    'engine start play=T rec=F',
    'engine stop play=T rec=F',
  ]);
});

it('swallows a sink that throws, rather than cancelling the engine operation', async () => {
  watchEngineTransitions(() => {
    throw new Error('the log is broken');
  });

  // Resolving is the whole assertion: a rejection here is a non-zero result
  // code on the native side, and a non-zero result code stops the engine.
  await expect(
    handlerFor(events.setWillStartEngineHandler)({
      isPlayoutEnabled: true,
      isRecordingEnabled: true,
    })
  ).resolves.toBeUndefined();
});

it('survives an SDK that no longer offers the slots', () => {
  events.setWillStartEngineHandler.mockImplementationOnce(() => {
    throw new Error('moved in a bump');
  });

  // The panel falls back to its once-a-second poll, which is where it was
  // before transitions existed. What must not happen is a throw at startup.
  expect(() => watchEngineTransitions(() => {})).not.toThrow();
});

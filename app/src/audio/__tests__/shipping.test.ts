import {
  drainEvents,
  recordEvent,
  resetDiagnostics,
  returnEvents,
} from '../diagnostics';

/**
 * The backlog's own rules, which are about not losing evidence and not
 * retrying forever — the two ways a shipper quietly ruins the thing it is for.
 *
 * The timer and the AppState listener in `startShippingDiagnostics` are not
 * exercised here: what is worth pinning is the handover, because a batch lost
 * between draining and failing is a measurement nobody can ever get back.
 */

beforeEach(() => resetDiagnostics());

it('hands over everything recorded, and forgets it in the same step', () => {
  recordEvent('one');
  recordEvent('two');

  expect(drainEvents().map((e) => e.text)).toEqual(['one', 'two']);
  // Atomic: a reader that copied and then cleared would drop whatever landed
  // in between, and what lands in between is an audio event arriving while a
  // batch is in flight.
  expect(drainEvents()).toEqual([]);
});

it('puts a failed batch back in front of what arrived meanwhile', () => {
  recordEvent('older');
  const batch = drainEvents();
  recordEvent('newer');

  returnEvents(batch);

  // Oldest first, so a log read afterwards is still a log.
  expect(drainEvents().map((e) => e.text)).toEqual(['older', 'newer']);
});

it('keeps the display ring and the backlog independent', () => {
  recordEvent('shipped');
  drainEvents();

  // Draining is about what the server has seen. The panel still shows the
  // line, because those answer different questions and one must not empty the
  // other.
  const { diagnosticEvents } = require('../diagnostics');
  expect(diagnosticEvents().map((e: { text: string }) => e.text)).toEqual([
    'shipped',
  ]);
});

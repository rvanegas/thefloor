import {
  alertFor,
  describeLevel,
  DEFAULT_NOTIFICATION_LEVEL,
  NOTIFICATION_LEVELS,
  type NotificationKind,
} from '../notifications';

const automatic: NotificationKind[] = ['invited', 'arrived'];

describe('how loudly a channel may interrupt', () => {
  it('leaves the default arrangement alone', () => {
    expect(DEFAULT_NOTIFICATION_LEVEL).toBe('medium');
    for (const kind of automatic) {
      expect(alertFor(kind, 'medium')).toBe('silent');
    }
    expect(alertFor('pinged', 'medium')).toBe('audible');
  });

  it('quiets the ping too, at the bottom', () => {
    for (const kind of [...automatic, 'pinged' as const]) {
      expect(alertFor(kind, 'low')).toBe('passive');
    }
  });

  it('lets the channel speak up, at the top', () => {
    for (const kind of [...automatic, 'pinged' as const]) {
      expect(alertFor(kind, 'high')).toBe('audible');
    }
  });

  /**
   * The property worth keeping if the table is ever edited, and the reason
   * `low` takes the ping down with everything else: a person asking for you by
   * name must never be quieter than somebody wandering into the room, and
   * turning the setting up must never make anything quieter than it was.
   */
  it('never makes anything quieter as the level goes up', () => {
    const loudness = { passive: 0, silent: 1, audible: 2 };
    for (const kind of [...automatic, 'pinged' as const]) {
      const [low, medium, high] = NOTIFICATION_LEVELS.map(
        (level) => loudness[alertFor(kind, level)]
      );
      expect(low).toBeLessThanOrEqual(medium);
      expect(medium).toBeLessThanOrEqual(high);
      expect(loudness[alertFor('pinged', NOTIFICATION_LEVELS[0])]).toBe(low);
    }
  });

  it('is never quieter about a ping than about anything else', () => {
    const loudness = { passive: 0, silent: 1, audible: 2 };
    for (const level of NOTIFICATION_LEVELS) {
      for (const kind of automatic) {
        expect(loudness[alertFor('pinged', level)]).toBeGreaterThanOrEqual(
          loudness[alertFor(kind, level)]
        );
      }
    }
  });

  it('says what each level does in words somebody can act on', () => {
    for (const level of NOTIFICATION_LEVELS) {
      const { label, detail } = describeLevel(level);
      expect(label).not.toHaveLength(0);
      expect(detail).not.toHaveLength(0);
    }
    // The one that has to be unambiguous: choosing it should not read as
    // turning notifications off altogether.
    expect(describeLevel('low').detail).toMatch(/pings/i);
  });
});

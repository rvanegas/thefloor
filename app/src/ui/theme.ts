export const colors = {
  bg: '#0E1013',
  surface: '#181B20',
  surfaceRaised: '#22262D',
  border: '#2E333B',
  text: '#F2F4F7',
  textMuted: '#98A2B3',
  textFaint: '#667085',
  /** The floor: the app's one distinguishing mechanic gets the accent. */
  floor: '#7C5CFF',
  floorDim: '#3A2F6B',
  /** Being force-muted by the other party. */
  silenced: '#F0824D',
  recording: '#F04438',
  danger: '#F04438',
  success: '#32D583',
  disabled: '#2A2E35',
};

export const spacing = (n: number) => n * 8;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    color: colors.textFaint,
  },
  muted: { fontSize: 13, color: colors.textMuted },
  mono: {
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'] as const,
  },
};

/** mm:ss, for floor countdowns, cooldowns, and elapsed time. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

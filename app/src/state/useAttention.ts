import type { ChannelState } from '../../../core/types';

/**
 * Nothing, on a phone, and the file exists to say why rather than to leave the
 * import failing.
 *
 * `useAttention.web.ts` replaces this wholesale when Metro bundles for web —
 * the same resolution `useRoute` and `cue` use, and for the same reason: what
 * the browser needs here is not a branch inside a shared implementation, it is
 * an implementation the phone has no use for at all.
 *
 * A phone that is put away loses the process within a second, and its presence
 * about a minute later, without anybody deciding anything — see
 * `attention.ts`. A phone that is *not* put away is in somebody's hand or
 * face down on a table with its own screen lock counting down to the same
 * thing. There is no state in which an iOS app is holding a channel that
 * nobody is near, so there is nothing here to measure.
 */
export function useAttention(
  _live: ChannelState | null,
  _me: string,
  _speaking: string[]
): void {}

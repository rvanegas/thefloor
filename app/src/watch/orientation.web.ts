/**
 * Which way up a phone is allowed to be — a rule a browser cannot be asked to
 * keep, and a no-op here for that reason.
 *
 * `screen.orientation.lock` exists, and it throws on every desktop browser and
 * refuses on a phone browser that is not in the platform's own full-screen
 * element — which this application never enters, `requestFullscreen` being
 * unreachable from the layout that stands in for it. So a phone browser stays
 * whichever way it is held, on *Watch* and everywhere else, and the buttons
 * are the whole of the control there.
 *
 * That is the same conclusion the web reached about the old landscape lock:
 * `returnToPortrait` was a documented no-op here too, which was the first sign
 * that hanging behaviour on turning the device was the wrong mechanism. See
 * orientation.ts for the rule this keeps on a phone.
 */
export function usePortraitUnlessFullScreen(_fullScreen: boolean): void {}

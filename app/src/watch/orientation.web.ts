/**
 * Which way up a phone is allowed to be — a rule a browser cannot be asked to
 * keep, and a no-op here for that reason.
 *
 * `screen.orientation.lock` exists, and it throws on every desktop browser and
 * refuses on a phone browser that is not in the platform's own full-screen
 * element — which this application never enters, `requestFullscreen` being
 * unreachable from the layout that stands in for it. So a phone browser stays
 * whichever way it is held, on *Watch* and everywhere else.
 *
 * **The turn still works here, and is the one thing this no-op does not take
 * away.** A phone browser turned sideways is handed a landscape window by the
 * platform without being asked, which is exactly the reading `isTurned` makes;
 * what is missing is the other half, the righting of the phone on leaving the
 * film. So a phone browser can turn into the picture and turn back out of it,
 * and a laptop — never handheld — has the buttons, which are the whole of the
 * control on every surface with no wrist.
 *
 * See orientation.ts for the rule this keeps on a phone.
 */
export function usePortraitUnlessAtTheFilm(_atTheFilm: boolean): void {}

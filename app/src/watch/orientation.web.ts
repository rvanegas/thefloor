/**
 * Nothing, in a browser, deliberately.
 *
 * `screen.orientation.lock` exists but is refused outside a document that is
 * itself in the browser's full-screen mode, and on a desktop it is either
 * absent or rejects — so the honest web behaviour is the one a window already
 * has. The expanded picture is still expanded there; it simply fills whatever
 * shape the window is, which on a laptop is the shape somebody chose.
 *
 * See orientation.ts for what this is on a phone and why the release lives in
 * a cleanup.
 */
export function useLandscapeWhile(_active: boolean): void {}

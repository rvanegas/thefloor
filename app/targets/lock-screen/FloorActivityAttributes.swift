import ActivityKit
import Foundation

/**
 What the lock screen card holds, as ActivityKit sees it.

 **This file has two target memberships and that is load-bearing.** It is
 compiled into the app, which starts and updates the activity, and into the
 widget extension, which draws it — `plugins/with-live-activity.js` adds it to
 both. A shared *framework* would be the tidier arrangement and is what Apple's
 larger samples do; two memberships is what its smaller ones do, and it is the
 one that does not require a fourth target in a project that is already
 generated rather than hand-kept.

 The consequence to remember: **nothing else may declare this type.** A third
 copy — in the pod, say, which is where a reader might reasonably put it to be
 near the Expo module — would be a third Swift module with a third mangled
 name, and the widget would draw nothing at all while the app reported success.
 `modules/live-activity/ios/LiveActivityModule.swift` says the same thing from
 the other side, and passes a plain record across instead.

 `ActivityAttributes` splits into the fixed and the moving half, and the split
 here is *which channel* against *what is true of it*. The channel is fixed for
 the card's life: standing in a different one is a different activity, because
 stepping out ends this one. Everything else moves — a channel can be renamed
 mid-conversation, and the whole point of the card is a mute that changes.
 */
@available(iOS 16.1, *)
struct FloorActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /**
     What to call the channel, already resolved.

     The app sends the finished string rather than the raw name, because the
     fallback for an unnamed channel is `describeChannel` over the roster and
     the roster is not something a widget has. See `useLockScreen.ts`.
     */
    var channelName: String

    /**
     What the microphone control is called, already resolved.

     **The finished word, for `channelName`'s reason carried one step
     further.** This extension is a separate binary: it has no catalogue in it
     and no way to reach the app's, and an `es.lproj` of its own would be a
     second place this project's vocabulary lives and a second place it goes
     stale. The app knows which language it is speaking and which state the
     microphone is in, so it sends the word rather than the ingredients. See
     `LockScreenState` in `modules/live-activity/index.ts`.
     */
    var micLabel: String

    /**
     The same thing as a state rather than as an act, for the iOS 16 card —
     which has no button, `Button(intent:)` being iOS 17, and so announces
     what is true instead of what a tap would do.
     */
    var micState: String

    /**
     Whether you are not being heard — all three causes, under one word.

     Deliberately not the reducer's `selfMuted`: the app folds in a device with
     no microphone, exactly as the footer icon does. planning/GLOSSARY.md
     § *Mute (four things, one word)* is the entry that separates these, and
     the one a reader should check before narrowing this field.
     */
    var muted: Bool

    /**
     Whether the button is live or grey.

     False covers no microphone and the floor-holder trying to mute themselves.
     It is deliberately **not** false while somebody else holds the floor: a
     silenced person may still set their own mute, and what they set is what
     they are left with when the claim ends.
     */
    var canToggle: Bool
  }

  /** Which channel to come back to. Carried into the card's deep link. */
  var channelId: String
}

import SwiftUI
import WidgetKit

/**
 The extension's entry point, and the whole of what it contains.

 **There are no home-screen widgets here and this is not a step towards any.**
 The target exists because a Live Activity can only be drawn by a widget
 extension — it is the delivery mechanism for one card, not a widget suite that
 happens to start with one. Adding an ordinary widget would mean deciding what
 this app puts on a home screen, which is a question nobody has asked.

 **The extension's own deployment target is 16.1, where the app's is 15.1**,
 and an extension is allowed to be later than the app that carries it. That is
 why there is no availability check in this file: a phone below 16.1 simply
 never loads the extension, where the app-side code has to keep working there
 and is annotated accordingly. `plugins/with-live-activity.js` sets it, and it
 is the one build setting in this target that is a decision rather than a
 default.
 */
@main
struct LockScreenWidgetBundle: WidgetBundle {
  var body: some Widget {
    LockScreenLiveActivity()
  }
}

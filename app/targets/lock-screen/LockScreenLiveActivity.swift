import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/**
 The card itself: a name, a state, a Mute button, and a tap that opens.

 **Colours are copied from `app/src/ui/theme.ts` rather than shared with it.**
 A widget extension is a separate process with no JavaScript in it, so there is
 no importing the palette; what is here is a transcription, and a transcription
 drifts. `planning/STYLE.md` § *The lock screen card* carries the pointer in
 the other direction — change one, change both, in the same commit.

 Only the tokens this card spends are transcribed. Adding a colour here means
 adding it there first and deciding what it is for, which is the rule for every
 other surface and is not relaxed by the file being Swift.
 */
@available(iOS 16.1, *)
private enum Palette {
  static func text(_ dark: Bool) -> Color {
    dark ? Color(hex: 0xF2F4F7) : Color(hex: 0x12151A)
  }
  static func muted(_ dark: Bool) -> Color {
    dark ? Color(hex: 0x98A2B3) : Color(hex: 0x5A6474)
  }
  /** The label of a refused control. */
  static func faint(_ dark: Bool) -> Color {
    dark ? Color(hex: 0x667085) : Color(hex: 0x6B7484)
  }
  /** The fill under a refused control. Grey is this interface's word for it. */
  static func disabled(_ dark: Bool) -> Color {
    dark ? Color(hex: 0x2A2E35) : Color(hex: 0xE4E7EC)
  }
  /** The default button fill. */
  static func raised(_ dark: Bool) -> Color {
    dark ? Color(hex: 0x22262D) : Color(hex: 0xE9ECF1)
  }
  /** The floor: the app's one distinguishing mechanic gets the accent. */
  static let floor = Color(hex: 0x7C5CFF)
}

extension Color {
  fileprivate init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}

@available(iOS 16.1, *)
struct LockScreenCard: View {
  let state: FloorActivityAttributes.ContentState
  let channelId: String
  @Environment(\.colorScheme) private var scheme

  private var dark: Bool { scheme == .dark }

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(state.channelName)
          .font(.headline)
          .foregroundColor(Palette.text(dark))
          .lineLimit(1)
        /**
         The footer's own hints, word for word.

         Two surfaces describing one microphone should not describe it in two
         vocabularies. `ui/ChannelView.tsx` is where these strings live for the
         screen, and copying them is the same transcription the palette above
         is — with the same rule about changing both.
         */
        Text(state.muted ? "Your microphone is muted" : "Your microphone is open")
          .font(.caption)
          .foregroundColor(Palette.muted(dark))
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      MuteControl(state: state, dark: dark)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    /**
     The card's other control, and the reason the button above needs no
     explanation when it is grey.

     Tapping anywhere that is not the button opens the app at this channel. A
     disabled control on this surface carries no sentence saying why — there is
     no room for one, and being refused here is the ordinary condition rather
     than an error — so *go and look* is the affordance that stands in for it.
     See `planning/STYLE.md`, which carries that as a named exception.
     */
    .widgetURL(URL(string: "thefloor://channel/\(channelId)"))
  }
}

/**
 Mute, Unmute, or grey.

 **The button exists only on iOS 17.** `Button(intent:)` is what lets a tap act
 without opening the app, and there is no earlier spelling of it — a 16.x card
 falls back to stating the microphone rather than offering to change it, which
 is worth more than a button that would have to open the app to work and would
 therefore be the card's other control wearing a different label.
 */
@available(iOS 16.1, *)
private struct MuteControl: View {
  let state: FloorActivityAttributes.ContentState
  let dark: Bool

  private var label: String { state.muted ? "Unmute" : "Mute" }

  var body: some View {
    if #available(iOS 17.0, *) {
      Button(intent: ToggleMuteIntent(muted: !state.muted)) {
        Text(label)
          .font(.subheadline.weight(.medium))
          .foregroundColor(
            state.canToggle ? Palette.text(dark) : Palette.faint(dark)
          )
          .padding(.horizontal, 14)
          .padding(.vertical, 8)
          .background(
            state.canToggle ? Palette.raised(dark) : Palette.disabled(dark)
          )
          .clipShape(Capsule())
      }
      .buttonStyle(.plain)
      .disabled(!state.canToggle)
    } else {
      Text(label)
        .font(.subheadline.weight(.medium))
        .foregroundColor(Palette.faint(dark))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Palette.disabled(dark))
        .clipShape(Capsule())
    }
  }
}

@available(iOS 16.1, *)
struct LockScreenLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FloorActivityAttributes.self) { context in
      LockScreenCard(
        state: context.state,
        channelId: context.attributes.channelId
      )
      .activityBackgroundTint(nil)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: context.state.muted ? "mic.slash.fill" : "mic.fill")
            .foregroundColor(Palette.floor)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.channelName)
            .font(.headline)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          MuteControl(state: context.state, dark: true)
        }
      } compactLeading: {
        Image(systemName: context.state.muted ? "mic.slash.fill" : "mic.fill")
          .foregroundColor(Palette.floor)
      } compactTrailing: {
        EmptyView()
      } minimal: {
        Image(systemName: context.state.muted ? "mic.slash.fill" : "mic.fill")
          .foregroundColor(Palette.floor)
      }
      .widgetURL(URL(string: "thefloor://channel/\(context.attributes.channelId)"))
    }
  }
}

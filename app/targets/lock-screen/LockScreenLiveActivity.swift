import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/**
 The card itself: a name, a microphone, Out, and a tap that opens.

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

/**
 The microphone, open or muted, transcribed from `app/src/ui/icons.tsx`.

 **The same glyph as the footer's, not an SF Symbol that resembles it.** The
 card's whole vocabulary is the screen's — the palette above, the words that
 used to be here — and an icon is the part somebody reads without reading, so a
 second microphone shape would be the loudest of the three drifts. `lucide/mic`
 and `lucide/mic-off`, on the same 24-unit box and the same 2-unit stroke; the
 SVG's arcs are written here as sweeps, since a `Path` has no arc flags.
 `MicIcon` in `icons.tsx` is the other copy — change one, change both.

 `addRelativeArc` rather than `addArc(clockwise:)` deliberately: a sweep is a
 signed delta and cannot be read backwards, where the flag's sense is flipped
 by SwiftUI's y-down space and a wrong guess draws the long way round.
 */
@available(iOS 16.1, *)
private struct MicShape: Shape {
  let muted: Bool

  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 24
    func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
      CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
    }
    var p = Path()

    // The stem, which both states share.
    p.move(to: pt(12, 19))
    p.addLine(to: pt(12, 22))

    if muted {
      // The body's upper half, cut short where the strike crosses it.
      p.move(to: pt(15, 9.34))
      p.addLine(to: pt(15, 5))
      p.addRelativeArc(
        center: pt(12, 5), radius: 3 * s,
        startAngle: .degrees(0), delta: .degrees(-153.6)
      )
      // The cradle, likewise in two pieces with the strike between them.
      p.move(to: pt(16.95, 16.95))
      p.addRelativeArc(
        center: pt(12, 12), radius: 7 * s,
        startAngle: .degrees(45), delta: .degrees(135)
      )
      p.addLine(to: pt(5, 10))
      p.move(to: pt(18.89, 13.23))
      p.addRelativeArc(
        center: pt(12, 12), radius: 7 * s,
        startAngle: .degrees(10.12), delta: .degrees(-10.12)
      )
      p.addLine(to: pt(19, 10))
      // The strike itself.
      p.move(to: pt(2, 2))
      p.addLine(to: pt(22, 22))
      // The body's lower half.
      p.move(to: pt(9, 9))
      p.addLine(to: pt(9, 12))
      p.addRelativeArc(
        center: pt(12, 12), radius: 3 * s,
        startAngle: .degrees(180), delta: .degrees(-135)
      )
    } else {
      p.move(to: pt(19, 10))
      p.addLine(to: pt(19, 12))
      p.addRelativeArc(
        center: pt(12, 12), radius: 7 * s,
        startAngle: .degrees(0), delta: .degrees(180)
      )
      p.addLine(to: pt(5, 10))
      p.addPath(
        Path(
          roundedRect: CGRect(
            origin: pt(9, 2), size: CGSize(width: 6 * s, height: 13 * s)
          ),
          cornerRadius: 3 * s
        )
      )
    }
    return p
  }
}

@available(iOS 16.1, *)
private struct MicGlyph: View {
  let muted: Bool
  let color: Color
  var size: CGFloat = 22

  var body: some View {
    MicShape(muted: muted)
      .stroke(
        color,
        style: StrokeStyle(lineWidth: 2 * size / 24, lineCap: .round, lineJoin: .round)
      )
      .frame(width: size, height: size)
  }
}

/**
 Stepping out, transcribed from `StepIcon` in `app/src/ui/icons.tsx`.

 `lucide/log-out`, on `MicShape`'s box and stroke and for its reason: the
 footer's Out rung draws this, and the card's button is the same act. The two
 corners are quarter sweeps, written as deltas for the reason `MicShape` gives.
 Change one, change both.
 */
@available(iOS 16.1, *)
private struct StepOutShape: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 24
    func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
      CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
    }
    var p = Path()
    // The arrowhead, and the shaft leaving through it.
    p.move(to: pt(16, 17))
    p.addLine(to: pt(21, 12))
    p.addLine(to: pt(16, 7))
    p.move(to: pt(21, 12))
    p.addLine(to: pt(9, 12))
    // The doorway it leaves, open on the right.
    p.move(to: pt(9, 21))
    p.addLine(to: pt(5, 21))
    p.addRelativeArc(
      center: pt(5, 19), radius: 2 * s,
      startAngle: .degrees(90), delta: .degrees(90)
    )
    p.addLine(to: pt(3, 5))
    p.addRelativeArc(
      center: pt(5, 5), radius: 2 * s,
      startAngle: .degrees(180), delta: .degrees(90)
    )
    p.addLine(to: pt(9, 3))
    return p
  }
}

@available(iOS 16.1, *)
struct LockScreenCard: View {
  let state: FloorActivityAttributes.ContentState
  let channelId: String
  @Environment(\.colorScheme) private var scheme

  private var dark: Bool { scheme == .dark }

  /**
   How much larger this surface's controls are than the island's.

   **A lock screen is read at arm's length, and often not held.** The card is
   the width of the screen with six words on it and room to spare, where the
   expanded island is a panel with three regions to fit; the same control that
   is comfortable there is small here. Both controls take it, so the pair keeps
   its proportions — a glyph that grew while the word beside it did not would
   read as two sizes rather than one.

   **A half rather than a whole doubling, and both ends were seen.** At 1 the
   microphone was a 22pt glyph in a 40pt disc, small on a card read across the
   width of the screen; at 2 the pair crowded the name it sits beside and read
   as a toolbar rather than a card. This is the middle, and it is a judgement
   about this surface rather than a number derived from anything.
   */
  private static let scale: CGFloat = 1.5

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      /**
       The name, and nothing under it.

       **The card used to carry the footer's hint — "Your microphone is muted"
       — and it was saying what the glyph beside it already says.** Two
       statements of one fact, on a surface with room for about six words, is
       the cost; the glyph is the half that is read without being read. The
       sentence stays in the app, where a struck-through microphone has a
       reason beside it and here it has none.
       */
      Text(state.channelName)
        .font(.headline)
        .foregroundColor(Palette.text(dark))
        .lineLimit(1)
      Spacer(minLength: 8)
      MuteControl(state: state, dark: dark, scale: Self.scale)
      OutControl(state: state, dark: dark, scale: Self.scale)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    /**
     The card's other control, and the reason the button beside it needs no
     explanation when it is grey.

     Tapping anywhere that is not a button opens the app at this channel. A
     disabled control on this surface carries no sentence saying why — there is
     no room for one, and being refused here is the ordinary condition rather
     than an error — so *go and look* is the affordance that stands in for it.
     See `planning/STYLE.md`, which carries that as a named exception.

     **The only way in since 2026-09-29.** An *Open* button spelled this tap
     out from 2026-09-17 and was taken off to give the controls back their
     room; see `planning/decision/2026-09-29-the-lock-screen-card-drops-open.md`.
     */
    .widgetURL(URL(string: "thefloor://channel/\(channelId)"))
  }
}

/**
 Mute, unmute, or grey — as a glyph, with the word left to the screen reader.

 **The button carries no text**, since 2026-09-17. It read *Mute* or *Unmute*,
 which is the footer's word for the same control; on a card with a channel name
 and a way in to fit as well, the word was the most expensive thing on it and
 the least informative — a struck-through microphone is the one piece of this
 vocabulary everybody already has.

 **The button exists only on iOS 17.** `Button(intent:)` is what lets a tap act
 without opening the app, and there is no earlier spelling of it — a 16.x card
 falls back to showing the microphone rather than offering to change it, which
 is worth more than a button that would have to open the app to work and would
 therefore be the card's own tap wearing a glyph.
 */
@available(iOS 16.1, *)
private struct MuteControl: View {
  let state: FloorActivityAttributes.ContentState
  let dark: Bool
  var scale: CGFloat = 1

  /**
   What the glyph would have said. The screen reader still gets it.

   Read off the state rather than chosen here, since the app learned a second
   language: this target has no catalogue and the app has one. See
   `ContentState.micLabel`.
   */
  private var label: String { state.micLabel }

  var body: some View {
    if #available(iOS 17.0, *) {
      Button(intent: ToggleMuteIntent(muted: !state.muted)) {
        glyph(enabled: state.canToggle)
      }
      .buttonStyle(.plain)
      .disabled(!state.canToggle)
      .accessibilityLabel(label)
    } else {
      glyph(enabled: false)
        .accessibilityLabel(state.micState)
    }
  }

  private func glyph(enabled: Bool) -> some View {
    MicGlyph(
      muted: state.muted,
      color: enabled ? Palette.text(dark) : Palette.faint(dark),
      size: 22 * scale
    )
    .padding(9 * scale)
    .background(enabled ? Palette.raised(dark) : Palette.disabled(dark))
    .clipShape(Circle())
  }
}

/**
 Out: the step-out the footer's last rung makes, without opening the app.

 **A glyph like the microphone, not a word.** It is the footer's
 `StepIcon`, which is how the app draws the same act, and the word — *Out*, in
 whichever language the app is speaking — is its accessibility label.

 **Never grey.** A departure is the one act nothing withholds; the reducer has
 no refusal for `STEP_OUT`, so there is no disabled state to draw.

 **iOS 17 only, like the microphone**, for the same reason: `Button(intent:)`.
 A 16.x card draws nothing here rather than a glyph that does nothing — the
 microphone is shown there because it states something true about the room,
 and a door does not.
 */
@available(iOS 16.1, *)
private struct OutControl: View {
  let state: FloorActivityAttributes.ContentState
  let dark: Bool
  var scale: CGFloat = 1

  var body: some View {
    if #available(iOS 17.0, *) {
      Button(intent: StepOutIntent()) {
        StepOutShape()
          .stroke(
            Palette.text(dark),
            style: StrokeStyle(
              lineWidth: 2 * (22 * scale) / 24, lineCap: .round, lineJoin: .round
            )
          )
          .frame(width: 22 * scale, height: 22 * scale)
          .padding(9 * scale)
          .background(Palette.raised(dark))
          .clipShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(state.outLabel ?? "Out")
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
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.channelName)
            .font(.headline)
            .lineLimit(1)
        }
        /**
         The controls, in the card's order, in the region wide enough for
         them.

         They were leading and trailing, which is where an expanded island puts
         an icon and a badge rather than a pair of buttons — and the leading
         one was a *third* microphone, stating what the trailing button already
         drew. The name gets the middle, the controls get the row under it.
         */
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 10) {
            Spacer(minLength: 8)
            MuteControl(state: context.state, dark: true)
            OutControl(state: context.state, dark: true)
          }
        }
      } compactLeading: {
        MicGlyph(muted: context.state.muted, color: Palette.floor, size: 16)
      } compactTrailing: {
        EmptyView()
      } minimal: {
        MicGlyph(muted: context.state.muted, color: Palette.floor, size: 16)
      }
      .widgetURL(URL(string: "thefloor://channel/\(context.attributes.channelId)"))
    }
  }
}

import { StyleSheet } from 'react-native';
import { colors, measure, radius, spacing, type } from './theme';

/**
 * Every style the channel screen and its cards draw with.
 *
 * Split out of `ChannelView.tsx` on 2026-09-23, when the cards moved to
 * `channelCards.tsx` and the two files needed the same sheet. Kept whole
 * rather than divided between them: of the seventy-odd keys eight are used on
 * both sides, and a sheet split three ways — screen, cards, shared — is three
 * places to look for one name.
 */
export const styles = StyleSheet.create({
  audioMuted: { ...type.muted, color: colors.textFaint },
  audioBad: { ...type.muted, color: colors.danger },
  /**
   * A roster line that has stopped being reassuring.
   *
   * The same argument `audioBad` makes one line up, applied to one person
   * instead of the connection: somebody the room cannot hear is a conversation
   * that has stopped working for them, and it earns a glance. It is the only
   * thing on a roster card that is ever coloured, which is what makes a glance
   * enough.
   */
  statusBad: { color: colors.danger },
  /**
   * `flex: 1` so the name takes the slack in the header row and truncates
   * rather than pushing Home and Settings off the edge.
   *
   * 20 rather than `type.title`'s 28: this rides above every screenful now,
   * so its height is paid for on all of them, and a large title is a thing a
   * scroll is entitled to at its top and a pinned bar is not.
   */
  // No `flex: 1`: it sits in `headerMain`, which is a column, and there it
  // would stretch down the header rather than along it. The width it
  // truncates against is that column's, which the row constrains.
  otherName: { fontSize: 20, fontWeight: '700', color: colors.text },
  container: { padding: spacing(2), paddingBottom: spacing(2) },
  /**
   * The second device's body, which is not a stack of cards and so needs the
   * gap the cards would otherwise have brought with them.
   *
   * The same padding as {@link container}, deliberately: the transport lines
   * up with the cards on the *Watch* tab, and the picture above it is the same
   * hole measured the same way, so moving between the two devices does not
   * move the film or its controls.
   */
  secondDeviceBody: {
    padding: spacing(2),
    paddingBottom: spacing(2),
    gap: spacing(1.5),
  },
  /**
   * The getting-started card. `gap` rather than margins between its three
   * children, and the dismissal pushed to the end of its own row so it sits
   * where every other card's action does rather than under the last sentence.
   */
  cohort: { gap: spacing(1), marginBottom: spacing(2) },
  cohortActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(2),
  },
  centeredText: { textAlign: 'center', lineHeight: 20 },
  presence: { gap: 2, marginBottom: spacing(0.5) },
  /**
   * The switch between the tabs. Its own margin rather than the notepad's,
   * back when that sat above it: the notepad is often empty and the gap above
   * the roster is not.
   */
  tabs: { marginTop: spacing(0.5), marginBottom: spacing(0.5) },
  /**
   * The same switch, pinned in the header instead of scrolling with the page.
   *
   * No margins of its own: `headerInner` already sets the gap between the
   * name row and this, and the header's own `paddingBottom` is the space
   * between this and the hairline. The horizontal padding is inherited from
   * `headerInner` too, which is what lines the switch up with the cards below
   * rather than with the window.
   */
  tabsHeader: { marginTop: 0, marginBottom: 0 },
  members: { gap: spacing(1), marginTop: spacing(1) },
  guestActions: { flexDirection: 'row', gap: spacing(1), flexWrap: 'wrap' },
  participantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.25),
    gap: 2,
  },
  /** The accent, the same one the floor gets: this is the app's one mechanic. */
  participantCardLive: { borderColor: colors.floor },
  /**
   * Whoever holds the floor, tinted rather than outlined — because the outline
   * is taken, and by the one thing it must not be confused with.
   *
   * `participantCardLive` means *speaking*, driven by the room — and, for
   * somebody the room is withholding, by their own device saying so; this means
   * *permitted*, driven by the reducer. They are different questions and
   * routinely disagree — a holder sitting silent, a self-muted person whose
   * claim is running — so they cannot share an edge. The fill says whose
   * minute it is and the border says whether they are spending it, and a card
   * that is both reads as both.
   *
   * Before `pressed`, so pressing a holder's card still looks pressed.
   */
  participantCardFloor: { backgroundColor: colors.floorDim },
  participantCardPressed: { backgroundColor: colors.surfaceRaised },
  /**
   * The name and status on the left, the ping or the speaking dot on the
   * right, centred against the pair. A row rather than the control sharing the
   * status line: the status is one clause long and the button is two words, and
   * stacking them would make every roster card taller to hold something only a
   * nearby person's card has.
   */
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  /** Takes the slack, so a long name or status wraps rather than crushing the
      control beside it. */
  cardText: { flexShrink: 1, flexGrow: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardStatus: { flexShrink: 1 },
  /**
   * Tightened, since `Button` is sized for a card of its own and this one sits
   * inside a row of text. It carries the ordinary fill now that `ghost` is
   * gone — the size is what keeps it from competing with the floor, which is
   * still the only thing on this screen entitled to colour, and `surfaceRaised`
   * is not colour.
   */
  cardPing: { paddingVertical: spacing(0.5), paddingHorizontal: spacing(1), minHeight: 0 },
  /**
   * The floor's two clocks, at the weight of a name rather than of the
   * 34-point readout they replace. A card is a line of text and a number
   * beside it; the number was that size when it was the only thing in a card
   * of its own, and at that size on a roster row it would be the first thing
   * read about a person whose name it dwarfed.
   *
   * Tabular, so the row does not shuffle as the digits change, and
   * `flexShrink: 0` so the name yields to it rather than the other way about.
   *
   * Plain text rather than the accent, as the big readout was: the claim's
   * clock sits on a card already tinted `floorDim`, and the accent on that
   * fill is a violet on a violet in dark mode. The card carries the colour and
   * the number carries the number.
   */
  cardClock: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  cardClockMuted: { fontWeight: '600', color: colors.textMuted },
  speakingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  speakingDotLive: {
    borderColor: colors.floor,
    backgroundColor: colors.floor,
  },
  /**
   * The notepad's words. Body rather than the muted grey it was in: it was a
   * line under a header when that style was written, and it is the content of
   * its own card now, with the muted tone left to the sentences *about* it.
   */
  description: {
    ...type.body,
    lineHeight: 20,
    marginTop: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  /**
   * The notepad's *Edit*, which is small on purpose: `flex-start` so it is the
   * width of the word rather than of the card, the sheet being the thing on
   * this card and this being the way to change it. The width is the whole of
   * that now: the tone that used to say it alongside is gone, and a control
   * the width of its own word is already quieter than the sheet above it.
   */
  notepadEdit: { alignSelf: 'flex-start', paddingHorizontal: spacing(1) },
  /** The notepad's character count, under the field while it is open. */
  count: {
    ...type.muted,
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  /**
   * The pinned header, which carries the same horizontal padding as
   * `container` so the name lines up with the cards under it.
   *
   * The hairline is the one thing a pinned header needs that a scrolling one
   * does not, for the reason TranscriptView's says: without an edge the
   * content slides up to the buttons and stops, with nothing saying which of
   * the two moved.
   */
  header: {
    paddingTop: spacing(1),
    paddingBottom: spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: { ...measure, paddingHorizontal: spacing(2), gap: spacing(0.5) },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  /**
   * The kind and the name, taking whatever the controls leave — which since
   * the recording pill came up here is less, and varies with whether one is
   * running at all. That is the arrangement rather than a defect in it: the
   * name is the one thing on the row that degrades gracefully, so it is the
   * one that gives, and what will not fit ends in an ellipsis. `flex: 1`
   * takes the slack; the `numberOfLines={1}` at the two sites does the rest.
   */
  headerMain: { flex: 1, gap: spacing(0.5) },
  headerKind: { ...type.label },
  /**
   * Negative trailing margin: `Button`'s horizontal padding is sized for a
   * card, and without it the pair sits further from the edge than the name is
   * from the other one, which reads as a mistake rather than as chrome.
   */
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -spacing(1),
    // Explicit, though it is React Native's default: this row must not be
    // the thing that shrinks. Everything in it is either a touch target at
    // its minimum size or a pill whose text says a duration, and the name
    // beside it is what truncates instead.
    flexShrink: 0,
  },
  /**
   * The pinned footer.
   *
   * A top hairline for the reason the header has a bottom one: without an
   * edge the last card slides under the icons and stops, with nothing saying
   * which of the two moved. `surface` rather than `bg` so the bar reads as
   * sitting above the page — the same relationship the cards have to it.
   *
   * No bottom inset here. `App.tsx` wraps the whole application in a
   * `SafeAreaView` with `edges={['top', 'bottom']}`, so the home indicator is
   * already accounted for; adding padding for it here would double it.
   */
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing(1),
    paddingBottom: spacing(0.75),
  },
  /**
   * The bar itself, capped and centred inside the full-bleed surface above.
   *
   * Narrower than `measure`, and by a lot: 620 divided up is a target for an
   * icon and one word wide enough to stop reading as a control and start
   * reading as a row of banners. It was 480 while there were three of these,
   * putting each at 160 against the ~125 a phone gives them — the same object,
   * slightly larger, rather than a different one. 560 across four keeps that
   * ratio at 140 against a phone's ~90, where holding 480 would have dropped
   * an iPad's below the phone's and left the bar looking cramped on the wider
   * screen.
   *
   * The rule and the fill stay full-bleed, for the reason the header's do: an
   * edge that stops short of the window is not an edge.
   */
  footerInner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing(1),
  },
  /**
   * `flex: 1` on all four, so each is a quarter of the bar whatever its label
   * says. The alternative — sizing to content — moves its neighbours when
   * "Claim" becomes "Release" or "Be nearby" becomes "Step out", which is a
   * target shifting under the thumb at the exact moment somebody is reaching
   * for it a second time.
   *
   * `minHeight` is the 44pt Apple asks for. The disc inside is taller than
   * that on its own, so this is a floor the layout already clears rather than
   * one it depends on — kept because the disc's height is a visual decision
   * and the target's is not.
   */
  footerAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: spacing(0.25),
  },
  footerActionPressed: { opacity: 0.6 },
  /**
   * The glyph and its label as one object, and the shape the accent fills.
   *
   * **Fixed height and a radius of half it**, so the disc appears and vanishes
   * without moving anything: the box is the same size accented or not, and the
   * bar does not change height when somebody claims the floor. Round rather
   * than a rounded rectangle, for the reason the smaller disc was round — a
   * rectangle at this size reads as a second button inside the button.
   *
   * `minWidth` equal to the height is what makes it a circle for the short
   * labels and a pill for the long ones, rather than a circle that clips
   * "Nearby". `maxWidth` keeps it inside its fifth of the bar; the label
   * ellipsises there rather than pushing its neighbours, which is the same
   * promise `flex: 1` above makes about position.
   */
  footerStack: {
    minWidth: 54,
    maxWidth: '100%',
    height: 54,
    borderRadius: 27,
    paddingHorizontal: spacing(1),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  footerStackAccented: { backgroundColor: colors.surfaceRaised },
  /** A fixed box around a 22px glyph, so the icons sit on one line. */
  footerIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 11px, which is smaller than anything else in this application and is the
   * one place that is right: it is a caption under a glyph that has already
   * said it, and the pair is what gets read rather than either half.
   */
  footerLabel: { fontSize: 11, fontWeight: '600' },
  /**
   * The seam between the conversation and what the channel is carrying.
   *
   * The rule is the whole of the visual weight; the text is `type.label`'s
   * size in `textMuted` rather than a third heading size. Top margin is
   * larger than `SectionLabel`'s so the group reads as beginning here rather
   * than as one more section.
   */
  warning: { color: colors.silenced, fontSize: 13, marginTop: spacing(0.5) },
  // Advice rather than a failure, so it carries weight without the colour a
  // warning uses — nothing is broken when a watch party needs headphones.
  emphasis: { fontWeight: '600', color: colors.text },
  // Under the roster, in the same muted grey the descriptions use rather than
  // the silenced colour: nothing is wrong, the room is quiet on purpose.
  partyMuted: {
    ...type.muted,
    textAlign: 'center',
    marginTop: spacing(0.75),
  },
  /**
   * The indicator itself: the disc, the word and the clock inside a hairline
   * pill. It lived on the Recording card until the header took it back, and
   * the surface, the border and the padding are that card's verbatim.
   *
   * `surface` rather than `surfaceRaised` — the token that would lift it off
   * a card is the default `Button` fill, and a pill wearing it reads as a
   * control that does nothing when pressed. An outline that is plainly not a
   * button is the better of the two, in the header as it was on the card.
   *
   * `alignSelf: 'center'` rather than the `flex-start` the card wanted: this
   * now sits in a row beside two 44pt glyph buttons, and the pill is shorter
   * than they are, so it wants the row's centre line. Without an `alignSelf`
   * at all it stretches to the row's height and stops being a pill.
   */
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing(0.75),
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.5),
  },
  /**
   * What the pill adds for its place in the header's row of buttons.
   *
   * A gap of its own, since the two neighbours are 44pt boxes whose padding
   * is their spacing and the pill has none to give. `flexShrink: 0` so the
   * name's `flex: 1` takes every remaining point and the pill keeps its
   * width — the whole arrangement rests on the name being the thing that
   * gives, and a pill squeezed to half a clock states nothing.
   */
  headerRecording: { marginRight: spacing(0.5), flexShrink: 0 },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.recording,
  },
  recordingDotPaused: { backgroundColor: colors.textFaint },
  recordingLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  recordingTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.floor },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  volumeReadout: { justifyContent: 'center', minWidth: 44, alignItems: 'center' },
  stack: { gap: spacing(1) },
  buttonRow: { flexDirection: 'row', gap: spacing(1) },
  flexButton: { flex: 1 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1.5),
  },
  inviteName: { flex: 1 },
  /**
   * The mark on a contact's row, which is *Add a contact*'s mark to the
   * number: same disc, same disposition of the accent — only the mark carries
   * it, the offer being available rather than urgent. Two identical promises
   * drawn two different ways would be two promises.
   */
  inviteMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.floorDim,
  },
  /**
   * The mark's footprint with no mark in it, so that a row whose offer has
   * been taken up keeps its name in the same column as every row that still
   * has one. The gap is `inviteRow`'s own, so only the disc is named here.
   */
  inviteMarkGap: { width: 28, height: 28 },
  inviteMarkOff: { backgroundColor: colors.disabled },
  inviteMarkPressed: { opacity: 0.6 },
  /**
   * What the offer below this row is closed with: the same `+` at an eighth
   * of a turn, which is a `×`. A rotation rather than a second glyph so that
   * the thing on screen is visibly the mark that was pressed, and so that the
   * disc under it never changes size or colour — the offer being open is not
   * a state of the person, and the accent stays where it was.
   */
  inviteMarkGlyphOpen: { transform: [{ rotate: '45deg' }] },
  inviteMarkGlyph: {
    color: colors.floor,
    fontSize: 19,
    // Centred by hand, as on Contacts: the glyph's box is taller than its ink.
    lineHeight: 21,
    fontWeight: '500',
  },
  inviteMarkGlyphOff: { color: colors.textFaint },
  /**
   * The expansion, indented to the mark's far edge so that it reads as
   * belonging to the row above rather than as the next thing in the list.
   * The offset is the disc and `inviteRow`'s gap, which is what puts its left
   * edge under the name that names it.
   */
  inviteOffer: {
    gap: spacing(1),
    paddingLeft: 28 + spacing(1.5),
    paddingBottom: spacing(0.5),
  },
});

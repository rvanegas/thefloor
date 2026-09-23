/**
 * The cards and rows the channel screen draws, and nothing that decides what
 * it does.
 *
 * Split out of `ChannelView.tsx` on 2026-09-23. Each of these takes props and
 * closes over nothing: they were already top-level functions in that file, so
 * the move is a move rather than a refactor, and the screen's own state — the
 * twenty-odd effects and the eleven pieces of `useState` — stayed where it is
 * because splitting *that* would mean prop-drilling or a context, which is a
 * different and riskier change.
 *
 * `InviteMark` and `InviteOffer` are unexported because only `InviteList`
 * draws them.
 */

import React, { useState } from 'react';
import { Pressable, Text, View, type ColorValue } from 'react-native';
import { MAX_CHANNEL_PARTICIPANTS } from '../../../core/constants';
import {
  canInvite,
  idleMs,
  isPresent,
  isWaiting,
  nearbyMs,
} from '../../../core/channel';
import type { Guest } from '../../../core/types';
import type { SessionAudio } from '../audio/useSessionAudio';
import { useApp } from '../state/AppProvider';
import { Button, Card } from './components';
import { styles } from './channelStyles';
import { ago, duration } from './relativeTime';
import { colors, formatSeconds, type } from './theme';
import { useText, type Strings } from '../i18n';

/**
 * One of the four controls in the pinned footer: an icon, a word, and the
 * same guard its card uses.
 *
 * Not a `Button`. `Button` is a filled rectangle sized for a card — its
 * variants decide colour and it has no size axis, which is why two callers
 * already reach past it with a `style` prop. Three of them side by side would
 * make the footer heavier than anything it sits under, and the state here is
 * carried by the icon's colour rather than by a fill.
 *
 * `tone` is that colour, and it is a state rather than a variant: `active`
 * means this is the thing currently true of you — you are muted, you hold the
 * floor — and takes the accent; `silenced` is being muted by somebody else's
 * claim, which is the one state on this bar you did not choose. The label
 * takes the same colour as the icon so the two cannot disagree.
 *
 * `hint` is the accessibility label rather than anything drawn. "Mute" beside
 * an icon is enough to read and not enough to hear.
 */
export function FooterAction({
  label,
  hint,
  icon,
  disabled,
  selected,
  repeatable,
  tone = 'idle',
  onPress,
}: {
  label: string;
  hint: string;
  icon: (color: ColorValue) => React.ReactNode;
  disabled?: boolean;
  /**
   * This control names a state you are already in — the rung of the ladder you
   * are standing on — so there is nothing for a tap to do.
   *
   * **Accented and inert, which is not the same as disabled.** Grey is this
   * bar's word for *refused*: the floor when nobody else is here, the
   * microphone on a device without one. Being somewhere is not a refusal, and
   * greying the rung you are on would say the interface had stopped you from
   * doing the thing you have already done. The accent is the same one the
   * microphone and the floor use, and means the same thing on all three —
   * *this is true of you now*.
   *
   * Takes precedence over `tone` and `disabled` in the colour below, being the
   * strongest statement any of them make. No caller passes it with either.
   */
  selected?: boolean;
  /**
   * This control names a state you are already in **and a tap still does
   * something** — the one combination the paragraph above does not cover.
   *
   * Only *Nearby* is like this, and it is because of what the rung is: the
   * other two are places you either are or are not, and being nearby is a
   * claim with a clock on it. Tapping the lit rung restarts that clock, which
   * is the renewal somebody asks for from the screen it is drawn on — nearby,
   * card reading "Nearby 14m", and no way to reach the fifteenth minute
   * except leaving the rung and coming back. See `DECLARE_NEARBY` in
   * core/channel.ts.
   *
   * **Accented and live**, so the bar still says where you are standing while
   * the control goes on being one. Nothing visible distinguishes it from an
   * inert rung, deliberately: what a tap here does is invisible until the
   * number under it moves, and a fourth appearance for one slot would be
   * teaching the bar a word for something nobody is looking for.
   */
  repeatable?: boolean;
  tone?: 'idle' | 'active' | 'silenced';
  onPress: () => void;
}) {
  const color = selected
    ? colors.floor
    : disabled
      ? colors.textFaint
      : tone === 'silenced'
        ? colors.silenced
        : tone === 'active'
          ? colors.floor
          : colors.text;
  const inert = !!disabled || (!!selected && !repeatable);
  /**
   * The disc behind the control, which says the same thing the colour does and
   * is drawn wherever the colour is not `text`: the rung you are standing on,
   * the microphone you have shut, the floor you hold, the silence somebody
   * else imposed. Not on a refusal — grey on a tinted disc would read as a
   * control that is on and unavailable at once, which is neither of the two
   * things this bar says.
   *
   * **Behind the glyph *and* the label, since 2026-09-10**, where it used to
   * ring the glyph alone. What gets read here is the pair — the label is what
   * makes the icon legible the first time, per the footer's own note — so the
   * thing the disc is selecting is the pair, and a disc that stopped above the
   * word drew a boundary through the middle of one control.
   */
  // `selected` first, since a lit rung is accented whether or not a tap still
  // does anything on it — see `repeatable`, which takes it out of `inert`
  // without taking it off the bar.
  const accented = !!selected || (!inert && tone !== 'idle');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      // `selected` rather than `disabled` for the rung you are on, so a screen
      // reader says which of the three you are on rather than that two thirds
      // of the bar is unavailable. The hint is written for it: "You are
      // nearby", not "Be nearby".
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.footerAction,
        pressed && !inert && styles.footerActionPressed,
      ]}
    >
      <View style={[styles.footerStack, accented && styles.footerStackAccented]}>
        <View style={styles.footerIcon}>{icon(color)}</View>
        <Text style={[styles.footerLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/*
  `GroupHeading` was here and is gone as of 2026-09-12, with the six tabs.

  It was the heading above a run of sections and the only two-level hierarchy
  in this application's chrome, and it existed for one seam on one screen: this
  one was long enough that *What the channel is carrying* had to be said out
  loud, because a flat column of ten identical labels could not show that the
  last six were a different kind of thing from the first four.

  The switch says it instead, and says it better — the sections below the seam
  are not merely labelled as separate, they are separate, and the scroll each
  of them sits in is its own. A heading was the cheapest way to draw a seam
  through one scroll; it was never the best way, and there is now nothing left
  for it to head.
*/

/**
 * One guest in the room, and the three things a member may do about them.
 *
 * Deliberately not a `ParticipantCard` with a badge. Everything that card
 * shows is about membership — invited, stepped out, waiting, how long since
 * they were heard from — and a guest has none of those states: they are here,
 * or they are gone and their card with them. Sharing the component would mean
 * teaching it which half of itself to hide.
 */
export function GuestCard({
  guest,
  muted,
  holdsFloor,
  speaking,
  failing,
  manageable,
  askable,
  asked,
  invited,
  addable,
  onSpeech,
  onEject,
  onAskContact,
  onAskJoin,
  onAddToChannel,
}: {
  guest: Guest;
  muted: boolean;
  holdsFloor: boolean;
  speaking: boolean;
  /**
   * `canManageGuest`, which is presence-or-empty and membership. Both buttons
   * were live to anybody watching until 2026-08-22 and both were refused by
   * the reducer, which is the one shape this codebase does not allow a control
   * to have — and the microphone one renders `primary` when a guest is asking,
   * so the loudest button on the screen was wired to nothing.
   */
  /**
   * The media plane has stopped hearing from them. See `SessionAudio.failing`.
   *
   * Said about a guest for the reason it is said about a member: what the line
   * is for is telling whoever is talking to hold off, and a guest who has been
   * given the microphone is somebody in this conversation. It takes precedence
   * over every other line here, including the floor — a claim held by somebody
   * the room cannot hear is exactly the case worth interrupting.
   */
  failing: boolean;
  manageable: boolean;
  /**
   * Whether *this* member has asked to keep them, and what came of it.
   *
   * Per-reader rather than per-guest: two people in the room may each ask, and
   * a card that read "Asked" because somebody else had would be answering a
   * question this one has not put.
   */
  asked: 'asking' | 'refused' | 'accepted' | undefined;
  /**
   * `canAskGuestJoin` — `manageable` and the seat having no account behind it.
   * Its own guard rather than a `&&` here, so that the control and the reducer
   * are reading the same line.
   */
  askable: boolean;
  /** Whether *this* member has asked them onto The Floor, per `asked`. */
  invited: 'asking' | 'refused' | undefined;
  /**
   * Whether the account behind this seat is an accepted contact of the reader,
   * which is what `INVITE` requires and therefore what the third control is
   * drawn from.
   */
  addable: boolean;
  onSpeech: (maySpeak: boolean) => void;
  onEject: () => void;
  onAskContact: () => void;
  onAskJoin: () => void;
  onAddToChannel: () => void;
}) {
  const t = useText().channelCards;
  const status = failing
    ? t.notReceivingYou()
    : !guest.maySpeak
    ? guest.request === 'asking'
      ? t.listeningAsking()
      : guest.request === 'refused'
        ? t.listeningRefused()
        : t.listening()
    : holdsFloor
      ? t.hasTheFloor()
      : muted
        ? t.canSpeakMuted()
        : speaking
          ? t.speaking()
          : t.canSpeak();

  return (
    <Card style={styles.stack}>
      <Text style={type.body}>
        <Text style={type.heading}>{guest.name}</Text>
        {t.guestSuffix()}
      </Text>
      <Text style={[type.muted, failing && styles.statusBad]}>{status}</Text>
      <View style={styles.guestActions}>
        <Button
          // The asking is what makes this urgent rather than administrative,
          // so the button says what it answers.
          label={
            guest.maySpeak
              ? t.turnTheirMicrophoneOff()
              : guest.request === 'asking'
                ? t.letThemSpeak()
                : t.turnTheirMicrophoneOn()
          }
          variant={guest.request === 'asking' ? 'primary' : 'default'}
          disabled={!manageable}
          onPress={() => onSpeech(!guest.maySpeak)}
        />
        {/*
          Being in a channel together is permission to ask, which is the rule
          members already have between themselves — and a guest is the one
          person in the room it could not reach, having no account to name.
          Answered on their own page, by them: this only asks.

          Disabled by the same `manageable` its siblings are, so no control
          here can offer something the reducer would refuse.
        */}
        <Button
          label={
            asked === 'asking'
              ? t.asked()
              : asked === 'refused'
                ? t.theySaidNo()
                : asked === 'accepted'
                  ? t.contact()
                  : t.addContact()
          }
          disabled={!manageable || !!asked}
          onPress={onAskContact}
        />
        {/*
          **The weakest ask, and the only one that asks for nothing.** Offered
          to a seat with nobody behind it, because that is the only seat it
          means anything to: what it produces is an account, which an
          identified guest already has. `canAskGuestJoin` is the guard, so the
          control disappearing and the reducer refusing are the same line read
          twice rather than two rules.
        */}
        {guest.accountId ? null : (
          <Button
            label={
              invited === 'asking'
                ? t.asked()
                : invited === 'refused'
                  ? t.theySaidNo()
                  : t.askThemToJoin()
            }
            disabled={!askable || !!invited}
            onPress={onAskJoin}
          />
        )}
        {/*
          **The third rung, and the only one that is a membership.** Drawn only
          once they are a contact, which is what `INVITE` refuses without —
          and it is an ordinary invitation from here on: the same action, the
          same guard, the same roster cap. Accepting a contact ask stopped
          carrying this on 2026-09-16; a guest without a membership is the
          common case rather than a conversion that failed.
        */}
        {addable ? (
          <Button
            label={t.addToChannel()}
            disabled={!manageable}
            onPress={onAddToChannel}
          />
        ) : null}
        <Button
          label={t.remove()}
          disabled={!manageable}
          onPress={onEject}
        />
      </View>
      {manageable ? null : (
        <Text style={type.muted}>{t.stepInToAnswerForAGuest()}</Text>
      )}
      {guest.maySpeak ? null : (
        <Text style={type.muted}>{t.theyCanHearYouCannot()}</Text>
      )}
    </Card>
  );
}

/**
 * One person in the channel: who they are, whether they are here, and whether
 * they are talking.
 *
 * Pressable because "who is this?" is a real question about somebody an
 * acquaintance brought in, and the answer — their profile, and the request that
 * keeps them — is one tap from here.
 *
 * Your own card too, since 2026-08-22. It used to be the one card that did
 * nothing, because the profile screen would have offered to add you as your own
 * contact; that stopped being true when ProfileView learnt `isSelf`, and the
 * exception outlived its reason. What it shows you is what the roster around
 * you is looking at, and the way to change it, which is a question somebody
 * has from inside a channel and not only from settings.
 *
 * The speaking indicator is driven by the room rather than by the reducer. The
 * floor decides who *may* speak and the server enforces it; only the media
 * connection knows who is actually making noise, and the two are different
 * questions — a silent floor-holder and a self-muted person mouthing at a dead
 * microphone both look wrong if the badge is inferred from state.
 *
 * **The exception proves it rather than softening it.** Somebody the room is
 * withholding is heard by no media connection at all, so the only account of
 * them is their own device's, carried on the snapshot — see `speakingHere`.
 * It is still a report of noise being made rather than an inference from who
 * is permitted, which is the distinction this paragraph is about.
 */
export function ParticipantCard({
  channel,
  participant,
  self,
  speaking,
  failing,
  now,
  floorRemaining = null,
  cooldown = null,
  onPress,
  onPing,
  pingableAt = null,
  attentiveAt = null,
  watching = false,
}: {
  channel: ReturnType<typeof useApp>['channelViews'][string]['channel'];
  participant: { id: string; displayName: string };
  self: boolean;
  speaking: boolean;
  /**
   * The media plane has stopped hearing from them, which is the earliest
   * warning the room gets that somebody is dropping out. See
   * `SessionAudio.failing`.
   */
  failing: boolean;
  /** The server's clock, which is what the idle time is measured against. */
  now: number;
  onPress?: () => void;
  /**
   * Sends a ping with no words, or absent when this person cannot be pinged
   * from here at all — they are you, or they are standing in the room.
   *
   * Wordless on purpose, and it is the whole point of putting it here. The
   * composer on the profile is for when you have something to say; this is for
   * when the thing to say is *come back*, which the notification already says
   * by existing. A field would make the quick case slower than the considered
   * one.
   */
  onPing?: () => Promise<void>;
  /** When they may next be pinged, or null for now. */
  pingableAt?: number | null;
  /**
   * When they were last attending the application, or null if the server has
   * no clock for them. It is what the *Nearby* line counts, and nothing else
   * on this card: *Stepped out* is timed from presence. See `attention`
   * below for why the two cannot be the same number.
   *
   * Null is not "never". It is a build that predates the report, and the
   * *Nearby* line falls back to `nearbyMs`. See SHIMS.md.
   */
  attentiveAt?: number | null;
  /**
   * Milliseconds left in this person's claim, or null when the floor is not
   * theirs. It is `floorRemainingMs` passed down rather than computed here,
   * one reading of the clock for the whole screen.
   *
   * The clock is on the card because the claim is about *this person* — it is
   * their minute, and the roster is where anybody looks to see whose it is.
   * The floor had a section of its own that kept the clock until 2026-09-12,
   * which meant the one number on the screen that changes every second was
   * the one thing you had to look away from the room to read. That section is
   * gone entirely as of 2026-09-13, and this card is the only place the state
   * of the floor is drawn.
   */
  floorRemaining?: number | null;
  /**
   * Milliseconds until *you* may claim, or null when nothing is holding you
   * back. Non-null on your own card and on nobody else's: the cooldown is a
   * fact about what you may do next, and a step count the reducer keeps per
   * person would be six different numbers if every card carried its own.
   */
  cooldown?: number | null;
  /**
   * Whether this person has the party's film up on one of their devices.
   *
   * **A fact about the person and not about their hardware**, which is what
   * makes it a suffix rather than a second line: the room is being told that
   * somebody is watching, and *which* screen they are watching on is their
   * own business. See `ChannelView.watching`, and `watchingNow` for the guard
   * that keeps it off a roster with no film in the room.
   */
  watching?: boolean;
}) {
  const t = useText().channelCards;
  const here = isPresent(channel, participant.id);
  const reconnecting = channel.disconnectedAt[participant.id] !== undefined;
  const muted = !!channel.selfMuted[participant.id];
  const holdsFloor = channel.floor.holder === participant.id;
  // Somebody who is neither speaking nor able to be heard: the badge would be
  // dead space, so the status carries it instead.
  /**
   * How long it is since anything was heard from them here, in words, or null
   * when there is no such duration — they are here, or nothing has ever been
   * heard from them in this channel.
   *
   * A restart is no longer one of those. The server refreshes this while
   * somebody is present, so what a deploy leaves behind is the last heartbeat
   * before it: "stepped out a minute ago" about somebody who was talking when
   * the process died, which is what anyone on this end can act on and
   * self-corrects the moment their app reconnects. It used to be stamped only
   * at departures, which meant a stale one could survive a restart and report
   * a person who had just been speaking as having left days earlier.
   *
   * Appended rather than given its own line: it qualifies "Stepped out", and a
   * second line under every absent person would make the roster twice as tall
   * to say something that is one clause long.
   */
  const away = idleMs(channel, participant.id, now);
  /**
   * How long this wait has been going on, which is the number the *Nearby*
   * line shows and is not always `away`.
   *
   * A declaration is timed from the declaration and a lost connection from the
   * last thing anybody heard. See `nearbyMs`, which holds the whole argument.
   */
  const waitingFor = nearbyMs(channel, participant.id, now);
  /**
   * How long since they were last attending the application, or null when the
   * server has no clock for them.
   *
   * **This is the *nearby* clock and only that.** It was briefly the one clock
   * this card showed about anybody absent, on 2026-09-09, and the two states
   * do not in fact ask the same question. *Nearby* is a claim about reach —
   * will a notification find them — and attention is exactly the evidence for
   * it. *Stepped out* is a claim about this room: when were they last in it.
   * Attention cannot answer the second, and answering it anyway produced the
   * sentence that gave the game away — somebody who has never once entered a
   * channel, reading it for the first time, described to themselves as having
   * been away four seconds. They had not been anywhere.
   *
   * The two clocks coincide when a rung was lost to a timeout, which is the
   * common case and is why one looked like it would do for both.
   *
   * Clamped like every other duration here, and against the server's clock
   * rather than the device's — a stamp taken a moment ago can arrive as a
   * small negative across a round trip. See `duration`.
   */
  const attention =
    attentiveAt === null ? null : Math.max(0, now - attentiveAt);
  /**
   * Present in spirit: their phone has gone to sleep on them, or they said
   * they were within reach, and either way a notification would still fetch
   * them. The status line says so and the ping button hangs off it, which is
   * the one place in the app where those two are the same fact.
   *
   * **No `away !== null` guard any more.** It was there when the only way to
   * be nearby was to have been present and gone quiet, so a missing stamp
   * meant a missing person. A declaration is knowledge without a stamp —
   * somebody can now be nearby in a channel they have never once entered —
   * and the guard denied it, leaving them drawn as *Invited* while their own
   * footer said *Nearby*. `isWaiting` already refuses anybody whose wait has
   * no clock at all.
   */
  const onWaitingRung = !here && isWaiting(channel, participant.id);
  /**
   * The other rung the word *Nearby* covers: still `present` to the roster,
   * but the server has stopped hearing their socket and is holding the seat
   * open for `DISCONNECT_GRACE_MS`.
   *
   * A phone suspends within a second of its owner pocketing it, and the room
   * is not told for five seconds more, and then the grace holds them
   * nominally present for a minute. Somebody who walked in on the arrival
   * notification spent all of that looking at "Present · reconnecting…" with
   * nothing to press — waiting out a timeout to be told what the line already
   * said.
   *
   * `here &&` is redundant and is written anyway, because it is the invariant
   * that makes the two rungs disjoint: `DISCONNECT_EXPIRED` clears `present`
   * and `disconnectedAt` in one step, so nobody is ever on both.
   */
  const onGraceRung = here && reconnecting;
  /**
   * Out of reach and worth calling, which is the union of the two rungs above.
   *
   * **`callable` is exactly the state whose status line reads *Nearby*.** All
   * four branches of `status` below agree: the grace rung says *Nearby*, the
   * waiting rung says *Nearby* with a duration, and the two remaining cases
   * say *Present* and *Stepped out*. Several rules hang off that equivalence
   * rather than off the word, which is a rendered string and cannot be
   * tested against — see `rail`.
   */
  const callable = onGraceRung || onWaitingRung;
  /**
   * Neither in the room nor callable: they stepped out, and far enough ago
   * that the wait has lapsed and the roster has given up calling them nearby.
   *
   * Worth a name because the server's ping window outlives it — see `rail`,
   * which keeps saying *Pinged* to a card that has stopped saying *Nearby*.
   */
  const departed = !here && !callable;
  /**
   * Whether this card is offering a ping this reader may actually press:
   * `callable` says the person can be called, and `onPing` says *this reader*
   * may call them — it is `mayPing` at the call site, which is `canPing` in
   * `core/` plus an accepted contact.
   *
   * Deliberately narrower than `callable`, and `rail` uses both: what the
   * room is hearing is a fact about the person, and whether there is a button
   * is a fact about the reader. Conflating them is what drew a dot for
   * somebody the room could not hear.
   */
  const pingable = !!onPing && callable;
  const [pinging, setPinging] = useState(false);
  /**
   * That this card sent one, which the server's window does not say yet.
   *
   * The snapshot carrying `pingableAt` is half a second behind the tap and the
   * notification has already gone, so waiting for it would leave the button
   * looking as though the press had been dropped. Same trade the profile
   * composer makes with `pingSent`.
   */
  const [pinged, setPinged] = useState(false);
  const app = useApp();
  // Recomputed rather than held, so it expires on its own: this card re-renders
  // twice a second while anybody is audible, and every second regardless while
  // `now` ticks.
  const pingWait =
    pingableAt !== null && pingableAt > app.serverNow()
      ? pingableAt - app.serverNow()
      : null;
  /**
   * Whether a ping sent from anywhere is still spending its window — this
   * card's own tap, or the one on the snapshot. The two say the same thing a
   * few hundred milliseconds apart.
   */
  const windowOpen = pinged || pingWait !== null;
  /**
   * What the card's one trailing slot holds. Three outcomes, in this order:
   *
   * - **`ping`** — a `Ping` this reader may press, or a disabled `Pinged`
   *   reporting a window somebody's ping has already opened.
   * - **`nothing`** — a *Nearby* card with neither of those to show.
   * - **`dot`** — the speaking indicator.
   *
   * **The rule is that `callable` makes the dot unreachable.** The dot is a
   * claim about what the room is hearing, and *Nearby* is the word for
   * somebody the room is not hearing at all, so there it could only ever sit
   * hollow beside a line already explaining why — two marks that can never
   * disagree, one of which says nothing. So a *Nearby* card's slot is the
   * ping or it is empty.
   *
   * **Empty rather than a greyed `Ping`.** The case with neither half is a
   * reader who may not ping: not an accepted contact of theirs, or out of the
   * room themselves. Both are refusals, and STYLE.md § *Words on controls*
   * wants a sentence beside a refused control; a roster card has no room for
   * one, and a dead control is worse than an absent one. The answer to *why
   * not* is a tap away — the card opens a profile whose Contact section
   * offers *Add contact* — which is what the profile's own ping card was
   * given for drawing nothing in its place.
   *
   * **`pingable` is the only term that makes the button pressable**; the rest
   * decide whether it is drawn at all. The window is five minutes
   * (`PING_INTERVAL_MS`) and outlives the offer, so a card that dropped the
   * word "Pinged" partway through would invite a second ping the server is
   * going to refuse.
   *
   * **`departed` is why that clause is not just `callable`.** Somebody who
   * stepped out long enough ago to have lapsed off the waiting rung reads
   * *Stepped out*, and the server's window may still be running against
   * them; `callable` alone would drop the word there. The clause was `!here`
   * until 2026-09-22, which covered that case and wrongly excluded the grace
   * rung — where `here` is true but the line says *Nearby* — so a reader who
   * may not ping saw a speaking dot in place of the *Pinged* somebody else
   * had earned. One `!here` was doing two jobs and got one of them wrong.
   */
  const rail: 'ping' | 'nothing' | 'dot' =
    pingable || (windowOpen && (callable || departed))
      ? 'ping'
      : callable
        ? 'nothing'
        : 'dot';

  const sendPing = async () => {
    if (!onPing) return;
    setPinging(true);
    try {
      await onPing();
      setPinged(true);
    } catch {
      // Left to correct itself rather than reported on a card with no room for
      // a sentence. Three of the four refusals the server can give are already
      // on their way here as state: they walked in, and the card stops being
      // nearby; or somebody pinged them a moment ago, and the next snapshot
      // brings the window that disables this button and says "Pinged"; or the
      // reader themselves has stopped being present or nearby, which is a tap
      // they just made and whose snapshot takes every ping button on the
      // screen away.
      //
      // The last — they are not a contact — is the one that explains itself
      // to nobody, since the card stays nearby and the window is untouched. It
      // is unreachable from a build that has `mayPing`, which does not draw
      // the button at all; what can produce it is a screen whose contact list
      // said otherwise a moment ago, and the home push that corrects the list
      // is what takes the button away. So the swallow is still right: the
      // refusal it hides is one this screen has already stopped offering.
    } finally {
      setPinging(false);
    }
  };

  const status = here
    ? // Present but unreachable is its own state, not absence: they are still
      // in the channel and still hold whatever they hold. Saying so beats
      // making them vanish and reappear over a moment's bad signal.
      //
      // **Two sources, and the earlier one goes first — unless they agree.**
      // `failing` is the media plane's own judgement, pushed by the SFU about
      // the connection the conversation is travelling on; `reconnecting` is
      // the server noticing a control socket went quiet, which cannot beat the
      // heartbeat. So `failing` leads, and says the useful thing while
      // somebody is still mid-sentence rather than a quarter-minute after the
      // damage — which is the whole of what it is for. See
      // `SessionAudio.failing`.
      //
      // **When both hold, `failing` gives way**, since 2026-09-08. A lost
      // stream *and* a lost socket is a phone that has gone, and the two
      // planes are corroborating each other rather than describing different
      // things. "Not receiving you" would then be saying the one thing that is
      // not true of it — that they are here, and your voice is missing them.
      //
      // **And a socket that has gone reads *Nearby*, not *Present*.** The
      // grace period is a window in which somebody may come back; it is not a
      // claim that they can hear you, and for the length of it this card used
      // to say they were present while they were not. *Nearby* is what they
      // are to everybody else — out of reach, one notification away — and it
      // is already what this card offers, `callable` having included
      // `reconnecting` all along. So the ping was right and the word was
      // wrong.
      //
      // **No duration on it, unlike the nearby case below.** That one counts
      // from `lastPresentAt` and is minutes old by the time it renders; this
      // one is at most the grace period, and a countdown of seconds under
      // somebody's name invites watching it rather than pinging them. If they
      // do not come back the row simply keeps the word and gains the number.
      // See planning/decisions/2026-09-08-the-grace-is-not-a-presence.md.
      reconnecting
      ? t.nearby()
      : failing
        ? t.presentNotReceivingYou()
        : t.present()
    : isWaiting(channel, participant.id)
      ? // They did not leave; their phone did. Walking into a channel and
        // pocketing the phone suspends the process in under a second, so this
        // is what most absences from an otherwise empty channel actually are —
        // and "Stepped out" told whoever arrived to give up on somebody who
        // was one notification away. The clock is the same one the line below
        // uses; only the name changes, and only for WAITING_WINDOW_MS. Said as
        // a length rather than a moment, `away` being how long they have been
        // at it rather than when it started.
        //
        // **"Nearby", not "Been nearby", since 2026-08-27**, which reverses
        // 2026-08-22. The perfect tense was there to stop a bare reading
        // taking the number as a future — *nearby for ten minutes* heard as
        // how much longer they are within reach. Two words to pre-empt a
        // misreading is a poor trade on a roster line, and the misreading
        // needs a reader who does not know what the card is: the number sits
        // beside a name in a room they walked out of, and every other line on
        // this card measures backwards too. Shorter wins.
        //
        // **"Nearby", not "Waiting", since 2026-08-22.** The state is read by
        // somebody standing in an empty room, and that person is the one who
        // is waiting — a card telling them that the absent party is waiting
        // reverses who is doing what, and invites the reply *no, I am*.
        // Nearby says the useful thing instead: this person is within reach,
        // and one tap will fetch them. Which is also why the tap is on the
        // card. The state name in `core/` is still `waiting`, deliberately —
        // `ChannelState.waiting` is on the wire and cannot be renamed without
        // a two-step migration for a word no user ever sees.
        //
        // **The number is the attention clock, since 2026-09-09**, and the
        // word lost "for" with the change of clock. It counted the declaration
        // — how long this person had been nearby — which was a fact about a
        // rung rather than about them, and went stale the moment the rung
        // stopped being the thing anybody wanted to know. What a person
        // reading this wants is whether the notification will find somebody,
        // and *nearby 20s* answers it where *nearby for 14m* invites the
        // reader to work out how much of the fifteen minutes is left. See
        // `attentiveAt`, and `waitingFor` for what is shown when the server
        // has no attention clock for them.
        t.nearbyFor(duration(attention ?? waitingFor ?? 0))
      : channel.everPresent.includes(participant.id)
        ? // **The presence clock, not the attention clock.** For one day this
          // read `Away ${duration(attention)}`, on the argument that *stepped
          // out four minutes ago* is a claim the attention clock cannot make.
          // That much was right; the conclusion was not. The fix is to make
          // the claim with the clock that can make it, rather than to keep the
          // wrong number and soften the word until it fits — *away four
          // seconds* about somebody who left an hour ago is no truer for being
          // vaguer, it has just stopped saying which four seconds it means.
          //
          // What this line is for is the room: when was this person last in
          // it. `idleMs` is that and nothing else. Whether they are reachable
          // *now* is the line above, and somebody who is both gets it.
          away === null
          ? t.steppedOut()
          : t.steppedOutAgo(ago(away))
        : // Never once here, so there is no interval since they were, and no
          // number belongs on this line. It carried `Invited · away ${…}` for
          // a day — the attention clock again, standing in for a presence that
          // has not happened — which is the reading that gave the whole
          // conflation away: a channel you have just been invited to, opened
          // for the first time, telling you that you have been away a few
          // seconds. An invitation is a standing fact with no clock on it.
          t.invited();

  const body = (
    /**
     * A row, so the control on the right is centred against the pair of lines
     * on the left rather than hung off the lower one. The ping is about the
     * person, which is both lines; sitting it on the status line put it a
     * half-line low and made the card look as though it had settled crooked.
     */
    <View style={styles.cardBody}>
      <View style={styles.cardText}>
        {/* One string rather than a name and a suffix, so it is one run of
            text to a screen reader and to anything else reading the tree. */}
        <Text style={styles.cardName} numberOfLines={1}>
          {self ? t.you(participant.displayName) : participant.displayName}
        </Text>
        {/*
          **The tone follows the word, not the flag it came from.** `failing`
          gives way to `reconnecting` above, so a card in that state says
          *Nearby* — and it was saying it in `danger` red, which is the colour
          for a live problem you can act on. Being out of reach is not one:
          it is the same rung half the roster sits on, drawn muted everywhere
          else. Only "Present · not receiving you" earns the red, that being
          the one status claiming somebody is here while your voice misses
          them.
        */}
        <Text
          style={[
            type.muted,
            styles.cardStatus,
            failing && !reconnecting && styles.statusBad,
          ]}
        >
          {status}
          {muted ? t.muted() : ''}
          {holdsFloor ? t.hasTheFloorSuffix() : ''}
          {/*
            **Last of the three, because it is the least urgent of them.** The
            suffixes read as a sentence and the order is what ranks them: a
            closed microphone and a running claim are both things somebody
            reading this roster may need to act on within the minute, and
            having the film up is a standing state that will still be true in
            ten. It is also the only one of the three that can be true of
            somebody who is not in the room at all — a second device is a
            screen without a voice — so putting it first would open every such
            line with the fact that matters least about them.
          */}
          {watching ? t.watching() : ''}
        </Text>
      </View>
      {/*
        The clock, between the name and the rail rather than in place of
        either. The dot beside it still answers a different question — the
        floor says whose minute it is, the dot says whether they are using it,
        and a holder who has gone quiet is worth being able to see.

        Two of them, never at once: a claim is running or it is not, and
        `cooldownRemainingMs` returns null for as long as one is. The claim's
        is full weight on a tinted card and the cooldown's is muted on a plain
        one, which is the difference between a minute somebody has and a wait
        you are serving.

        The cooldown's says "wait" in front of the number, since weight and
        colour are the only other thing distinguishing the two and a card seen
        on its own carries neither comparison. A bare "10s" beside your own
        name reads as time you have; "wait 10s" reads as time you owe.
      */}
      {floorRemaining !== null ? (
        <Text style={styles.cardClock}>{formatSeconds(floorRemaining)}</Text>
      ) : cooldown !== null ? (
        <Text style={[styles.cardClock, styles.cardClockMuted]}>
          {t.waitFor(formatSeconds(cooldown))}
        </Text>
      ) : null}
      {/*
        One rail, holding whichever of the three `rail` chose — which is where
        the reasoning is, this being the shape of it rather than the rule.

        The ping is offered only while they are out of reach and recently so:
        somebody who stepped out an hour ago is a different act, open their
        profile and say something, and a button on every absent card would
        make the roster a row of buttons rather than a picture of the room.

        The dot is the dynamic part, and the only thing on this screen that
        changes several times a second: filled while they are audible, hollow
        otherwise, always in the same place so a card does not reflow every
        time somebody draws breath.
      */}
      {rail === 'ping' ? (
        <Button
          label={pinging ? t.pinging() : windowOpen ? t.pinged() : t.ping()}
          style={styles.cardPing}
          // Disabled rather than hidden inside the window. The button
          // vanishing at the moment it is pressed reads as a mistake; saying
          // "Pinged" and refusing a second one says what happened.
          disabled={pinging || windowOpen || !pingable}
          onPress={() => {
            void sendPing();
          }}
        />
      ) : rail === 'nothing' ? null : (
        <View
          style={[styles.speakingDot, speaking && styles.speakingDotLive]}
          accessibilityElementsHidden
        />
      )}
    </View>
  );

  /**
   * No seconds in it, deliberately. The clock beside the name ticks once a
   * second and a label carrying it would have a screen reader announce the
   * card afresh every time — the fact worth saying is whose the floor is, and
   * that does not change while the number does.
   */
  const label = t.participantLabel(
    participant.displayName,
    self,
    status,
    holdsFloor,
    watching,
    speaking,
    !!onPress
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.participantCard,
          holdsFloor && styles.participantCardFloor,
          speaking && styles.participantCardLive,
        ]}
        accessibilityLabel={label}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.participantCard,
        holdsFloor && styles.participantCardFloor,
        speaking && styles.participantCardLive,
        pressed && styles.participantCardPressed,
      ]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Who can be asked in: accepted contacts of *this user* who are not already in
 * the channel. **One mark each, and two offers behind it** — `Member` writes
 * them into the roster and spends one of the six; `Guest` opens the room to
 * them for as long as it lasts and spends one of the forty. Both were buttons
 * on the row until 2026-09-22; `InviteMark` has the account of why they are
 * one mark and a prompt now. The guards are unchanged and are the ones the
 * server enforces, so a shown offer and a refused action cannot disagree —
 * except on contacts, which are the server's check; the list only offers
 * contacts, so the two disagree only if a contact was dropped mid-channel.
 *
 * **`canInvite` is asked about the contact, not about the room.** It carries
 * `hasTheRoom` too, so filtering on it whole would empty this list for
 * somebody standing outside an occupied channel — and an empty list here says
 * "every contact you could invite is already in this channel", which would be
 * false and unrecoverable, there being nothing left on screen to explain
 * itself. So the room half arrives as `mayInvite` and disables the mark, and
 * the list still shows who is there to be asked.
 *
 * **A full membership no longer empties this list**, which is the change of
 * 2026-09-22 and the reason the cap moved from a `return` to a line. Six
 * members is exactly the room that wants a guest, and a list replaced by
 * *Channels hold up to 6 people* offered no way to ask anybody anything. The
 * cap now takes `Member` out of the prompt and says why there, and the guest
 * half stands.
 */
export function InviteList({
  channel,
  me,
  mayInvite,
  states,
  onInvite,
  onGuest,
}: {
  channel: ReturnType<typeof useApp>['channelViews'][string]['channel'];
  me: string;
  mayInvite: boolean;
  /** Per contact: `'asking'`, `'asked'`, or the sentence the server refused with. */
  states: Record<string, 'asking' | 'asked' | string>;
  onInvite: (contactId: string) => void;
  onGuest: (contactId: string) => void;
}) {
  const t = useText().channelCards;
  const app = useApp();
  const invitable = (app.home?.contacts ?? []).filter(
    (entry) =>
      entry.status === 'accepted' &&
      !channel.participants.includes(entry.account.id)
  );
  const full = channel.participants.length >= MAX_CHANNEL_PARTICIPANTS;
  /**
   * The accounts already sitting in this room as guests.
   *
   * A seat the server would refuse a second time — *They already have a seat
   * here* — so the row says what is true instead of offering a button that
   * cannot work. It is only the guests *in the room*: a dormant seat and an
   * invitation nobody has taken up are `guest_sessions` rows that no
   * `ChannelState` carries, so those two refusals still arrive from the
   * server and are shown as they land.
   */
  const seated = new Set(
    Object.values(channel.guests ?? {})
      .map((guest) => guest.accountId)
      .filter((id): id is string => !!id)
  );

  /**
   * Whose offer is open, of the at most one that may be.
   *
   * **One at a time, which the alert got for free and this has to choose.**
   * Two expanded rows would put two copies of the same two sentences on the
   * screen a thumb's width apart, and each is the same question asked about a
   * different person — so opening one closes the other, the way a prompt
   * replaces a prompt.
   */
  const [open, setOpen] = React.useState<string | null>(null);

  if (invitable.length === 0) {
    return (
      <Text style={type.muted}>
        Every contact you could invite is already in this channel.
      </Text>
    );
  }
  return (
    <>
      {invitable.map((entry) => {
        const state = states[entry.account.id];
        const refusal =
          state && state !== 'asking' && state !== 'asked' ? state : null;
        // The three states that are facts rather than offers. A row in any of
        // them draws no mark, so it cannot be the open one either — and the
        // guard is read here rather than at the mark because the expansion
        // below rests on the same fact.
        const quiet =
          seated.has(entry.account.id) ||
          state === 'asked' ||
          state === 'asking';
        return (
          <View key={entry.account.id}>
            <View style={styles.inviteRow}>
              {quiet ? (
                // The mark's place, kept empty. A row whose offer has been
                // taken up is still a row in the same list, and a name that
                // slid left when the mark went would leave the column of
                // names ragged for a reason that is about one of them.
                <View style={styles.inviteMarkGap} />
              ) : (
                <InviteMark
                  name={entry.account.displayName}
                  disabled={!mayInvite}
                  open={open === entry.account.id}
                  onPress={() =>
                    setOpen((prior) =>
                      prior === entry.account.id ? null : entry.account.id
                    )
                  }
                />
              )}
              <Text style={[type.body, styles.inviteName]} numberOfLines={1}>
                {entry.account.displayName}
              </Text>
              {seated.has(entry.account.id) ? (
                <Text style={type.muted}>In the room as a guest</Text>
              ) : state === 'asked' ? (
                // **The row goes quiet rather than offering the same mark
                // again.** A second tap is refused by the server — they have
                // a seat now — and an offer that has been made is not a
                // control, it is a fact. The membership goes with it: what is
                // outstanding is one question about one room, and asking the
                // larger one on top of it is a thing to do from the roster
                // once they are in.
                <Text style={type.muted}>Asked in as a guest</Text>
              ) : state === 'asking' ? (
                <Text style={type.muted}>Asking…</Text>
              ) : null}
            </View>
            {!quiet && open === entry.account.id ? (
              <InviteOffer
                full={full}
                mayBeMember={canInvite(channel, me, entry.account.id)}
                onGuest={() => {
                  setOpen(null);
                  onGuest(entry.account.id);
                }}
                onMember={() => {
                  setOpen(null);
                  onInvite(entry.account.id);
                }}
              />
            ) : null}
            {refusal ? <Text style={styles.warning}>{refusal}</Text> : null}
          </View>
        );
      })}
      <Text style={type.muted}>
        {!mayInvite
          ? t.stepInToAskAnybodyIn()
          : full
            ? t.memberOrGuestFull(MAX_CHANNEL_PARTICIPANTS)
            : t.memberOrGuest()}
      </Text>
    </>
  );
}

/**
 * One contact's way in: a `+` mark, and the question of what kind is asked
 * when it is pressed.
 *
 * **It was two buttons until 2026-09-22, `Guest` and `Member` on every row.**
 * They said the truth — that these are two different acts — but they said it
 * once per contact, so a list of eight people was sixteen buttons and two
 * columns of repeated words wider than the names beside them. The mark is the
 * row's whole offer, and the fork arrives at the moment somebody has already
 * decided they want this person in.
 *
 * **Which is not the mode-before-acting shape that was rejected when the
 * contact picker came out.** That was a control you set and then used, so the
 * setting was a thing to get wrong before anything happened; this asks after
 * the press and answers with the act itself. What the two buttons carried in
 * their labels is carried by the offer's own sentence, which has room to say
 * more than a button's word ever did.
 *
 * **The fork was an `Alert` for a few hours of the same day and is now drawn
 * in the row.** An alert is the OS's window over the application, and what it
 * was covering is the list the choice is about — the name it names is behind
 * it, and so is every other contact. Expanding in place leaves all of that on
 * screen, which is what makes the second tap a continuation of the first
 * rather than an answer to a box. It also buys back what the alert could not
 * hold: `Member` may now be drawn and refused rather than simply absent, and
 * `Guest` may be the filled one. See `InviteOffer`.
 *
 * **The mark is on the left of the name since 2026-09-22**, where it sat on
 * the right beside the two buttons it replaced. On the right it was the last
 * thing in a row it is the whole offer of, and it read as a trailing
 * accessory to the name; on the left it is *Add a contact*'s row exactly —
 * mark, then who — which is the same promise drawn the same way, and the
 * shape the expansion under it already had.
 *
 * `+` and not a person-with-a-plus: the mark is the one on *Add a contact*,
 * deliberately, that being the same promise — somebody who is not here yet is
 * about to be. It is the row's only control, so it takes the row's name as
 * its accessible label; a list of eight identically named *Invite* buttons is
 * one nobody can navigate, which is the rule the introduction's crosses
 * follow. See planning/STYLE.md § *Icons*.
 */
function InviteMark({
  name,
  disabled,
  open,
  onPress,
}: {
  name: string;
  /** The room refuses both offers — nobody outside it asks anybody in. */
  disabled: boolean;
  /** This row's offer is the one showing, so the mark is what closes it. */
  open: boolean;
  onPress: () => void;
}) {
  const t = useText().channelCards;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.invite(name)}
      // `expanded` rather than `selected`: what the mark holds open is a pair
      // of choices about this person, not a state of theirs. A screen reader
      // then says the control opened something and that it is open, which is
      // the whole of what changed on the row.
      accessibilityState={{ disabled, expanded: open }}
      disabled={disabled}
      // The disc is 28 and a target is 44, and the row is too tight to pad it
      // out: the slop is the difference, so the thumb gets the target the
      // drawing does not.
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inviteMark,
        disabled && styles.inviteMarkOff,
        pressed && styles.inviteMarkPressed,
      ]}
    >
      {/*
        The same mark turned through an eighth of a turn when it is holding
        something open, which is a `×` drawn by the glyph that is already
        there rather than a second glyph swapped in. What it says is *this is
        the thing you pressed*, and the way back is the way in — a separate
        Cancel among the choices would be a third control for the one act the
        mark is already doing.
      */}
      <Text
        style={[
          styles.inviteMarkGlyph,
          open && styles.inviteMarkGlyphOpen,
          disabled && styles.inviteMarkGlyphOff,
        ]}
      >
        +
      </Text>
    </Pressable>
  );
}

/**
 * The fork, under the row it belongs to: what the two ways in mean, and a
 * button for each.
 *
 * **`Guest` is `primary` and `Member` is not**, which is the one place this
 * screen spends that fill — and it is spent on a default rather than on a
 * commitment, which is a departure from planning/STYLE.md § *Button* worth
 * saying out loud. The reason is that the two acts are not equals: a guest is
 * here for this conversation and the seat ends with the room, where a member
 * is written into a roster of six for good. The reversible one is the one to
 * lead with, and a pair of identical buttons makes somebody read two
 * sentences to discover which of two permanent-looking things they are about
 * to do. It is still one filled button per screen — the fork is open for one
 * contact at a time, by construction.
 *
 * **`Member` is drawn and refused when the roster is full**, where the alert
 * this replaced had to leave it out: there is no greying a button inside an
 * alert, so the absent half had to be accounted for in a sentence. Grey is
 * this interface's word for refused, and a full channel is exactly that — so
 * the button says what is not on offer better than its absence did, and the
 * sentence says why.
 */
function InviteOffer({
  full,
  mayBeMember,
  onGuest,
  onMember,
}: {
  /** The membership is spent, which is a thing to say rather than to imply. */
  full: boolean;
  mayBeMember: boolean;
  onGuest: () => void;
  onMember: () => void;
}) {
  const t = useText().channelCards;
  return (
    <View style={styles.inviteOffer}>
      {/*
        The pair of sentences the list's footer carries, said again where the
        choice actually is — and it is the same text deliberately, so that
        reading it twice teaches one distinction rather than leaving somebody
        to work out whether two wordings mean two things.
      */}
      <Text style={type.muted}>
        {mayBeMember
          ? t.memberOrGuest()
          : full
            ? t.guestOnlyFull(MAX_CHANNEL_PARTICIPANTS)
            : t.guestOnly()}
      </Text>
      <View style={styles.buttonRow}>
        <Button
          label={t.guest()}
          variant="primary"
          style={styles.flexButton}
          onPress={onGuest}
        />
        <Button
          label={t.member()}
          disabled={!mayBeMember}
          style={styles.flexButton}
          onPress={onMember}
        />
      </View>
    </View>
  );
}

/**
 * Plain-language audio state when there is something wrong with it, and null
 * when there is not.
 *
 * **Null is the whole of the change of 2026-09-15.** This used to describe
 * every state including the healthy ones, on a card headed *Your microphone*
 * that was drawn whenever you were present. Three of the healthy sentences
 * were the footer and the roster said again, and the fourth — audio connected,
 * microphone closed until somebody else is here — was an explanation of a
 * control rather than a report on the transport. What is left is the half
 * nothing else on the screen can say: the conversation is not arriving, or
 * never started, or was refused.
 *
 * So the ordinary moment in a channel draws no card at all, which is the
 * property to preserve if a state is ever added here. **A new case returns a
 * sentence only if a person who is not debugging this application would want
 * to know it**; anything else belongs in the diagnostics panel, which has its
 * own card and its own audience.
 */
export function describeAudio(
  audio: SessionAudio,
  t: Strings['channelCards']
): string | null {
  switch (audio.status) {
    case 'idle':
      return t.audioNotConnected();
    case 'connecting':
      return t.connectingAudio();
    // Distinct from 'idle' on purpose. Both used to read as "not connected",
    // so audio that had died mid-conversation looked exactly like audio that
    // had never started — and since the only recovery was force-quitting, the
    // screen was quietly wrong about the one thing it is here to report.
    case 'reconnecting':
      return t.audioDropped();
    // Not a failure and not a quiet channel, which is why it is neither of the
    // two above. The room is fine and somebody is in it; it is just not this
    // screen. `elsewhereOnAnotherDevice` says the same thing about presence,
    // and this says it about the audio.
    case 'displaced':
      return t.audioMovedToOtherDevice();
    // Nothing to say. The three sentences this used to pick between reported
    // a working connection, whether anybody else was audible, and whether the
    // microphone was open — the first needs no saying, and the other two are
    // the roster and the footer's job. See the note above.
    case 'connected':
      return null;
    case 'denied':
      return audio.message ?? t.microphoneRefused();
    case 'unavailable':
      return t.audioNotConfigured();
    case 'error':
      return t.audioFailed(audio.message ?? null);
  }
}

/**
 * The browser is refusing to let this page make sound.
 *
 * **The button is the whole point and cannot be replaced by a retry.** A page
 * nobody has interacted with may be denied playback, and what lifts the denial
 * is a real gesture — so this is the one card in the app whose control exists
 * to be pressed rather than to do anything, and pressing it is the act. See
 * `SessionAudio.allowPlayback`.
 *
 * `primary`, which the screen otherwise spends on nothing: while this is up
 * the channel is inaudible, and there is exactly one thing to do about it.
 * It is never drawn beside another commitment, since the card is not drawn at
 * all unless the browser has said no.
 */
export function PlaybackBlocked({ onAllow }: { onAllow: () => void }) {
  const t = useText().channelCards;
  return (
    <>
      <Text style={type.body}>
        <Text style={styles.emphasis}>{t.playbackBlockedLead()}</Text>
        {t.playbackBlockedRest()}
      </Text>
      <Button label={t.playTheChannel()} variant="primary" onPress={onAllow} />
    </>
  );
}

/**
 * The microphone was granted and appears to be carrying nothing.
 *
 * **A question rather than a verdict**, which is why it says what was observed
 * and not that the microphone is broken: somebody in a quiet room with noise
 * suppression on reads exactly the same way. `core/capture.ts` carries the
 * measurement and the reasoning.
 *
 * No control. The cure is to open the app in a real browser, which is not
 * something a button here can do — the sibling notice on `AuthView` is the one
 * that can, because there the link is all there is, and by the time somebody
 * is standing in a channel a copied link costs them the room. Stepping out and
 * back in publishes a fresh microphone, which is what takes the reading again.
 */
export function MicrophoneSilent() {
  const t = useText().channelCards;
  return (
    <Text style={type.body}>
      <Text style={styles.emphasis}>{t.microphoneSilentLead()}</Text>
      {t.microphoneSilentRest()}
    </Text>
  );
}

export function audioTone(status: string) {
  // Reconnecting is coloured with the failures rather than the quiet states:
  // it is a conversation that has stopped working, and it earns a glance.
  return status === 'denied' || status === 'error' || status === 'reconnecting'
    ? styles.audioBad
    : styles.audioMuted;
}

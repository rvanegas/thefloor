import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import type { Step, StepId } from '../state/introduction';
import type { ChannelTab } from './ChannelView';
import { Button, Card, IconButton } from './components';
import type { List } from './detail';
import { CloseIcon } from './icons';
import { colors, spacing, type } from './theme';

/**
 * What a new account sees above the two lists, until it has finished with it.
 *
 * **Until the last rung, not until the first conversation**, since
 * 2026-09-13: four of the rungs are things done inside a channel, so the card
 * has to survive the conversation to be any use at all. It is still drawn
 * nothing-at-all *during* one. See `state/introduction.ts`.
 *
 * **One rung in full, the finished ones in a line each, the rest behind *See
 * more*.** Seven rungs each carrying an instruction, a note and a button is a
 * wall above the lists, and it grew into one a rung at a time — the objection
 * was already on the record about buttons alone. What a card read on the way
 * past is for is the next thing to do; what is behind you is worth a line, and
 * what is after the next thing is worth knowing exists. Which rung is which
 * is `state/introduction.ts`' answer, not this file's — this decides only how
 * much of each is drawn.
 *
 * **Every row carries its own way out**, since 2026-09-13. The cross is the
 * app's *Close* — `icons.tsx` — and it does here what it does in a header:
 * says *not this*, about the one row it sits on. What it is for is the rung
 * somebody has read and decided against rather than not got to yet, which is
 * a state the ladder previously had no way to express: a browser nobody will
 * install to, a guest link for somebody with no guests. The policy is
 * `state/introduction.ts` as ever — this draws the control and says which
 * rung was pressed.
 *
 * **A body, not an overlay**, which is the one decision here that was made
 * against the convention rather than with it. The pattern is usually a modal
 * that covers the app on first launch; this codebase contains no `Modal` at
 * all, `Screen` documents its header and footer as siblings of the scroll
 * rather than things laid over it, and the profile moved out of `ContactsView`
 * on the grounds that a list "is a body now and cannot cover anything". A card
 * at the top of the scroll takes its own height and hides nothing. See
 * planning/ONBOARDING.md.
 *
 * **In the tier rather than in either list**, for the reason `HomeView` gives
 * about the live bar: this spans getting somebody here and opening a channel,
 * so it belongs to whatever contains both lists. It is also what keeps it
 * still while somebody flips between them.
 *
 * **One shape, since 2026-09-13, and there were two.** An invited account got
 * a single card saying the one thing left, on the argument that its other
 * rungs were born ticked; `contactsBase` ended the born ticking and the card
 * with it — `state/introduction.ts`. What went with the card is the only
 * control in this feature that opened a channel rather than a list, which
 * `actionFor` below rules out for every rung and says why.
 *
 * The policy — what is done, and when all of it stops — is
 * `state/introduction.ts`. Nothing here decides anything.
 */
export function Introduction({
  onList,
  live = null,
  onOpenChannel = () => {},
}: {
  /**
   * Switches the list below, which is where a rung is climbed by somebody
   * who is not in a channel.
   *
   * It was the only handler the ladder needed for a day: the two rows that
   * went to a profile went with the rungs that asked for a name and a
   * username, and the four rungs done inside a channel all named the channel
   * list. The pair below is what ended that — a list is the way to a channel,
   * and somebody already in one does not need the way to it.
   */
  onList: (list: List) => void;
  /**
   * The channel this person is standing in right now, or null.
   *
   * **It is what the four *try* rungs point at when there is one.** Every one
   * of them is done inside a channel, and with no channel to name there is
   * nowhere to send somebody but the list — see `actionFor`. Handed down
   * rather than read here, because Home already holds it for the live bar and
   * two readings of presence on one screen is one too many.
   */
  live?: string | null;
  /**
   * Opens that channel's screen, on the tab the rung is about.
   *
   * Defaulted to nothing so this card still draws where there is nowhere to
   * route to, the same way `ProfileView`'s `onEnterChannel` is.
   */
  onOpenChannel?: (channelId: string, tab: ChannelTab) => void;
}) {
  const { introduction, installPrompt, dismissStep } = useApp();
  /**
   * Whether the rungs after the next one are showing.
   *
   * Shut on every mount, deliberately, rather than remembered: the card is
   * read on the way past and the thing it is trying to say is *the next one
   * is this*. A disclosure that stayed open would put the wall back a day
   * later, on a screen somebody opened to do something else.
   *
   * Here rather than beside the list it governs, because hooks may not sit
   * behind the two returns below.
   */
  const [expanded, setExpanded] = useState(false);

  if (introduction.show === 'none') return null;

  const { steps } = introduction;
  /**
   * The one rung drawn in full: the first thing left to do.
   *
   * **One at a time, since 2026-09-13.** Every rung used to carry its
   * instruction, its note and its button, which for a fresh account is seven
   * of those stacked above the lists — a wall rather than a ladder, which is
   * the objection the four-rung version already raised against giving every
   * rung a control and which four more rungs made true of the prose as well.
   * What somebody needs on the way past is the next thing, and the shape of
   * what is coming.
   */
  const next = steps.find((step) => !step.done) ?? null;
  /**
   * The rungs that are neither done nor next, which are the ones worth hiding.
   * A done rung is never hidden: it is one line, and it is the half of this
   * card that says somebody is getting somewhere.
   */
  const later = steps.filter((step) => !step.done && step !== next);

  return (
    <Card style={styles.card}>
      <Text style={type.body}>Getting started</Text>
      {steps.map((step) => {
        // Three ways to draw a rung, and which one is about what the rung is
        // rather than where it sits: a done one says so in a line, the next
        // one says everything, and the ones after it wait behind the control
        // below. They keep their own order throughout — a card that
        // reshuffled itself as things were ticked would be a different card
        // every time somebody read it.
        if (step.done)
          return (
            <Row key={step.id} step={step} brief onDismiss={dismissStep} />
          );
        if (step !== next && !expanded) return null;
        return (
          <Row
            key={step.id}
            step={step}
            action={actionFor(step, onList, installPrompt, live, onOpenChannel)}
            onDismiss={dismissStep}
          />
        );
      })}
      {/*
        Nothing to disclose when there is nothing waiting, which is the state
        every account ends in — and one rung short of retirement this control
        would be offering to expand an empty list.
      */}
      {later.length > 0 ? (
        <View style={styles.actions}>
          <Button
            label={expanded ? 'See less' : 'See more'}
            variant="ghost"
            onPress={() => setExpanded((open) => !open)}
          />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Where a rung sends somebody.
 *
 * **Every rung that is drawn in full carries one**, which is the whole of the
 * four-rung ladder's rule arrived at from the other end. That one gave a
 * control to the next unfinished rung alone, on the grounds that four calls to
 * action stacked above a list is a wall; this gives one to every rung and then
 * draws one rung. The rule the wall argument was really making is that a card
 * should ask for one thing at a time, and the caller enforces it.
 *
 * A rung that is drawn in full is one somebody is being asked to do, and a row
 * that names a place without going there makes them hunt for a tab whose name
 * they have not learned yet — which is why the *See more* rungs keep their
 * buttons too.
 *
 * Both go to a list rather than into anything. That is as far as this card is
 * allowed to reach: starting a channel or sending an invite is a decision with
 * a screen of its own, and the button's job is to put that screen in front of
 * somebody, not to press it for them. A tap while that list is already showing
 * is a no-op, which is the honest cost of the rule and cheaper than a control
 * that appears and disappears as somebody flips between the two.
 *
 * **Except that a channel you are already in is not a place you are being
 * taken**, which is the change of 2026-09-13 and the one exception to the
 * paragraph above. The four *try* rungs are done inside a channel, and while
 * somebody is standing in one the list is not the destination — it is a step
 * on the way to the room they are already in, with the row they are already
 * on. So when `live` names a channel those rungs open it, on the tab the rung
 * is about: the roster for the two controls in the bar along the bottom, the
 * Invite tab for the guest link, the Player tab for the audio.
 *
 * The rule it does not break is the one that matters: nothing here claims a
 * floor, mints a link or plays anything. It opens the screen the control is
 * on and stops, exactly as *Open Contacts* does. And it reaches a channel
 * only when the person is in it already — the card will not step anybody into
 * one, which is what the invited card's *Step in* did and what
 * `state/introduction.ts` records the removal of.
 */
function actionFor(
  step: Step,
  onList: (list: List) => void,
  installPrompt: (() => void) | null,
  /** The channel being stood in, or null — see the prop of the same name. */
  live: string | null,
  onOpenChannel: (channelId: string, tab: ChannelTab) => void
): { label: string; onPress: () => void } | null {
  /**
   * Into the room, on the tab the rung names — or the list, when there is no
   * room to go into.
   *
   * The label is the destination as the app labels it, which is the pattern
   * *Open Contacts* and *Open Channels* set: the tab bar at the top of that
   * screen says *Invite* and *Player*, so the button says the word somebody
   * will be looking at a moment later. The roster is not named, because the
   * two rungs that land there are about controls in the bar along the bottom
   * rather than about the tab.
   */
  const inChannel = (
    tab: ChannelTab,
    label: string
  ): { label: string; onPress: () => void } =>
    live
      ? { label, onPress: () => onOpenChannel(live, tab) }
      : { label: 'Open Channels', onPress: () => onList('channels') };

  switch (step.id) {
    case 'somebody':
      return { label: 'Open Contacts', onPress: () => onList('contacts') };
    // **Channels even while standing in one**, deliberately, and it is the
    // one rung where being in a channel does not change the answer. What it
    // asks for is somebody else in the room with you; the half of it this
    // person has not done is not in the channel screen at all, and the list
    // is where a channel with the right person in it gets started. Sending
    // them into the room they are already alone in would be a control that
    // moves nothing.
    case 'stepIn':
      return { label: 'Open Channels', onPress: () => onList('channels') };
    // **The one rung that may have no button, and usually has none.** Most
    // browsers keep installing in their own chrome and will not let a page
    // raise it; there the instruction is the whole row, and a button that
    // opened something else would be worse than the sentence alone. Where one
    // was volunteered — `state/useInstall.web.ts` — it does the deed here,
    // which is the only control in this card that does rather than navigates.
    case 'install':
      return installPrompt
        ? { label: 'Install', onPress: installPrompt }
        : null;
    // **All four go to Channels when there is no channel to go to**, and the
    // repetition is the honest answer: every one of them is done inside a
    // channel, so with nowhere in particular to send somebody no amount of
    // varying the word changes where the tap lands. The row's own instruction
    // names the tab or the slot once they are there.
    //
    // With a channel being stood in they go there instead — see `inChannel`
    // above, and the note on this function about why that is not the card
    // reaching past a list. A rung that opened the Player tab of a channel
    // somebody was *not* in would be promising something the app would then
    // refuse; this opens the one they are in.
    //
    // The two below land on the roster because that is where the bar along
    // the bottom is, which is where Claim and Nearby live. They are not on a
    // tab of their own and there is nothing nearer to send somebody to.
    case 'floor':
    case 'nearby':
      return inChannel('roster', 'Open the channel');
    case 'guest':
      return inChannel('invites', 'Open Invite');
    case 'player':
      return inChannel('player', 'Open Player');
  }
}

/**
 * One rung: a disc, what it is, and — unless it is behind somebody — why.
 *
 * **The disc is the live bar's, one screen over** — filled for done, hollow
 * for not — rather than a tick, which this app has no icon for and would have
 * had to invent. It carries nothing to a screen reader, which is why the row
 * says the state in words instead.
 */
function Row({
  step,
  action = null,
  brief = false,
  onDismiss,
}: {
  step: Step;
  action?: { label: string; onPress: () => void } | null;
  /**
   * Puts this rung away. Carried by every row including the done ones, which
   * is the deliberate half: a finished rung is a line somebody may be tired of
   * reading, and a control offered on six rows out of seven would read as an
   * accident on the seventh.
   */
  onDismiss: (id: StepId) => void;
  /**
   * Draws the title alone — no instruction, no note, no button.
   *
   * **What a finished rung is worth**, and the reason it is not simply
   * dropped: the instruction tells somebody how to do a thing they have
   * already done, and the note argues for doing it. Neither is any use
   * afterwards, and the label still is — it is the line that says this is
   * behind you, and a ladder with its climbed rungs deleted would be a card
   * that shrank as somebody got further rather than one that filled in.
   */
  brief?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={
        brief
          ? `Done: ${step.label}.`
          : `${step.done ? 'Done' : 'Not done'}: ${step.label}. ${
              step.instruction
            } ${step.note}`
      }
      style={styles.row}
    >
      <View style={[styles.disc, !step.done && styles.discOpen]} />
      <View style={styles.rowMain}>
        <Text style={[type.body, step.done && styles.labelDone]}>
          {step.label}
        </Text>
        {/*
          The instruction above the note, and both above the button: what to
          do, then why it is worth doing, then the way there.
        */}
        {brief ? null : (
          <>
            <Text style={type.muted}>{step.instruction}</Text>
            <Text style={type.muted}>{step.note}</Text>
            {action ? (
              <View style={styles.actions}>
                <Button
                  label={action.label}
                  variant="ghost"
                  onPress={action.onPress}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
      <Dismiss step={step.id} label={step.label} onDismiss={onDismiss} />
    </View>
  );
}

/**
 * The way out of one row.
 *
 * **A cross rather than a word**, which is `CloseIcon`'s whole argument one
 * tier down: *not this* is what it has to say, the row beside it supplies the
 * *this*, and a second worded control next to the row's own button would make
 * somebody read two before doing either. The screen reader gets the word back,
 * with the rung's name in it — a card of seven rows each announcing *Dismiss*
 * is a card nobody can navigate.
 *
 * Outside the `accessible` group deliberately: that group collapses the row
 * into one announcement, and a control swallowed into it cannot be reached.
 */
function Dismiss({
  step,
  label,
  onDismiss,
}: {
  step: StepId;
  label: string;
  onDismiss: (id: StepId) => void;
}) {
  return (
    <IconButton
      label={`Dismiss ${label}`}
      icon={(color) => <CloseIcon color={color} size={16} />}
      onPress={() => onDismiss(step)}
      style={styles.dismiss}
    />
  );
}

const styles = StyleSheet.create({
  /** The install notice's spacing, this being its neighbour in the tier. */
  card: { gap: spacing(1), marginBottom: spacing(1.5) },
  actions: { flexDirection: 'row', justifyContent: 'flex-start' },
  row: { flexDirection: 'row', gap: spacing(1.5) },
  rowMain: { flex: 1, gap: 2 },
  disc: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: colors.floor,
  },
  discOpen: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.textFaint,
  },
  /**
   * Done is quieter, not struck through: these are things somebody has
   * achieved rather than items crossed off a shopping list, and one of them —
   * having a name — is a standing fact about them rather than a task.
   */
  labelDone: { color: colors.textMuted },
  /**
   * Pulled up and out to the row's own top-right, and stripped of the padding
   * `IconButton` carries for a header: this sits beside a line of text rather
   * than in a bar, and the default box would push the disc and the label apart
   * by more than the gap between two rungs.
   */
  dismiss: { padding: 0, marginTop: 2, marginLeft: spacing(1) },
});

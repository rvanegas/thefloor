import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import type { Step, StepId } from '../state/introduction';
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
 * The policy — which of the two cohorts this is, what is done, and when all of
 * it stops — is `state/introduction.ts`. Nothing here decides anything.
 */
export function Introduction({
  onEnterChannel,
  onList,
}: {
  onEnterChannel: (channelId: string) => void;
  /**
   * Switches the list below, which is where both rungs are climbed.
   *
   * The only handler the ladder needs since 2026-09-13: the two rows that
   * went to a profile went with the rungs that asked for a name and a
   * username.
   */
  onList: (list: List) => void;
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

  if (introduction.show === 'invited') {
    const { from, channelId, install } = introduction;
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            {/*
              One card and not two rows with one tick. Somebody who was
              invited arrives with a contact and a channel already — the
              ladder's first rung was climbed for them before they got here,
              and a list that opened by congratulating them on it would be
              theatre. The single thing left is the single thing said.

              **Both lines name the condition the card actually tests, which
              is not stepping in.** It is drawn until `conversedAt` is
              stamped, and that happens on the first frame this account is in
              a channel with somebody else in it — `AppProvider`'s
              `conversing`. Wording it as *you have not stepped in* promised a
              test the code does not run: somebody who stepped in alone, found
              an empty channel and stepped out again had done the thing the
              card named and was told they had not.
            */}
            <Text style={type.body}>
              {from ? `${from} invited you` : 'Nobody has heard you yet'}
            </Text>
            <Text style={type.muted}>
              Step in while somebody else is there — that is the moment people
              can hear you. Until then you are here and quiet, which is a fine
              thing to be, but nobody knows it.
            </Text>
          </View>
          {/*
            **Dismissing this dismisses `stepIn`**, which is the rung the card
            is a single-rung drawing of — see `state/introduction.ts`. It is
            the same act as putting that row away on the ladder, and recording
            it as anything else would let somebody dismiss the card and meet
            the row again the day they first conversed.
          */}
          <Dismiss
            step="stepIn"
            label="Step in with somebody"
            onDismiss={dismissStep}
          />
        </View>
        {channelId ? (
          <View style={styles.actions}>
            <Button
              label="Step in"
              variant="floor"
              onPress={() => onEnterChannel(channelId)}
            />
          </View>
        ) : null}
        {/*
          The one row that may join this card — see `Introduction` in
          `state/introduction.ts` for why it is not theatre the way a list of
          born-ticked rows would be. Below the button rather than above it: the
          conversation waiting for them is still the point, and this is the
          thing to do on the way back.
        */}
        {install ? (
          <Row
            step={install}
            action={actionFor(install, onList, installPrompt)}
            onDismiss={dismissStep}
          />
        ) : null}
      </Card>
    );
  }

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
            action={actionFor(step, onList, installPrompt)}
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
 */
function actionFor(
  step: Step,
  onList: (list: List) => void,
  installPrompt: (() => void) | null
): { label: string; onPress: () => void } | null {
  switch (step.id) {
    case 'somebody':
      return { label: 'Open Contacts', onPress: () => onList('contacts') };
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
    // **All four go to Channels, and the repetition is the honest answer.**
    // Every one of them is done inside a channel, so there is exactly one
    // place to send somebody and no amount of varying the word changes where
    // the tap lands. The row's own instruction names the tab or the slot once
    // they are there, which is the half that differs.
    //
    // This card is still not allowed to reach past a list — see above. It will
    // not step somebody into a channel to claim a floor for them, and a rung
    // that opened the Player tab of a channel they were not in would be
    // promising something the app would then refuse.
    case 'floor':
    case 'nearby':
    case 'guest':
    case 'player':
      return { label: 'Open Channels', onPress: () => onList('channels') };
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

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import type { Step } from '../state/introduction';
import { Button, Card } from './components';
import type { List } from './detail';
import { colors, spacing, type } from './theme';

/**
 * What a new account sees above the two lists, until it has had a
 * conversation.
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
  const { introduction, installPrompt } = useApp();

  if (introduction.show === 'none') return null;

  if (introduction.show === 'invited') {
    const { from, channelId, install } = introduction;
    return (
      <Card style={styles.card}>
        <View style={styles.main}>
          {/*
            One card and not two rows with one tick. Somebody who was invited
            arrives with a contact and a channel already — the ladder's first
            rung was climbed for them before they got here, and a list that
            opened by congratulating them on it would be theatre. The single
            thing left is the single thing said.
          */}
          <Text style={type.body}>
            {from ? `${from} invited you` : 'You have not stepped in yet'}
          </Text>
          <Text style={type.muted}>
            Stepping in is the moment people can hear you. Until then you are
            here and quiet, which is a fine thing to be — but nobody knows it.
          </Text>
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
          <Row step={install} action={actionFor(install, onList, installPrompt)} />
        ) : null}
      </Card>
    );
  }

  const { steps } = introduction;

  return (
    <Card style={styles.card}>
      <Text style={type.body}>Getting started</Text>
      {steps.map((step) => (
        <Row
          key={step.id}
          step={step}
          action={actionFor(step, onList, installPrompt)}
        />
      ))}
    </Card>
  );
}

/**
 * Where a rung sends somebody.
 *
 * **Every rung carries one, since 2026-09-13**, which reverses what the four-
 * rung ladder did: that one gave a control to the next unfinished rung alone,
 * on the grounds that four calls to action stacked above a list is a wall
 * rather than a ladder. With two rungs there is no wall to build, and the
 * argument the other way is stronger — both of these are done somewhere else
 * in the app, and a row that names a place without going there makes somebody
 * hunt for a tab they have not learned the names of yet.
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
  }
}

/**
 * One rung: a disc, what it is, and why.
 *
 * **The disc is the live bar's, one screen over** — filled for done, hollow
 * for not — rather than a tick, which this app has no icon for and would have
 * had to invent. It carries nothing to a screen reader, which is why the row
 * says the state in words instead.
 */
function Row({
  step,
  action,
}: {
  step: Step;
  action: { label: string; onPress: () => void } | null;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${step.done ? 'Done' : 'Not done'}: ${step.label}. ${
        step.instruction
      } ${step.note}`}
      style={styles.row}
    >
      <View style={[styles.disc, !step.done && styles.discOpen]} />
      <View style={styles.rowMain}>
        <Text style={[type.body, step.done && styles.labelDone]}>
          {step.label}
        </Text>
        {/*
          The instruction above the note, and both above the button: what to
          do, then why it is worth doing, then the way there. A done rung keeps
          all three — it is two rows, the second is the one that matters, and
          hiding half of the first would make the card change shape under
          somebody who had just finished it.
        */}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The install notice's spacing, this being its neighbour in the tier. */
  card: { gap: spacing(1), marginBottom: spacing(1.5) },
  main: { gap: 2 },
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
});

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
  onOpenProfile,
  onList,
}: {
  onEnterChannel: (channelId: string) => void;
  /** Their own profile, already editing — the way to a name and a username. */
  onOpenProfile: (contact: { id: string; name: string; edit?: boolean }) => void;
  /** Switches the list below, which is where getting somebody here happens. */
  onList: (list: List) => void;
}) {
  const { introduction, me } = useApp();

  if (introduction.show === 'none') return null;

  const editMe = () =>
    me && onOpenProfile({ id: me.id, name: me.displayName, edit: true });

  if (introduction.show === 'invited') {
    const { from, channelId } = introduction;
    return (
      <Card style={styles.card}>
        <View style={styles.main}>
          {/*
            One card and not four rows with three ticks. Somebody who was
            invited arrives with a contact and a channel already — the ladder's
            first two rungs were climbed for them before they got here, and a
            list that opened by congratulating them on it would be theatre. The
            single thing left is the single thing said.
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
      </Card>
    );
  }

  const { steps } = introduction;
  /**
   * The next rung, and the only one that carries a control.
   *
   * A button on every unfinished row would be four calls to action stacked
   * above a list somebody opened the app to read. A ladder has an order, and
   * saying which rung is next is most of what it is for.
   */
  const next = steps.find((step) => !step.done);

  return (
    <Card style={styles.card}>
      <Text style={type.body}>Getting started</Text>
      {steps.map((step) => (
        <Row
          key={step.id}
          step={step}
          action={
            step.id === next?.id ? actionFor(step, { editMe, onList }) : null
          }
        />
      ))}
    </Card>
  );
}

/**
 * Where a rung sends somebody, or null when it sends them nowhere.
 *
 * *Step in* is the null, deliberately: there is no channel to step into from
 * here, and the row directly below this card is the one that starts one. A
 * button that scrolled somebody four points down the screen they are already
 * looking at would be furniture pretending to be help.
 */
function actionFor(
  step: Step,
  handlers: { editMe: () => void; onList: (list: List) => void }
): { label: string; onPress: () => void } | null {
  switch (step.id) {
    case 'name':
      return { label: 'Add your name', onPress: handlers.editMe };
    // The same words the card in `ContactsView` uses for the same journey,
    // which is the one place a username can be chosen. Two labels for one
    // destination is how somebody comes to believe there are two.
    case 'username':
      return { label: 'Choose a Username', onPress: handlers.editMe };
    case 'somebody':
      return {
        label: 'Invite somebody',
        onPress: () => handlers.onList('contacts'),
      };
    case 'stepIn':
      return null;
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
        step.note
      }`}
      style={styles.row}
    >
      <View style={[styles.disc, !step.done && styles.discOpen]} />
      <View style={styles.rowMain}>
        <Text style={[type.body, step.done && styles.labelDone]}>
          {step.label}
        </Text>
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

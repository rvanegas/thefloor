import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GuestView } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { api } from '../api/http';
import { pasteText } from '../clipboard';
import { Button, Card, Field, Screen, SectionLabel } from './components';
import { colors, radius, spacing, type } from './theme';

/**
 * A channel this account holds a **seat** in, drawn in the app.
 *
 * **Its own screen and never `ChannelView` with things hidden**, which is the
 * whole shape of the guest design said once more in the client. A member's
 * screen is built out of `ChannelState` — the roster with its ids, the floor,
 * the recordings, the playback — and a seat is sent none of it. What arrives
 * is `GuestView`: what this place is called, who else is here by name, and
 * whether they can be heard. A screen that took either type and hid half of
 * itself would be one tap away from drawing the half it was never given, and
 * the information would already have left the building besides. See
 * `GuestView` in core/protocol.ts.
 *
 * **It exists because a seat used to be a browser**, and on a phone that meant
 * an alert saying *a guest joins in a browser; open the web address and sign
 * in*. Somebody with an account who was asked into a room by a contact was
 * pushed out of the application they were already holding, to sign in again
 * somewhere else, in order to hear a conversation that was happening now. The
 * seat is a room, and rooms are what this app is for.
 *
 * Anonymous seats stay in the browser and that is unchanged: the app boots
 * into a sign-in, and a seat with nobody behind it has nothing to sign in as.
 * See planning/decisions/2026-09-22-a-seat-rides-the-member-socket.md, and
 * GUEST-LADDER.md § *The app holds seats too* for the decision this executes.
 */

/**
 * Where a guest's microphone stands, in words.
 *
 * **The guest page's five sentences verbatim.** They are the same five states
 * of the same seat, and two wordings for one fact is how a person comes to
 * believe the phone and the laptop are telling them different things. See
 * `MIC_WORDS` in server/web/guest.ts; a change belongs in both or in neither.
 */
const MIC_WORDS: Record<GuestView['you']['mic'], string> = {
  listening: 'You are listening. Nobody can hear you.',
  asking: 'You have asked to speak. Waiting for somebody to answer.',
  refused: 'Somebody said no to the microphone for now.',
  open: 'Your microphone is on and the channel can hear you.',
  muted: 'Your microphone is on, and you have muted yourself.',
};

export function SeatView({
  view,
  onClose,
}: {
  view: GuestView;
  /**
   * Leaving the screen, which is not leaving the room — the same distinction
   * `ChannelView` draws. Stepping out is the footer's act and gives up the
   * seat's place in the conversation; this closes a screen, and the seat is
   * still there to come back to.
   */
  onClose: () => void;
}) {
  const app = useApp();
  const act = (action: Parameters<typeof app.actAsSeat>[1]) =>
    app.actAsSeat(view.channelId, action);

  /**
   * What the room calls them, while it is being changed.
   *
   * Seeded rather than bound, which is the guest page's rule for the same
   * field and for the same reason: a snapshot arrives on every change anybody
   * makes to the room, and retyping over somebody mid-edit is the one way a
   * field like this can be wrong. Null means *not editing*, so the row reads
   * the name off the view until somebody reaches for it.
   */
  const [rename, setRename] = React.useState<string | null>(null);
  /** What the last act was refused with, which is the seat's only report. */
  const [trouble, setTrouble] = React.useState<string | null>(null);
  /** Which asker's acceptance is out, so the pair of buttons can say so. */
  const [accepting, setAccepting] = React.useState<string | null>(null);

  // The two conditions the guest page's ask button reads, and they are the
  // same two: there is a microphone to ask for, and the room has one left.
  // `canAsk` is the server's own `canRequestSpeech`, so the control is absent
  // in exactly the case the reducer would refuse — a tap that does nothing is
  // the outcome worth engineering away.
  const wouldAsk = view.you.mic === 'listening' || view.you.mic === 'refused';
  const holding = view.you.mic === 'open' || view.you.mic === 'muted';

  return (
    <Screen
      header={
        <View style={styles.header}>
          <View style={styles.headerInner}>
            {/*
              **The standing is said out loud, above the name.** A member's
              header carries the channel and nothing else, because a member in
              a channel is the ordinary case and needs no label. A seat is
              not: what is on screen is a room somebody is a guest of, for as
              long as this conversation lasts, and every other thing the
              screen does or refuses follows from that. See GLOSSARY.md
              § *Seat*.
            */}
            <Text style={styles.headerKind}>Guest</Text>
            <Text style={styles.headerName} numberOfLines={1}>
              {view.channelName}
            </Text>
          </View>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <View style={styles.footerInner}>
            {/*
              Mute is drawn only while there is a microphone to mute, where
              the channel footer draws it always: a member always has one, and
              a guest has one only once somebody has said so. A control that
              was there and inert for most of a seat's life would be teaching
              the bar a word for a thing that mostly cannot happen.
            */}
            {holding ? (
              <Button
                label={view.you.mic === 'muted' ? 'Unmute' : 'Mute'}
                style={styles.flexButton}
                onPress={() =>
                  act({
                    type: 'SET_SELF_MUTE',
                    muted: view.you.mic !== 'muted',
                  })
                }
              />
            ) : null}
            {/*
              **Step out, and it is the seat's own word rather than *Leave*.**
              What it gives up is a place in this conversation, which is what
              stepping out means everywhere else in the application; a seat
              that has been stepped out of is still a seat, and Home offers
              the way back for as long as the room is there. See STATES.md.
            */}
            <Button
              label="Step out"
              style={styles.flexButton}
              onPress={() => {
                act({ type: 'STEP_OUT' });
                onClose();
              }}
            />
          </View>
        </View>
      }
      contentStyle={styles.container}
    >
      {/*
        The recording, first and unmissable. It is the one thing on this
        screen that is a promise about the world rather than about the
        interface, so it says so in words — and it is said continuously while
        it is true, which is half of what makes it consent rather than a
        surprise.
      */}
      {view.recording ? (
        <Card style={styles.recording}>
          <Text style={styles.recordingText}>
            This conversation is being recorded.
          </Text>
        </Card>
      ) : null}

      <SectionLabel>You</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.body}>{MIC_WORDS[view.you.mic]}</Text>
        {/*
          Being silenced by somebody else's claim, which is the floor's one
          remaining appearance here — a guest has not been able to claim it
          since 2026-08-30. Withholding it would be the failure the five
          sentences above exist to prevent: somebody talking into a room that
          is not listening.
        */}
        {view.you.silenced ? (
          <Text style={styles.warning}>
            Somebody has the floor, so the room cannot hear you just now.
          </Text>
        ) : null}
        {wouldAsk && view.you.canAsk ? (
          <Button
            label="Ask to speak"
            variant="primary"
            onPress={() => act({ type: 'REQUEST_SPEECH' })}
          />
        ) : null}
        {/*
          The two-guest ceiling, said only to somebody who would otherwise
          have a button. A guest already holding the microphone does not need
          telling that the room is full of them.
        */}
        {wouldAsk && !view.you.canAsk ? (
          <Text style={type.muted}>
            Two guests have the microphone already, which is as many as a room
            takes.
          </Text>
        ) : null}
      </Card>

      <SectionLabel>Who is here</SectionLabel>
      <Card style={styles.stack}>
        {view.others.length === 0 ? (
          <Text style={type.muted}>Nobody else is here.</Text>
        ) : (
          view.others.map((other, at) => (
            // Keyed by position, which is the one place in this app that is
            // right: a guest is given names and no ids, deliberately, so
            // there is nothing else to key on and two people may share a
            // name. The list is rebuilt from each snapshot whole.
            <View key={`${other.name}-${at}`} style={styles.personRow}>
              <Text style={[type.body, styles.personName]} numberOfLines={1}>
                {other.name}
              </Text>
              {other.kind === 'guest' ? (
                <Text style={type.muted}>Guest</Text>
              ) : null}
              <View
                style={[styles.dot, other.speaking && styles.dotLive]}
                accessibilityElementsHidden
              />
            </View>
          ))
        )}
      </Card>

      {/*
        The one question on this screen that is not addressed to the room.

        **Only the contact ask, and never the ask to make an account**: this
        seat has one, which is what makes it a seat in the app at all, and the
        server leaves `invites` empty for exactly that reason. See
        `GuestView.invites`.
      */}
      {view.asks.length > 0 ? (
        <>
          <SectionLabel>Asked of you</SectionLabel>
          {view.asks.map((ask) => (
            <Card key={ask.askerId} style={styles.stack}>
              <Text style={type.body}>
                {`${ask.from} would like to add you as a contact.`}
              </Text>
              <View style={styles.buttonRow}>
                <Button
                  label={accepting === ask.askerId ? 'Accepting…' : 'Accept'}
                  variant="primary"
                  disabled={accepting === ask.askerId}
                  style={styles.flexButton}
                  onPress={async () => {
                    if (!app.token) return;
                    setAccepting(ask.askerId);
                    setTrouble(null);
                    try {
                      await api.acceptSeatContactAsk(
                        app.token,
                        view.channelId,
                        ask.askerId
                      );
                    } catch (error) {
                      setTrouble(
                        error instanceof Error
                          ? error.message
                          : 'That did not work.'
                      );
                    } finally {
                      setAccepting(null);
                    }
                  }}
                />
                {/*
                  Kept rather than swallowed, which is `Guest.request`'s own
                  distinction: one is a question nobody has answered and the
                  other is a question that was answered no.
                */}
                <Button
                  label="No thanks"
                  style={styles.flexButton}
                  onPress={() =>
                    act({ type: 'REFUSE_CONTACT', askerId: ask.askerId })
                  }
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionLabel>Clipboard</SectionLabel>
      <Card style={styles.stack}>
        <Text style={view.clip ? type.body : type.muted}>
          {view.clip ? view.clip.text : 'Nothing on the clipboard.'}
        </Text>
        <View style={styles.buttonRow}>
          <Button
            label="Paste mine"
            style={styles.flexButton}
            onPress={async () => {
              const text = await pasteText();
              // Nothing to paste is nothing to say: an empty clipboard is not
              // a refusal, and clearing the channel's because this phone's was
              // empty would be answering a question nobody asked.
              if (!text) return;
              act({ type: 'PASTE_CLIP', text });
            }}
          />
          {view.clip ? (
            <Button
              label="Clear"
              style={styles.flexButton}
              onPress={() => act({ type: 'CLEAR_CLIP' })}
            />
          ) : null}
        </View>
      </Card>

      <SectionLabel>Your name here</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.muted}>
          What the room calls you while you are in it. It is this conversation
          only, and nothing about your account.
        </Text>
        <Field
          value={rename ?? view.you.name}
          onChangeText={setRename}
          placeholder="Your name"
          autoCapitalize="words"
          onSubmit={() => {
            const name = (rename ?? '').trim();
            if (name) act({ type: 'SET_GUEST_NAME', name });
            setRename(null);
          }}
          submitLabel="done"
        />
      </Card>

      {trouble ? <Text style={styles.warning}>{trouble}</Text> : null}

      {/*
        Closing the screen and keeping the seat, which the footer deliberately
        does not offer: the two acts read almost identically as a pair of
        buttons side by side, and only one of them is reversible. The way out
        that costs nothing is the quiet one at the bottom of the scroll; the
        way out that ends a conversation is pinned. See planning/STYLE.md
        § *The pinned footer*.
      */}
      <Button label="Back to Home" onPress={onClose} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing(1), paddingBottom: spacing(2) },
  stack: { gap: spacing(1) },
  buttonRow: { flexDirection: 'row', gap: spacing(1) },
  flexButton: { flex: 1 },
  /**
   * The two pinned bars, built the way every pinned bar in this app is: the
   * edge is full-bleed and the contents are capped. See planning/STYLE.md
   * § *The rules that are actually load-bearing*, rule 5.
   */
  header: {
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    gap: spacing(0.25),
  },
  /**
   * The standing, in the label's type rather than the name's. It is the
   * quieter half of the pair and has to stay so: what somebody looks for in a
   * header is which room they are in.
   */
  headerKind: { ...type.label, color: colors.textMuted },
  headerName: { fontSize: 20, fontWeight: '700', color: colors.text },
  footer: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerInner: {
    flexDirection: 'row',
    gap: spacing(1),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  /**
   * The recording, in the hue this application spends on exactly that. It is
   * a card rather than a line because it has to be read before anything else
   * on the screen is. See planning/STYLE.md § *The economy of colour*.
   */
  recording: {
    borderWidth: 1,
    borderColor: colors.recording,
    borderRadius: radius.md,
  },
  recordingText: { ...type.body, color: colors.recording, fontWeight: '600' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  personName: { flex: 1 },
  /**
   * The speaking dot, and the same one the roster draws: filled while they
   * are audible, hollow otherwise, always in the same place so a list does
   * not reflow every time somebody draws breath.
   */
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.textFaint,
  },
  dotLive: { backgroundColor: colors.floor, borderColor: colors.floor },
  warning: { ...type.muted, color: colors.danger },
});

import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  cooldownRemainingMs,
  floorRemainingMs,
  isSilenced,
} from '../core/floor';
import { isRecordingActive, recordedMs } from '../core/recording';
import {
  bothPresent,
  canClaimFloor,
  canPauseRecording,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  emptyTimeoutRemainingMs,
  isPresent,
  otherParty,
} from '../core/session';
import type { SessionState } from '../core/types';
import { backend } from '../mock/backend';
import type { Account } from '../mock/types';
import { useBackendState } from '../state/useBackend';
import { Button, Card, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

export function SessionView({
  me,
  sessionId,
  onExit,
}: {
  me: Account;
  sessionId: string;
  onExit: () => void;
}) {
  useBackendState();
  const session = backend.getSession(sessionId);
  const now = Date.now();

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={type.body}>This session no longer exists.</Text>
        <Button label="Back to home" variant="primary" onPress={onExit} />
      </View>
    );
  }

  const otherId = otherParty(session, me.id);
  const other = backend.getAccount(otherId);
  const otherName = other?.displayName ?? 'Contact';

  if (session.status === 'ended') {
    return (
      <View style={styles.centered}>
        <Text style={type.heading}>Session ended</Text>
        <Text style={[type.muted, styles.centeredText]}>
          {session.endedReason === 'empty-timeout'
            ? 'Nobody was present for a minute, so the session ended automatically.'
            : 'The session was ended. Re-entry is not possible — start a new one to continue.'}
        </Text>
        <Button label="Back to home" variant="primary" onPress={onExit} />
      </View>
    );
  }

  const dispatch = (action: Parameters<typeof backend.dispatch>[1]) =>
    backend.dispatch(sessionId, action);

  const iHoldFloor = session.floor.holder === me.id;
  const theyHoldFloor = session.floor.holder === otherId;
  const iAmSilenced = isSilenced(session.floor, me.id);
  const iAmSelfMuted = !!session.selfMuted[me.id];
  const claimable = canClaimFloor(session, me.id, now);
  const cooldown = cooldownRemainingMs(session.floor, me.id, now);
  const claimRemaining = floorRemainingMs(session.floor, now);
  const emptyRemaining = emptyTimeoutRemainingMs(session, now);
  const recordingLive = isRecordingActive(session.recording);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {recordingLive ? (
        <View style={styles.recordingIndicator}>
          <View
            style={[
              styles.recordingDot,
              session.recording.status === 'paused' && styles.recordingDotPaused,
            ]}
          />
          <Text style={styles.recordingLabel}>
            {session.recording.status === 'paused' ? 'Paused' : 'Recording'}
          </Text>
          <Text style={styles.recordingTime}>
            {formatDuration(recordedMs(session.recording, now))}
          </Text>
        </View>
      ) : null}

      <View style={styles.presence}>
        <Text style={type.title}>{otherName}</Text>
        <Text style={type.muted}>
          {isPresent(session, otherId)
            ? 'Present'
            : session.everPresent.includes(otherId)
              ? 'Left the session'
              : 'Waiting for them to join…'}
          {' · '}
          {formatDuration(now - session.createdAt)} elapsed
        </Text>
        {emptyRemaining !== null ? (
          <Text style={styles.warning}>
            Session empty — ends in {formatDuration(emptyRemaining)} unless
            someone re-enters.
          </Text>
        ) : null}
      </View>

      <SectionLabel>The floor</SectionLabel>
      <Card
        style={[
          styles.floorCard,
          iHoldFloor && styles.floorCardHeld,
          iAmSilenced && styles.floorCardSilenced,
        ]}
      >
        <Text style={styles.floorStatus}>
          {iHoldFloor
            ? 'You have the floor'
            : theyHoldFloor
              ? `${otherName} has the floor — your mic is cut`
              : 'Nobody has the floor'}
        </Text>

        {claimRemaining !== null ? (
          <Text style={styles.countdown}>{formatDuration(claimRemaining)}</Text>
        ) : cooldown !== null ? (
          <Text style={[styles.countdown, styles.countdownMuted]}>
            {formatDuration(cooldown)}
          </Text>
        ) : null}

        <Text style={styles.floorHint}>
          {iHoldFloor
            ? `${otherName} is muted until you release, or for up to three minutes.`
            : theyHoldFloor
              ? 'You cannot claim the floor while you are silenced.'
              : cooldown !== null
                ? 'You claimed last — you can claim again after this cooldown, or as soon as they claim and release.'
                : !bothPresent(session)
                  ? 'The floor becomes available once both of you are present.'
                  : 'Claim it to speak uninterrupted for up to three minutes.'}
        </Text>

        {iHoldFloor ? (
          <Button
            label="Release the floor"
            variant="floor"
            onPress={() => dispatch({ type: 'RELEASE_FLOOR', userId: me.id })}
          />
        ) : (
          <Button
            label="Claim the floor"
            variant="floor"
            disabled={!claimable}
            onPress={() => dispatch({ type: 'CLAIM_FLOOR', userId: me.id })}
          />
        )}
      </Card>

      <SectionLabel>Your microphone</SectionLabel>
      <Card style={styles.stack}>
        <Button
          label={iAmSelfMuted ? 'Unmute yourself' : 'Mute yourself'}
          onPress={() =>
            dispatch({
              type: 'SET_SELF_MUTE',
              userId: me.id,
              muted: !iAmSelfMuted,
            })
          }
        />
        <Text style={type.muted}>
          {iAmSilenced
            ? `Silenced by ${otherName}'s floor claim.`
            : iAmSelfMuted
              ? 'Muted by you. This is separate from the floor and costs you nothing.'
              : 'Open. Muting yourself never affects your floor eligibility.'}
        </Text>
      </Card>

      <SectionLabel>Recording</SectionLabel>
      <Card style={styles.stack}>
        {session.recording.status === 'idle' ? (
          <Button
            label="Start recording"
            disabled={!canStartRecording(session)}
            onPress={() => dispatch({ type: 'START_RECORDING', userId: me.id })}
          />
        ) : session.recording.status === 'stopped' ? (
          <Text style={type.muted}>
            Recording stopped — {formatDuration(recordedMs(session.recording, now))}{' '}
            captured. It will be available on Home once the session ends.
          </Text>
        ) : (
          <View style={styles.buttonRow}>
            {session.recording.status === 'paused' ? (
              <Button
                label="Resume"
                style={styles.flexButton}
                disabled={!canResumeRecording(session)}
                onPress={() =>
                  dispatch({ type: 'RESUME_RECORDING', userId: me.id })
                }
              />
            ) : (
              <Button
                label="Pause"
                style={styles.flexButton}
                disabled={!canPauseRecording(session, me.id)}
                onPress={() =>
                  dispatch({ type: 'PAUSE_RECORDING', userId: me.id })
                }
              />
            )}
            <Button
              label="Stop"
              style={styles.flexButton}
              disabled={!canStopRecording(session, me.id)}
              onPress={() => dispatch({ type: 'STOP_RECORDING', userId: me.id })}
            />
          </View>
        )}
        {iAmSilenced && recordingLive ? (
          <Text style={type.muted}>
            You cannot pause or stop the recording while you are silenced.
          </Text>
        ) : session.recording.status === 'idle' && !canStartRecording(session) ? (
          <Text style={type.muted}>
            Recording can start once both of you have connected.
          </Text>
        ) : null}
      </Card>

      <SectionLabel>Leaving</SectionLabel>
      <View style={styles.buttonRow}>
        <Button
          label="Leave"
          sublabel="You can re-enter"
          style={styles.flexButton}
          onPress={() => {
            dispatch({ type: 'LEAVE', userId: me.id });
            onExit();
          }}
        />
        <Button
          label="End session"
          sublabel="Permanent, for both"
          variant="danger"
          style={styles.flexButton}
          onPress={() =>
            Alert.alert(
              'End this session?',
              'This ends it immediately and permanently for both of you. Neither party can re-enter.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'End session',
                  style: 'destructive',
                  onPress: () => dispatch({ type: 'END', userId: me.id }),
                },
              ]
            )
          }
        />
      </View>

      </ScrollView>

      <PeerSimulator
        session={session}
        otherId={otherId}
        otherName={otherName}
        now={now}
        dispatch={dispatch}
      />
    </View>
  );
}

/**
 * Stands in for the second device until real signalling exists: it drives the
 * other party's actions through the very same reducer, so every rule on display
 * here is the real one.
 */
function PeerSimulator({
  session,
  otherId,
  otherName,
  now,
  dispatch,
}: {
  session: SessionState;
  otherId: string;
  otherName: string;
  now: number;
  dispatch: (action: Parameters<typeof backend.dispatch>[1]) => void;
}) {
  const present = isPresent(session, otherId);
  const holds = session.floor.holder === otherId;

  return (
    <View style={styles.simulator}>
      <Text style={styles.simulatorLabel}>
        Demo controls · acts as {otherName}
      </Text>
      <View style={styles.buttonRow}>
        <Button
          label={present ? 'They leave' : 'They join'}
          style={styles.flexButton}
          onPress={() =>
            dispatch({ type: present ? 'LEAVE' : 'ENTER', userId: otherId })
          }
        />
        <Button
          label={holds ? 'They release' : 'They claim'}
          style={styles.flexButton}
          disabled={!holds && !canClaimFloor(session, otherId, now)}
          onPress={() =>
            dispatch({
              type: holds ? 'RELEASE_FLOOR' : 'CLAIM_FLOOR',
              userId: otherId,
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  container: { padding: spacing(2.5), paddingBottom: spacing(3) },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(2),
  },
  centeredText: { textAlign: 'center', lineHeight: 20 },
  presence: { gap: 4, marginBottom: spacing(1) },
  warning: { color: colors.silenced, fontSize: 13, marginTop: spacing(0.5) },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing(0.75),
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.5),
    marginBottom: spacing(1),
  },
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
  floorCard: { gap: spacing(1.25), borderColor: colors.border },
  floorCardHeld: { borderColor: colors.floor, backgroundColor: colors.floorDim },
  floorCardSilenced: { borderColor: colors.silenced },
  floorStatus: { fontSize: 17, fontWeight: '600', color: colors.text },
  countdown: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  countdownMuted: { fontSize: 28, color: colors.textMuted },
  floorHint: { ...type.muted, lineHeight: 19 },
  stack: { gap: spacing(1.25) },
  buttonRow: { flexDirection: 'row', gap: spacing(1) },
  flexButton: { flex: 1 },
  // Pinned below the scroll area: the second party has to be reachable at any
  // moment, not buried under the fold.
  simulator: {
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(1.5),
    paddingBottom: spacing(2.5),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing(1),
  },
  simulatorLabel: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});

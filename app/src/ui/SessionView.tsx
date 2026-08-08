import React, { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  cooldownRemainingMs,
  floorRemainingMs,
  isSilenced,
} from '../../../core/floor';
import { isRecordingActive, recordedMs } from '../../../core/recording';
import {
  bothPresent,
  canClaimFloor,
  canPauseRecording,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  emptyTimeoutRemainingMs,
  isPresent,
} from '../../../core/session';
import { useSessionAudio } from '../audio/useSessionAudio';
import { useApp } from '../state/AppProvider';
import { Button, Card, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

/**
 * The in-session screen. Control states come from the same guards the server
 * enforces, so a greyed-out button and a refused action cannot disagree — but
 * the server is the authority and this only renders what it has been told.
 */
export function SessionView({
  sessionId,
  onExit,
}: {
  sessionId: string;
  onExit: () => void;
}) {
  const app = useApp();
  const view = app.sessionView;
  const session = view?.session.id === sessionId ? view.session : null;
  const me = app.me?.id ?? '';

  // Audio follows presence, not the screen: connect only while actually in the
  // session, so leaving stops publishing rather than leaving a live microphone
  // open behind a closed view.
  const present = !!session && session.status === 'active' && session.present.includes(me);
  const audio = useSessionAudio(
    present ? sessionId : null,
    app.token,
    !!session?.selfMuted[me]
  );

  useEffect(() => {
    app.watchSession(sessionId);
    // Deliberately not unwatching on unmount: leaving this screen is a separate
    // decision from leaving the session, and conflating them would silently
    // drop the user out of a live conversation.
  }, [sessionId]);

  if (!view || !session) {
    return (
      <View style={styles.centered}>
        <Text style={type.body}>
          {app.status === 'open' ? 'Loading session…' : 'Reconnecting…'}
        </Text>
        <Button label="Back to home" variant="ghost" onPress={onExit} />
      </View>
    );
  }

  const { other } = view;
  const now = app.serverNow();

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

  const act = (action: Parameters<typeof app.act>[1]) => app.act(sessionId, action);

  const iHoldFloor = session.floor.holder === me;
  const theyHoldFloor = session.floor.holder === other.id;
  const iAmSilenced = isSilenced(session.floor, me);
  const iAmSelfMuted = !!session.selfMuted[me];
  const claimable = canClaimFloor(session, me, now);
  const cooldown = cooldownRemainingMs(session.floor, me, now);
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
          <Text style={styles.otherName}>{other.displayName}</Text>
          <Text style={type.muted}>
            {isPresent(session, other.id)
              ? 'Present'
              : session.everPresent.includes(other.id)
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
          {app.status !== 'open' ? (
            <Text style={styles.warning}>
              Reconnecting — you are still in the session.
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
                ? `${other.displayName} has the floor — your mic is cut`
                : 'Nobody has the floor'}
          </Text>

          {claimRemaining !== null ? (
            <Text style={styles.countdown}>{formatDuration(claimRemaining)}</Text>
          ) : cooldown !== null ? (
            <Text style={[styles.countdown, styles.countdownMuted]}>
              {formatDuration(cooldown)}
            </Text>
          ) : null}

          {claimRemaining !== null && iHoldFloor ? null : (
            <Text style={styles.floorHint}>
              {iHoldFloor
                ? `${other.displayName} is muted until you release, up to three minutes.`
                : theyHoldFloor
                  ? 'You cannot claim the floor while you are silenced.'
                  : cooldown !== null
                    ? 'You claimed last — you can claim again after this cooldown, or as soon as they claim and release.'
                    : !bothPresent(session)
                      ? 'The floor becomes available once both of you are present.'
                      : 'Speak uninterrupted for up to three minutes.'}
            </Text>
          )}

          {iHoldFloor ? (
            <Button
              label="Release the floor"
              variant="floor"
              onPress={() => act({ type: 'RELEASE_FLOOR' })}
            />
          ) : (
            <Button
              label="Claim the floor"
              variant="floor"
              disabled={!claimable}
              onPress={() => act({ type: 'CLAIM_FLOOR' })}
            />
          )}
        </Card>

        <SectionLabel>Your microphone</SectionLabel>
        <Card style={styles.stack}>
          <Button
            label={iAmSelfMuted ? 'Unmute yourself' : 'Mute yourself'}
            onPress={() => act({ type: 'SET_SELF_MUTE', muted: !iAmSelfMuted })}
          />
          <Text style={type.muted}>
            {iAmSilenced
              ? `Silenced by ${other.displayName}'s floor claim.`
              : iAmSelfMuted
                ? 'Muted by you. This is separate from the floor and costs you nothing.'
                : 'Open. Self-mute never affects floor eligibility.'}
          </Text>
          {recordingLive && iAmSilenced ? (
            // Being unheard is not the same as being unrecorded, and it would
            // be easy to assume otherwise. Say it plainly rather than let
            // someone speak freely on that assumption.
            <Text style={styles.warning}>
              You are still being recorded. {other.displayName} cannot hear you,
              but your microphone is captured; it is left out of the exported
              recording, not out of the capture.
            </Text>
          ) : null}
          <Text style={audioTone(audio.status)}>{describeAudio(audio)}</Text>
        </Card>

        <SectionLabel>Recording</SectionLabel>
        <Card style={styles.stack}>
          {session.recording.status === 'idle' ? (
            <Button
              label="Start recording"
              disabled={!canStartRecording(session)}
              onPress={() => act({ type: 'START_RECORDING' })}
            />
          ) : session.recording.status === 'stopped' ? (
            <Text style={type.muted}>
              Stopped — {formatDuration(recordedMs(session.recording, now))}{' '}
              captured.
            </Text>
          ) : (
            <View style={styles.buttonRow}>
              {session.recording.status === 'paused' ? (
                <Button
                  label="Resume"
                  style={styles.flexButton}
                  disabled={!canResumeRecording(session)}
                  onPress={() => act({ type: 'RESUME_RECORDING' })}
                />
              ) : (
                <Button
                  label="Pause"
                  style={styles.flexButton}
                  disabled={!canPauseRecording(session, me)}
                  onPress={() => act({ type: 'PAUSE_RECORDING' })}
                />
              )}
              <Button
                label="Stop"
                style={styles.flexButton}
                disabled={!canStopRecording(session, me)}
                onPress={() => act({ type: 'STOP_RECORDING' })}
              />
            </View>
          )}
          {iAmSilenced && recordingLive ? (
            <Text style={type.muted}>
              Silenced — pause and stop unavailable, and your microphone is
              still being captured.
            </Text>
          ) : session.recording.status === 'idle' &&
            !canStartRecording(session) ? (
            <Text style={type.muted}>Starts once both of you have connected.</Text>
          ) : null}
        </Card>

        <SectionLabel>Leaving</SectionLabel>
        <View style={styles.buttonRow}>
          <Button
            label="Leave"
            sublabel="You can re-enter"
            style={styles.flexButton}
            onPress={() => {
              act({ type: 'LEAVE' });
              app.leaveSessionView(sessionId);
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
                    onPress: () => act({ type: 'END' }),
                  },
                ]
              )
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

/** Plain-language audio state, so a silent session is never a mystery. */
function describeAudio(audio: ReturnType<typeof useSessionAudio>): string {
  switch (audio.status) {
    case 'idle':
      return 'Audio not connected.';
    case 'connecting':
      return 'Connecting audio…';
    case 'connected':
      return audio.otherAudible
        ? 'Audio connected.'
        : 'Audio connected — waiting for them to be audible.';
    case 'denied':
      return audio.message ?? 'Microphone access refused.';
    case 'unavailable':
      return 'Audio is not configured on the server.';
    case 'error':
      return `Audio failed: ${audio.message ?? 'unknown error'}`;
  }
}

function audioTone(status: string) {
  return status === 'denied' || status === 'error'
    ? styles.audioBad
    : styles.audioMuted;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  audioMuted: { ...type.muted, color: colors.textFaint },
  audioBad: { ...type.muted, color: colors.danger },
  otherName: { fontSize: 24, fontWeight: '700', color: colors.text },
  scroll: { flex: 1 },
  container: { padding: spacing(2), paddingBottom: spacing(2) },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(2),
  },
  centeredText: { textAlign: 'center', lineHeight: 20 },
  presence: { gap: 2, marginBottom: spacing(0.5) },
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
  floorCard: { gap: spacing(1), borderColor: colors.border },
  floorCardHeld: { borderColor: colors.floor, backgroundColor: colors.floorDim },
  floorCardSilenced: { borderColor: colors.silenced },
  floorStatus: { fontSize: 17, fontWeight: '600', color: colors.text },
  countdown: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  countdownMuted: { fontSize: 24, color: colors.textMuted },
  floorHint: { ...type.muted, lineHeight: 19 },
  stack: { gap: spacing(1) },
  buttonRow: { flexDirection: 'row', gap: spacing(1) },
  flexButton: { flex: 1 },
});

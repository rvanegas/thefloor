import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  cooldownRemainingMs,
  floorRemainingMs,
  isSilenced,
} from '../../../core/floor';
import { playbackPositionMs } from '../../../core/playback';
import { isRecordingActive, recordedMs } from '../../../core/recording';
import { MAX_CHANNEL_PARTICIPANTS } from '../../../core/constants';
import {
  atLeastTwoPresent,
  canClaimFloor,
  canInvite,
  canControlPlayback,
  canPauseRecording,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  isPresent,
} from '../../../core/channel';
import { useSessionAudio } from '../audio/useSessionAudio';
import { pickAndUploadTrack } from '../api/upload';
import { useApp } from '../state/AppProvider';
import { ChannelSettingsView } from './ChannelSettingsView';
import { InlineMarkdown } from './markdown';
import { Button, Card, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

/** How far the skip buttons move, there being no scrubber to drag. */
const SKIP_MS = 15_000;
const VOLUME_STEP = 0.1;

/**
 * The in-channel screen. Control states come from the same guards the server
 * enforces, so a greyed-out button and a refused action cannot disagree — but
 * the server is the authority and this only renders what it has been told.
 */
export function ChannelView({
  channelId,
  onExit,
}: {
  channelId: string;
  onExit: () => void;
}) {
  const app = useApp();
  const view = app.channelView;
  const channel = view?.channel.id === channelId ? view.channel : null;
  const me = app.me?.id ?? '';
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Audio follows presence, not the screen: connect only while actually in the
  // channel, so leaving stops publishing rather than leaving a live microphone
  // open behind a closed view.
  const present = !!channel && channel.status === 'active' && channel.present.includes(me);
  const audio = useSessionAudio(
    present ? channelId : null,
    app.token,
    !!channel?.selfMuted[me]
  );

  useEffect(() => {
    app.watchChannel(channelId);
    // Deliberately not unwatching on unmount: leaving this screen is a separate
    // decision from leaving the channel, and conflating them would silently
    // drop the user out of a live conversation.
  }, [channelId]);

  if (!view || !channel) {
    return (
      <View style={styles.centered}>
        <Text style={type.body}>
          {app.status === 'open' ? 'Loading channel…' : 'Reconnecting…'}
        </Text>
        <Button label="Back to home" variant="ghost" onPress={onExit} />
      </View>
    );
  }

  // Every participant, self included; the name directory for every id the
  // channel state carries.
  const others = view.participants.filter((p) => p.id !== me);
  const nameOf = (id: string | null) =>
    view.participants.find((p) => p.id === id)?.displayName ?? 'Someone';
  const now = app.serverNow();

  if (channel.status === 'ended') {
    return (
      <View style={styles.centered}>
        <Text style={type.heading}>Channel ended</Text>
        <Text style={[type.muted, styles.centeredText]}>
          Everyone left this channel, so it no longer exists. Start a new one
          to talk again.
        </Text>
        <Button label="Back to home" variant="primary" onPress={onExit} />
      </View>
    );
  }

  // Rendered instead of the channel, not instead of being in it: the audio
  // hook above stays mounted, so opening settings hangs up nothing.
  if (settingsOpen) {
    return (
      <ChannelSettingsView
        channel={channel}
        onBack={() => setSettingsOpen(false)}
      />
    );
  }

  const act = (action: Parameters<typeof app.act>[1]) => app.act(channelId, action);

  const iHoldFloor = channel.floor.holder === me;
  const theyHoldFloor = channel.floor.holder !== null && !iHoldFloor;
  const holderName = nameOf(channel.floor.holder);
  const iAmSilenced = isSilenced(channel.floor, me);
  const iAmSelfMuted = !!channel.selfMuted[me];
  const claimable = canClaimFloor(channel, me, now);
  const cooldown = cooldownRemainingMs(channel.floor, channel.present, me, now);
  const claimRemaining = floorRemainingMs(channel.floor, now);
  const recordingLive = isRecordingActive(channel.recording);
  // Leaving is ordinary until you are the last one, at which point the same
  // tap destroys the channel. Nothing else in the interface would say so.
  const lastMember = channel.participants.length === 1;

  const playback = channel.playback;
  const track = playback.track;
  const position = playbackPositionMs(playback, now);
  const mayControlPlayback = canControlPlayback(channel, me);

  const loadTrack = async () => {
    setUploadError(null);
    setUploading(true);
    try {
      await pickAndUploadTrack(app.token ?? '', channelId);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {recordingLive ? (
          <View style={styles.recordingIndicator}>
            <View
              style={[
                styles.recordingDot,
                channel.recording.status === 'paused' && styles.recordingDotPaused,
              ]}
            />
            <Text style={styles.recordingLabel}>
              {channel.recording.status === 'paused' ? 'Paused' : 'Recording'}
            </Text>
            <Text style={styles.recordingTime}>
              {formatDuration(recordedMs(channel.recording, now))}
            </Text>
          </View>
        ) : null}

        <View style={styles.presence}>
          <View style={styles.titleRow}>
            <Text style={styles.otherName} numberOfLines={1}>
              {channel.name ??
                (others.length === 1
                  ? others[0].displayName
                  : `${others.length + 1} people`)}
            </Text>
            <Button
              label="Settings"
              variant="ghost"
              onPress={() => setSettingsOpen(true)}
            />
          </View>
          {channel.description ? (
            <InlineMarkdown
              text={channel.description}
              style={styles.description}
            />
          ) : null}
          {others.map((participant) => (
            <Text key={participant.id} style={type.muted}>
              {/* When the header is the other party's own name, repeating it
                  here says nothing; under a channel name it is the only place
                  their name appears. */}
              {others.length === 1 && !channel.name
                ? ''
                : `${participant.displayName} · `}
              {isPresent(channel, participant.id)
                ? // Present but unreachable is its own state, not absence:
                  // they are still in the channel and still hold whatever
                  // they hold. Saying so beats making them vanish and
                  // reappear over a moment's bad signal.
                  channel.disconnectedAt[participant.id] !== undefined
                  ? 'Present · reconnecting…'
                  : 'Present'
                : channel.everPresent.includes(participant.id)
                  ? 'Left the channel'
                  : 'Waiting for them to join…'}
              {channel.selfMuted[participant.id] ? ' · muted' : ''}
            </Text>
          ))}
          {app.status !== 'open' ? (
            <Text style={styles.warning}>
              Reconnecting — a dropped connection counts as leaving.
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
                ? `${holderName} has the floor — your mic is cut`
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
                ? others.length === 1
                  ? `${others[0].displayName} is muted until you release, up to three minutes.`
                  : 'Everyone else is muted until you release, up to three minutes.'
                : theyHoldFloor
                  ? 'You cannot claim the floor while you are silenced.'
                  : cooldown !== null
                    ? 'You spoke recently — you can claim again after this cooldown, or sooner as others claim and release.'
                    : !atLeastTwoPresent(channel)
                      ? 'The floor becomes available once at least two people are present.'
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
              ? `Silenced by ${holderName}'s floor claim.`
              : iAmSelfMuted
                ? 'Muted by you. This is separate from the floor and costs you nothing.'
                : 'Open. Self-mute never affects floor eligibility.'}
          </Text>
          {recordingLive && iAmSilenced ? (
            // Being unheard is not the same as being unrecorded, and it would
            // be easy to assume otherwise. Say it plainly rather than let
            // someone speak freely on that assumption.
            <Text style={styles.warning}>
              You are still being recorded. Nobody can hear you, but your
              microphone is captured; it is left out of the exported recording,
              not out of the capture.
            </Text>
          ) : null}
          <Text style={audioTone(audio.status)}>{describeAudio(audio)}</Text>
        </Card>

        <SectionLabel>Shared audio</SectionLabel>
        <Card style={styles.stack}>
          {playback.failure ? (
            <Text style={styles.warning}>
              Playback stopped — {playback.failure}
            </Text>
          ) : null}
          {uploadError ? <Text style={styles.warning}>{uploadError}</Text> : null}

          {track ? (
            <>
              <Text style={type.heading} numberOfLines={1}>
                {track.title}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        (position / Math.max(1, track.durationMs)) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressTime}>
                  {formatDuration(position)}
                </Text>
                <Text style={styles.progressTime}>
                  {formatDuration(track.durationMs)}
                </Text>
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label="−15s"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: 'SEEK', positionMs: position - SKIP_MS })
                  }
                />
                <Button
                  label={playback.status === 'playing' ? 'Pause' : 'Play'}
                  variant="primary"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: playback.status === 'playing' ? 'PAUSE' : 'PLAY' })
                  }
                />
                <Button
                  label="+15s"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: 'SEEK', positionMs: position + SKIP_MS })
                  }
                />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label="Quieter"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback || playback.volume <= 0}
                  onPress={() =>
                    act({
                      type: 'SET_VOLUME',
                      volume: playback.volume - VOLUME_STEP,
                    })
                  }
                />
                <View style={styles.volumeReadout}>
                  <Text style={styles.progressTime}>
                    {Math.round(playback.volume * 100)}%
                  </Text>
                </View>
                <Button
                  label="Louder"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback || playback.volume >= 1}
                  onPress={() =>
                    act({
                      type: 'SET_VOLUME',
                      volume: playback.volume + VOLUME_STEP,
                    })
                  }
                />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label={uploading ? 'Uploading…' : 'Change track'}
                  style={styles.flexButton}
                  disabled={!mayControlPlayback || uploading}
                  onPress={loadTrack}
                />
                <Button
                  label="Remove"
                  variant="ghost"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() => act({ type: 'CLEAR_TRACK' })}
                />
              </View>
            </>
          ) : (
            <Button
              label={uploading ? 'Uploading…' : 'Play something together'}
              sublabel="An audio file from this phone"
              disabled={!mayControlPlayback || uploading}
              onPress={loadTrack}
            />
          )}

          <Text style={type.muted}>
            {theyHoldFloor
              ? // The point of the mechanic, stated where it bites: the track
                // does not stop, but it stops being yours to change.
                `${holderName} has the floor, so they decide what plays.`
              : iHoldFloor
                ? 'You have the floor — only you can change what plays.'
                : track
                  ? 'Everyone hears this, and anyone present can change it.'
                  : 'Whatever you play, everyone hears — and it is kept in the recording.'}
          </Text>
        </Card>

        <SectionLabel>Recording</SectionLabel>
        <Card style={styles.stack}>
          {channel.recording.failure ? (
            // Capture stopping for a reason nobody asked for must not read like
            // a recording somebody chose to end. Whoever was speaking on the
            // strength of the indicator needs to know it was not kept.
            <Text style={styles.warning}>
              Recording failed — {channel.recording.failure}
            </Text>
          ) : null}

          {channel.recording.status === 'idle' ? (
            <>
              <Button
                label={
                  channel.recording.failure
                    ? 'Try recording again'
                    : channel.lastRecording
                      ? 'Record again'
                      : 'Start recording'
                }
                disabled={!canStartRecording(channel, me)}
                onPress={() => act({ type: 'START_RECORDING' })}
              />
              {/*
                What the previous run captured. A channel holds as many
                recordings as people care to make, so stopping is no longer a
                dead end — this reports the last one and the button above
                offers another.
              */}
              {channel.lastRecording ? (
                <Text style={type.muted}>
                  {channel.lastRecording.failure ? 'Ended early — ' : 'Saved — '}
                  {formatDuration(channel.lastRecording.durationMs)} captured.
                </Text>
              ) : null}
            </>
          ) : (
            <View style={styles.buttonRow}>
              {channel.recording.status === 'paused' ? (
                <Button
                  label="Resume"
                  style={styles.flexButton}
                  disabled={!canResumeRecording(channel)}
                  onPress={() => act({ type: 'RESUME_RECORDING' })}
                />
              ) : (
                <Button
                  label="Pause"
                  style={styles.flexButton}
                  disabled={!canPauseRecording(channel, me)}
                  onPress={() => act({ type: 'PAUSE_RECORDING' })}
                />
              )}
              <Button
                label="Stop"
                style={styles.flexButton}
                disabled={!canStopRecording(channel, me)}
                onPress={() => act({ type: 'STOP_RECORDING' })}
              />
            </View>
          )}
          {iAmSilenced && recordingLive ? (
            <Text style={type.muted}>
              Silenced — pause and stop unavailable, and your microphone is
              still being captured.
            </Text>
          ) : channel.recording.status === 'idle' &&
            !canStartRecording(channel, me) ? (
            <Text style={type.muted}>
              Step in to record. A recording stops when the last person leaves.
            </Text>
          ) : null}
        </Card>

        <SectionLabel>Invite</SectionLabel>
        <Card style={styles.stack}>
          <InviteList
            channel={channel}
            me={me}
            onInvite={(contactId) => act({ type: 'INVITE', contactId })}
          />
        </Card>

        {/*
          Two different acts, deliberately not two intensities of one. Stepping
          out is about this conversation; leaving is about the channel. Naming
          the first "Leave" as well is what would make them read as a pair.
        */}
        <SectionLabel>Leaving</SectionLabel>
        <View style={styles.buttonRow}>
          <Button
            label="Step out"
            sublabel="You stay a member"
            style={styles.flexButton}
            onPress={() => {
              act({ type: 'STEP_OUT' });
              app.leaveChannelView(channelId);
              onExit();
            }}
          />
          <Button
            label="Leave channel"
            sublabel={lastMember ? 'Deletes this channel' : 'Removes it from Home'}
            variant="danger"
            style={styles.flexButton}
            onPress={() =>
              Alert.alert(
                lastMember ? 'Delete this channel?' : 'Leave this channel?',
                lastMember
                  ? 'You are its last member, so leaving deletes it. Its recordings are kept.'
                  : 'It disappears from your home screen and you will need a fresh invitation to come back. Everyone else keeps it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: lastMember ? 'Delete' : 'Leave',
                    style: 'destructive',
                    onPress: () => {
                      act({ type: 'LEAVE_CHANNEL' });
                      app.leaveChannelView(channelId);
                      onExit();
                    },
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

/**
 * Who can be invited: accepted contacts of *this user* who are not already in
 * the channel, the cap permitting. The guard is the same one the server
 * enforces, so a shown button and a refused invite cannot disagree — except on
 * contacts, which are the server's check; the list only offers contacts, so
 * the two disagree only if a contact was dropped mid-channel.
 */
function InviteList({
  channel,
  me,
  onInvite,
}: {
  channel: NonNullable<ReturnType<typeof useApp>['channelView']>['channel'];
  me: string;
  onInvite: (contactId: string) => void;
}) {
  const app = useApp();
  const invitable = (app.home?.contacts ?? []).filter(
    (entry) =>
      entry.status === 'accepted' && canInvite(channel, me, entry.account.id)
  );

  if (channel.participants.length >= MAX_CHANNEL_PARTICIPANTS) {
    return (
      <Text style={type.muted}>
        Channels hold up to {MAX_CHANNEL_PARTICIPANTS} people.
      </Text>
    );
  }
  if (invitable.length === 0) {
    return (
      <Text style={type.muted}>
        Every contact you could invite is already in this channel.
      </Text>
    );
  }
  return (
    <>
      {invitable.map((entry) => (
        <View key={entry.account.id} style={styles.inviteRow}>
          <Text style={[type.body, styles.inviteName]} numberOfLines={1}>
            {entry.account.displayName}
          </Text>
          <Button
            label="Invite"
            onPress={() => onInvite(entry.account.id)}
          />
        </View>
      ))}
      <Text style={type.muted}>
        They see the invitation on their home screen and join when they like.
      </Text>
    </>
  );
}

/** Plain-language audio state, so a silent channel is never a mystery. */
function describeAudio(audio: ReturnType<typeof useSessionAudio>): string {
  switch (audio.status) {
    case 'idle':
      return 'Audio not connected.';
    case 'connecting':
      return 'Connecting audio…';
    case 'connected':
      return audio.othersAudible > 0
        ? 'Audio connected.'
        : 'Audio connected — waiting for anyone else to be audible.';
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
  otherName: { flexShrink: 1, fontSize: 24, fontWeight: '700', color: colors.text },
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
  description: {
    ...type.muted,
    lineHeight: 20,
    marginTop: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
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
});

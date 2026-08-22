import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  cooldownRemainingMs,
  floorRemainingMs,
  isSilenced,
} from '../../../core/floor';
import { playbackPositionMs } from '../../../core/playback';
import { isRecordingActive, recordedMs } from '../../../core/recording';
import {
  MAX_CHANNEL_PARTICIPANTS,
  MAX_CLIP_LENGTH,
} from '../../../core/constants';
import {
  atLeastTwoPresent,
  canClaimFloor,
  idleMs,
  isWaiting,
  canInvite,
  canControlPlayback,
  canPauseRecording,
  canResumeRecording,
  canSetSelfMute,
  canStartRecording,
  canStopRecording,
  canPasteClip,
  canClearClip,
  isPresent,
} from '../../../core/channel';
import type { SessionAudio } from '../audio/useSessionAudio';
import { pickAndUploadTrack } from '../api/upload';
import { copyText, pasteText } from '../clipboard';
import { useApp } from '../state/AppProvider';
import { AudioDebugPanel } from './AudioDebugPanel';
import { ChannelSettingsView } from './ChannelSettingsView';
import { ProfileView } from './ProfileView';
import { InlineMarkdown, isSafeUrl, openUrl } from './markdown';
import {
  Button,
  Card,
  Empty,
  RecordingRow,
  Screen,
  SectionLabel,
} from './components';
import { ago, duration } from './relativeTime';
import { colors, formatDuration, radius, spacing, type } from './theme';
import { louder, quieter } from './volume';
import { describeChannel } from '../../../core/naming';
import { useOfflineNotice } from './useOfflineNotice';

/** How far the skip buttons move, there being no scrubber to drag. */
const SKIP_MS = 15_000;

/**
 * What the upload button says while it is uploading.
 *
 * The percentage is the whole of the progress indicator on purpose — a bar
 * would say the same thing less precisely, and the thing somebody staring at a
 * stuck upload wants is a number that is or is not changing. When the platform
 * will not say how big the body is there is no number, and the button says
 * only that something is happening.
 */
export function uploadingLabel(percent: number | null): string {
  return percent === null ? 'Uploading…' : `Uploading… ${percent}%`;
}

/**
 * The in-channel screen. Control states come from the same guards the server
 * enforces, so a greyed-out button and a refused action cannot disagree — but
 * the server is the authority and this only renders what it has been told.
 */
export function ChannelView({
  channelId,
  audio,
  onHome,
  onExit,
}: {
  channelId: string;
  /**
   * Held above this screen, because the connection outlives it: walking back
   * to Home must not hang up. See App.tsx.
   */
  audio: SessionAudio;
  /** Back to Home, still present, still connected. */
  onHome: () => void;
  /** Off this screen having given up presence or membership. */
  onExit: () => void;
}) {
  const app = useApp();
  // This channel's snapshot, and nothing else's. Picked out by id rather than
  // taken from a single slot, so a snapshot arriving for another watched
  // channel cannot empty this screen — which it did, and which also hung up
  // the audio. See AppProvider.
  const view = app.channelViews[channelId] ?? null;
  const channel = view?.channel ?? null;
  // `?? []` is load-bearing rather than defensive. A server that predates this
  // field sends a snapshot without it, which is exactly what this build meets
  // between its release and the deploy that follows — the field is additive,
  // so the old server keeps working, and reading `.length` off nothing is the
  // one way that could still crash the screen.
  const recordings = view?.recordings ?? [];
  const me = app.me?.id ?? '';
  // One piece of state rather than three, because they are one thing: an
  // upload in flight, what it has managed so far, and how to stop it. `null`
  // is not uploading; a `cancel` of `null` is the moment between the picker
  // closing and the bytes moving, when there is nothing to stop yet.
  const [upload, setUpload] = useState<{
    percent: number | null;
    cancel: (() => void) | null;
  } | null>(null);
  const uploading = upload !== null;
  const [uploadError, setUploadError] = useState<string | null>(null);
  // What the clipboard section is saying about itself, if anything. Refusals
  // this screen makes on its own — an empty device clipboard, text past the
  // cap — because a paste travels as a socket action and a socket refusal is
  // rendered nowhere in a channel.
  const [clipError, setClipError] = useState<string | null>(null);
  // Whether the last copy landed, and nothing else. Same three states and the
  // same 2.5s fade as AudioDebugPanel, that being the established way a
  // clipboard refusal is reported: `copyText` returns a boolean precisely so
  // that a copy which did not happen is not announced as one.
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewing, setViewing] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  // Before the early return below, which is where the rules of hooks want it.
  const showOffline = useOfflineNotice(app.status);

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2_500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    app.watchChannel(channelId);
    // Deliberately not unwatching on unmount: leaving this screen is a separate
    // decision from leaving the channel, and conflating them would silently
    // drop the user out of a live conversation.
  }, [channelId]);

  if (!view || !channel) {
    // A channel the server has said is gone is not one a snapshot is coming
    // for, so saying "Loading channel…" is a wait with no end: the ended
    // channel below is kept for thirty seconds and then deleted, and anybody
    // still standing here when that happens used to be left reading it
    // forever.
    const gone = app.goneChannels.includes(channelId);
    return (
      <View style={styles.centered}>
        {gone ? (
          <>
            <Text style={type.heading}>Channel gone</Text>
            <Text style={[type.muted, styles.centeredText]}>
              This channel is no longer there. It may have ended a while ago,
              or you may no longer be part of it.
            </Text>
          </>
        ) : (
          <Text style={type.body}>
            {app.status === 'open' ? 'Loading channel…' : 'Reconnecting…'}
          </Text>
        )}
        <Button
          label="Back to home"
          variant={gone ? 'primary' : 'ghost'}
          onPress={onExit}
        />
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
  // connection lives above this screen, so neither of these hangs up.
  if (viewing) {
    return (
      <ProfileView
        accountId={viewing.id}
        fallbackName={viewing.displayName}
        onBack={() => setViewing(null)}
        // Offered only for somebody who is not standing in the room, because
        // pinging a person who can hear you is not a thing that means
        // anything. The server refuses it on the same test, so a screen that
        // has gone stale — they walked in while this was open — is refused
        // rather than silently sending.
        onPing={
          channel && !isPresent(channel, viewing.id)
            ? (text) => app.ping(channel.id, viewing.id, text)
            : undefined
        }
        // When they may next be pinged, or null for now. The composer is
        // replaced by the wait rather than left there to be refused: the
        // server has always said no inside the window, and a button that is
        // offered, pressed and rejected teaches nothing that saying so up
        // front does not.
        pingableAt={view.pingableAt?.[viewing.id] ?? null}
        // Removing a contact leaves every channel that held only the two of
        // you, and this screen is reached from inside one — which, for a
        // one-to-one channel, is exactly the channel that has just gone. So
        // the way out is Home rather than back: closing the profile onto a
        // channel you have left would land on "Channel gone", which is a true
        // sentence and a strange answer to a tap about a contact.
        onRemoved={onExit}
      />
    );
  }

  if (settingsOpen) {
    return (
      <ChannelSettingsView
        channel={channel}
        onBack={() => setSettingsOpen(false)}
        onLeft={() => {
          app.leaveChannelView(channelId);
          onExit();
        }}
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

  // `?? null` for the same reason `recordings` has its `?? []`: a server that
  // predates this field sends snapshots without it, which is what this build
  // meets between its release and the deploy that follows.
  const clip = channel.clip ?? null;
  // Offered as a link only when the whole of what was pasted is one, and only
  // for a scheme `isSafeUrl` allows — the same allowlist that governs links in
  // a description, and for the same reason: this is text one member wrote and
  // another is being invited to hand to the OS. Finding a URL *inside* longer
  // text is deliberately not attempted; it would mean guessing which of
  // several somebody meant, and guessing wrong opens the wrong page.
  const clipUrl =
    clip && isSafeUrl(clip.text.trim()) ? clip.text.trim() : null;

  const pasteClip = async () => {
    setClipError(null);
    const text = await pasteText();
    if (text === null) {
      setClipError('There is nothing on your clipboard to paste.');
      return;
    }
    if (text.length > MAX_CLIP_LENGTH) {
      // Refused here rather than sent and silently dropped by the reducer: a
      // paste travels as a socket action, which reports nothing back that this
      // screen shows. The cap is imported rather than restated so the sentence
      // and the rule cannot drift apart.
      setClipError(
        `That is too long to share. The channel clipboard holds ${MAX_CLIP_LENGTH} characters.`
      );
      return;
    }
    act({ type: 'PASTE_CLIP', text });
  };

  const copyClip = async () => {
    if (!clip) return;
    setCopied((await copyText(clip.text)) ? 'done' : 'failed');
  };

  const loadTrack = async () => {
    setUploadError(null);
    setUpload({ percent: null, cancel: null });
    try {
      await pickAndUploadTrack(app.token ?? '', channelId, {
        // Guarded on the current state rather than set outright: both of these
        // arrive from a native callback and can land after the upload has
        // ended, and neither should resurrect a finished one.
        onStart: (cancel) => setUpload((u) => (u ? { ...u, cancel } : u)),
        onProgress: (percent) => setUpload((u) => (u ? { ...u, percent } : u)),
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpload(null);
    }
  };

  return (
    <Screen contentStyle={styles.container}>
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
            {/* Muted italic when nobody has named it, for the reason set out
                in core/naming.ts: this is a description written from your
                side, not a name the others would recognise. */}
            <Text
              style={channel.name ? styles.otherName : styles.describedName}
              numberOfLines={1}
            >
              {channel.name ??
                describeChannel(others.map((other) => other.displayName))}
            </Text>
            <View style={styles.titleActions}>
              {/*
                Back to Home without hanging up. The audio connection lives
                above this screen, so this is navigation and nothing else.
              */}
              <Button label="Home" variant="ghost" onPress={onHome} />
              <Button
                label="Settings"
                variant="ghost"
                onPress={() => setSettingsOpen(true)}
              />
            </View>
          </View>
          {channel.description ? (
            <InlineMarkdown
              text={channel.description}
              style={styles.description}
            />
          ) : null}
          {/*
            A card each, rather than the status lines this used to be. Who is
            in the room and who is talking is what the screen is *for*, and it
            was the smallest type on it — a line of muted grey under the title,
            below which four cards described what the channel was doing.
          */}
          <View style={styles.roster}>
            {view.participants.map((participant) => (
              <ParticipantCard
                key={participant.id}
                channel={channel}
                participant={participant}
                self={participant.id === me}
                // Audible right now, as the room hears it rather than as the
                // reducer imagines it: the floor says who *may* speak, and
                // this says who is.
                speaking={audio.speaking.includes(participant.id)}
                now={now}
                onPress={
                  participant.id === me
                    ? undefined
                    : () => setViewing(participant)
                }
              />
            ))}
          </View>

          {/* Same delay as Home's: a foreground drops the socket every time,
              and this used to announce it the instant it happened. */}
          {showOffline ? (
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
            // Holding the floor is holding it open to speak. The reducer
            // refuses the mute either way; disabling the control is what stops
            // the two disagreeing on screen.
            disabled={!canSetSelfMute(channel, me, !iAmSelfMuted)}
            onPress={() => act({ type: 'SET_SELF_MUTE', muted: !iAmSelfMuted })}
          />
          <Text style={type.muted}>
            {iAmSilenced
              ? `Silenced by ${holderName}'s floor claim.`
              : iHoldFloor
                ? 'Open while you hold the floor — release it to mute yourself.'
                : iAmSelfMuted
                  ? 'Muted by you. This is separate from the floor and costs you nothing.'
                  : audio.micOpen
                    ? 'Open. Self-mute never affects floor eligibility.'
                    : // Closed because nobody is here to hear it, which is
                      // worth saying: a microphone the screen calls open and is
                      // not is exactly the kind of silence this codebase keeps
                      // apologising for elsewhere.
                      'Closed until somebody else is here — so your other apps keep the speakers.'}
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
          {/*
            Shown only to an account with the `debug` column set, which is
            nobody by default — see server/src/db.ts. Under the microphone
            because that is the control whose effects it explains, and the
            place the panel it replaces lived.

            Unlike that one, this is not temporary and does not need deleting
            before the next upload: it is invisible to every account that has
            not been switched on, and switching one off is an `UPDATE` and a
            reconnect. TASKS.md § "A Gated Audio Diagnostic Panel" says who
            decides and what closing it would look like.
          */}
          {app.debug ? <AudioDebugPanel asked={audio.asked} /> : null}
        </Card>

        {/*
          Stepping out is the ordinary way to finish talking, so it is the only
          departure offered here. Leaving the channel outright lives in
          settings: it is rare, it is close to irreversible, and putting it
          beside this one in the colour reserved for danger drew the eye
          straight to the action least likely to be wanted.

          Directly under the microphone, because the two are the same question
          asked at different strengths — whether the others can hear you, and
          whether you are still there at all. Everything below is about what
          the channel is doing rather than about you being in it.

          Unexplained: it is the one thing on this screen somebody reaches for
          already knowing what it does, so the sublabel that used to describe
          it is gone. The heading and the card stay, every other control on
          this screen sitting in one.
        */}
        <SectionLabel>Step Out</SectionLabel>
        <Card style={styles.stack}>
          <Button
            label="Step out"
            onPress={() => {
              act({ type: 'STEP_OUT' });
              app.leaveChannelView(channelId);
              onExit();
            }}
          />
        </Card>

        {/*
          Who is here is settled before what is playing: the roster is the
          channel, and the two sections above are the rest of what this screen
          says about the people in it. Shared audio and recording are things
          the channel does, and they wait.
        */}
        <SectionLabel>Invite</SectionLabel>
        <Card style={styles.stack}>
          <InviteList
            channel={channel}
            me={me}
            onInvite={(contactId) => act({ type: 'INVITE', contactId })}
          />
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
                      volume: quieter(playback.volume),
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
                      volume: louder(playback.volume),
                    })
                  }
                />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label={upload ? uploadingLabel(upload.percent) : 'Change track'}
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
              label={upload ? uploadingLabel(upload.percent) : 'Play something together'}
              sublabel="An audio file from this phone"
              disabled={!mayControlPlayback || uploading}
              onPress={loadTrack}
            />
          )}

          {upload ? (
            // Outside both branches above, because an upload can be a first
            // track or a replacement and the way out is the same either way.
            // Disabled for the moment before the bytes move: the picker has
            // closed, there is no task yet, and a Cancel that did nothing
            // would read as the stuck upload it exists to escape.
            <Button
              label="Cancel upload"
              variant="ghost"
              disabled={!upload.cancel}
              onPress={() => upload.cancel?.()}
            />
          ) : null}

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

        <SectionLabel>Shared clipboard</SectionLabel>
        <Card style={styles.stack}>
          {clipError ? <Text style={styles.warning}>{clipError}</Text> : null}

          {clip ? (
            <>
              {/* What was pasted is not shown. Only who and when — the same
                  words the roster uses for an absence. A channel screen is
                  read over shoulders and left face-up on tables, and the
                  things people reach for a clipboard to move are often the
                  things they would rather not leave on display. Copy hands it
                  over without anybody having to look at it. */}
              <Text style={type.heading}>Pasted by {nameOf(clip.authorId)}</Text>
              <Text style={type.muted}>{ago(now - clip.pastedAt)}</Text>

              <View style={styles.buttonRow}>
                <Button
                  label={
                    copied === 'done'
                      ? '✓ copied'
                      : copied === 'failed'
                        ? '✗ copy failed'
                        : 'Copy'
                  }
                  variant="primary"
                  style={styles.flexButton}
                  onPress={() => void copyClip()}
                />
                {clipUrl ? (
                  <Button
                    label="Open"
                    style={styles.flexButton}
                    onPress={() => void openUrl(clipUrl)}
                  />
                ) : null}
                <Button
                  label="Clear"
                  style={styles.flexButton}
                  disabled={!canClearClip(channel, me)}
                  onPress={() => act({ type: 'CLEAR_CLIP' })}
                />
              </View>
            </>
          ) : (
            <Empty>Nothing on the channel clipboard.</Empty>
          )}

          <Button
            label={clip ? 'Replace with my clipboard' : 'Paste my clipboard'}
            disabled={!canPasteClip(channel, me)}
            onPress={() => void pasteClip()}
          />

          <Text style={type.muted}>
            {canPasteClip(channel, me)
              ? 'One clipboard for the channel — pasting replaces what is on it, and anyone here can copy it.'
              : 'Step in to put something on the channel clipboard.'}
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
                label="Record"
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

        {/*
          Recordings live here because they belong to the channel: it names
          them, its members are who may hear them, and deleting it deletes
          them. They were on Home, which put every conversation you had ever
          recorded into one list belonging to nothing.
        */}
        <SectionLabel>Recordings</SectionLabel>
        {recordings.length === 0 ? (
          <Empty>Nothing recorded here yet.</Empty>
        ) : (
          <View style={styles.stack}>
            {recordings.map((r) => (
              <RecordingRow
                key={r.id}
                recording={r}
                // Playing one loads it as the channel's shared track, so it is
                // governed by exactly what governs a track somebody uploaded —
                // including the floor-holder's say over what plays.
                playable
                playDisabled={!mayControlPlayback}
                playDisabledReason={
                  channel.floor.holder
                    ? 'the floor decides what plays'
                    : 'step in to play'
                }
              />
            ))}
          </View>
        )}
    </Screen>
  );
}

/**
 * One person in the channel: who they are, whether they are here, and whether
 * they are talking.
 *
 * Pressable because "who is this?" is a real question about somebody an
 * acquaintance brought in, and the answer — their profile, and the request that
 * keeps them — is one tap from here. Your own card is not: it leads to a
 * read-only view of yourself, offering to add you as your own contact.
 *
 * The speaking indicator is driven by the room rather than by the reducer. The
 * floor decides who *may* speak and the server enforces it; only the media
 * connection knows who is actually making noise, and the two are different
 * questions — a silent floor-holder and a self-muted person mouthing at a dead
 * microphone both look wrong if the badge is inferred from state.
 */
function ParticipantCard({
  channel,
  participant,
  self,
  speaking,
  now,
  onPress,
}: {
  channel: ReturnType<typeof useApp>['channelViews'][string]['channel'];
  participant: { id: string; displayName: string };
  self: boolean;
  speaking: boolean;
  /** The server's clock, which is what the idle time is measured against. */
  now: number;
  onPress?: () => void;
}) {
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
  const status = here
    ? // Present but unreachable is its own state, not absence: they are still
      // in the channel and still hold whatever they hold. Saying so beats
      // making them vanish and reappear over a moment's bad signal.
      reconnecting
      ? 'Present · reconnecting…'
      : 'Present'
    : away !== null && isWaiting(channel, participant.id, now)
      ? // They did not leave; their phone did. Walking into a channel and
        // pocketing the phone suspends the process in under a second, so this
        // is what most absences from an otherwise empty channel actually are —
        // and "Stepped out" told whoever arrived to give up on somebody who
        // was one notification away. The clock is the same one the line below
        // uses; only the name changes, and only for WAITING_WINDOW_MS. Said as
        // a length rather than a moment, `away` being how long they have been
        // at it rather than when it started.
        `Waiting for ${duration(away)}`
      : channel.everPresent.includes(participant.id)
        ? away === null
          ? 'Stepped out'
          : `Stepped out ${ago(away)}`
        : 'Invited';

  const body = (
    <>
      <View style={styles.cardHead}>
        {/* One string rather than a name and a suffix, so it is one run of
            text to a screen reader and to anything else reading the tree. */}
        <Text style={styles.cardName} numberOfLines={1}>
          {self ? `${participant.displayName} (you)` : participant.displayName}
        </Text>
        {/*
          The dynamic part, and the only thing on this screen that changes
          several times a second. Filled while they are audible, hollow
          otherwise — a shape that is always in the same place, so a card does
          not reflow every time somebody draws breath.
        */}
        <View
          style={[styles.speakingDot, speaking && styles.speakingDotLive]}
          accessibilityElementsHidden
        />
      </View>
      <Text style={type.muted}>
        {status}
        {muted ? ' · muted' : ''}
        {holdsFloor ? ' · has the floor' : ''}
      </Text>
    </>
  );

  const label = `${participant.displayName}${self ? ', you' : ''}. ${status}.${
    speaking ? ' Speaking.' : ''
  }${onPress ? ' View profile.' : ''}`;

  if (!onPress) {
    return (
      <View
        style={[styles.participantCard, speaking && styles.participantCardLive]}
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
        speaking && styles.participantCardLive,
        pressed && styles.participantCardPressed,
      ]}
    >
      {body}
    </Pressable>
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
  channel: ReturnType<typeof useApp>['channelViews'][string]['channel'];
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
function describeAudio(audio: SessionAudio): string {
  switch (audio.status) {
    case 'idle':
      return 'Audio not connected.';
    case 'connecting':
      return 'Connecting audio…';
    // Distinct from 'idle' on purpose. Both used to read as "not connected",
    // so audio that had died mid-conversation looked exactly like audio that
    // had never started — and since the only recovery was force-quitting, the
    // screen was quietly wrong about the one thing it is here to report.
    case 'reconnecting':
      return 'Audio dropped — reconnecting…';
    case 'connected':
      if (audio.othersAudible > 0) return 'Audio connected.';
      return audio.micOpen
        ? 'Audio connected — waiting for anyone else to be audible.'
        : 'Audio connected — microphone closed until somebody else is here.';
    case 'denied':
      return audio.message ?? 'Microphone access refused.';
    case 'unavailable':
      return 'Audio is not configured on the server.';
    case 'error':
      return `Audio failed: ${audio.message ?? 'unknown error'}`;
  }
}

function audioTone(status: string) {
  // Reconnecting is coloured with the failures rather than the quiet states:
  // it is a conversation that has stopped working, and it earns a glance.
  return status === 'denied' || status === 'error' || status === 'reconnecting'
    ? styles.audioBad
    : styles.audioMuted;
}

const styles = StyleSheet.create({
  audioMuted: { ...type.muted, color: colors.textFaint },
  audioBad: { ...type.muted, color: colors.danger },
  otherName: { flexShrink: 1, fontSize: 24, fontWeight: '700', color: colors.text },
  /** Italic alone; see the note on Home's `described`. */
  describedName: {
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    fontStyle: 'italic',
  },
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
  roster: { gap: spacing(1), marginTop: spacing(1) },
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
  participantCardPressed: { backgroundColor: colors.surfaceRaised },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  cardName: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: colors.text },
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
  description: {
    ...type.muted,
    lineHeight: 20,
    marginTop: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  titleActions: { flexDirection: 'row', alignItems: 'center' },
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  DELETED_RETENTION_MS,
  MAX_CHANNEL_NAME_LENGTH,
} from '../../../core/constants';
import { canEditChannel, hasTheRoom } from '../../../core/channel';
import {
  DEFAULT_NOTIFICATION_LEVEL,
  describeLevel,
  NOTIFICATION_LEVELS,
  type NotificationLevel,
} from '../../../core/notifications';
import type { ChannelState } from '../../../core/types';
import { type GuestLinkSummary } from '../api/http';
import { pickAndUploadArtwork } from '../api/upload';
import { ITUNES_CATEGORIES } from '../../../core/publication';
import { useApp } from '../state/AppProvider';
import {
  Button,
  Card,
  Checkbox,
  Field,
  IconButton,
  Screen,
  SectionLabel,
} from './components';
import { CloseIcon } from './icons';
import { colors, spacing, type } from './theme';

/**
 * Channel Settings, reached from the Channel view. Holds what is about the
 * channel rather than about the conversation: its name, which replaces the
 * roster-derived header ("3 people"), how it records itself, and the ways a
 * membership ends.
 *
 * **The notepad is not here, since 2026-09-12.** It was the section under the
 * name, on the reasoning that writing what a channel is for is a settings act;
 * the tab it is rendered on is called Notepad, and a notepad somebody has to
 * leave the page to write on is not one. It is on that tab now — plain text
 * behind a small *Edit* since 2026-09-13, the field and preview this screen
 * had having been more apparatus than a sheet of paper needs — and there is
 * deliberately no second copy here; see ChannelView's Notepad tab.
 */
export function ChannelSettingsView({
  channel,
  derivedTitle,
  publicAt,
  publication,
  onBack,
  onLeft,
}: {
  channel: ChannelState;
  /**
   * What this channel is called when nobody has named it, passed in rather
   * than computed: the roster's display names live on the `ChannelView`
   * snapshot and not on `ChannelState`, and the channel screen has already
   * resolved them for its own header. Deriving it twice from two sources is
   * how the field and the header would come to disagree about the same
   * channel. It is the field's placeholder; see the note there.
   */
  derivedTitle: string;
  /**
   * When this channel declared itself public, or null. On the snapshot rather
   * than on `ChannelState` — no reducer knows about it — so it arrives the
   * same way `derivedTitle` does, resolved by the screen that already has it.
   */
  publicAt: number | null;
  /**
   * What this channel declares about itself for a directory, and whether it
   * has cover art. On the snapshot beside `publicAt`, and passed in here for
   * the same reason `derivedTitle` is.
   */
  publication?: {
    language: string | null;
    explicit: boolean | null;
    category: string | null;
    imageAt: number | null;
  };
  onBack: () => void;
  /** Called once membership is given up, to get off this channel's screens. */
  onLeft: () => void;
}) {
  const app = useApp();
  /**
   * Held locally as well as on the snapshot, so the switch answers the tap
   * rather than the round trip. The snapshot is the authority and arrives
   * moments later; this is initialised from it and replaced by what the
   * server actually stored.
   */
  const [isPublic, setIsPublic] = useState(publicAt !== null);
  useEffect(() => setIsPublic(publicAt !== null), [publicAt]);
  // Alone, the same tap destroys the channel rather than merely removing you
  // from it. Nothing else on screen would say so.
  const lastMember = channel.participants.length === 1;
  /**
   * Whether the name is yours to change — `hasTheRoom`, so either you are in
   * the channel or nobody is. What it protects against is a member who is
   * somewhere else renaming the place mid-conversation. The *notepad* keeps
   * the same gate on its own tab, the two being one question asked twice.
   *
   * The field is disabled rather than hidden, and `persist` is guarded too:
   * a field that cannot be typed into cannot produce a change to write, but
   * the two facts are a screen apart and the reducer refuses this silently, so
   * the belt is cheap and the braces are what stops a stale `saved` ref
   * recording an edit that never landed.
   *
   * Leaving and deleting are deliberately not covered. Giving up your own
   * membership is yours whatever anybody else is doing, and deleting is
   * already the last member's alone — which nobody can be while somebody else
   * is present.
   */
  const mayEdit = canEditChannel(channel, app.me?.id ?? '');
  // What deleting would take with it. Read from the snapshot the channel
  // screen is already showing, so the number in the warning is the number of
  // rows the person can see above it.
  const recordingCount = app.channelViews[channel.id]?.recordings?.length ?? 0;
  /**
   * `?? false` because a snapshot from a server that predates the field says
   * nothing, and a channel that has never heard of the setting does not have
   * it on. See `autoRecord` in core/types.ts.
   */
  const autoRecord = channel.autoRecord ?? false;
  const [name, setName] = useState(channel.name ?? '');

  /**
   * What the channel already has, so leaving the field alone dispatches
   * nothing.
   */
  const saved = useRef({ name: channel.name ?? '' });

  /**
   * Writes the name, if it has actually changed.
   *
   * There were two Save buttons here and each of them closed the screen, so
   * naming a channel took you out of the settings you were halfway through —
   * and the way back, sitting above both and reading "Done" then, discarded
   * everything without a word. Saving
   * as you leave a field means the only button left is the one that means what
   * it says.
   *
   * An empty name is a real value here, unlike a display name: it is how a
   * channel goes back to being listed by who is in it.
   *
   * **`saved.current` moves only when the action reached the socket**, which
   * is the correction of 2026-09-16. It used to be written on the line after
   * the dispatch, unconditionally — so a rename taken while the socket was
   * down was recorded as saved, and then `done` found `name` equal to
   * `saved.current.name` and dispatched nothing. The premature write was not
   * merely an inaccurate record: it was the thing that suppressed the retry,
   * and since the connection is usually back within a second or two, that
   * retry is what would have made the rename land. Leaving it stale costs an
   * extra `SET_NAME` when the first one did in fact arrive, which the reducer
   * answers with the same state. See planning/decisions/2026-09-16-being-offline-is-one-state.md.
   */
  const persist = () => {
    if (!mayEdit) return;
    if (name !== saved.current.name) {
      if (app.act(channel.id, { type: 'SET_NAME', name })) {
        saved.current.name = name;
      }
    }
  };

  /**
   * Synchronous, and so the button has no "Saving…" state where `ProfileView`'s
   * does. That is not an oversight and not a difference in taste: a profile is
   * an awaited HTTP call that can report a failure and refuse to close, and
   * `app.act` is a dispatch down the socket with nothing to await.
   *
   * **It named `HomeSettingsView` until 2026-09-16 and had been wrong since
   * 2026-08-29**, when the awaited save and the "Saving…" label left with the
   * name and bio fields for the profile. Home has no form on it at all now.
   *
   * What is still true is that a *refused* action comes back as a snapshot
   * with no error — a reducer guard returns the state unchanged — so there is
   * nothing to catch even when the send succeeded. Do not add an in-flight
   * state here to make the two screens match: there is no flight to be in
   * until `channel.action` is acknowledged, which is the half of
   * planning/backlog/ § *A channel action that never lands* that the offline
   * work deliberately left there.
   *
   * What a write that never *left* costs is now handled, in `persist`.
   */
  const done = () => {
    persist();
    onBack();
  };

  /**
   * Leaving, for anyone but the last member. It now costs the recordings too —
   * they belong to the channel, and giving up the channel gives up reaching
   * them — so the confirmation says so rather than leaving it to be discovered
   * by their absence.
   */
  const confirmLeave = () =>
    Alert.alert(
      'Leave this channel?',
      `It disappears from your home screen and you will need a fresh invitation to come back. Everyone else keeps it${
        recordingCount === 0
          ? '.'
          : `, and ${countOf(recordingCount)} with it — you will not be able to reach ${
              recordingCount === 1 ? 'it' : 'them'
            } again.`
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          // **Only leave the screen if the action left the app.** Queued, this
          // used to navigate you out as though you had gone — and you were
          // still a member, which the next snapshot said out loud by putting
          // the channel back on your home screen. Staying put is the honest
          // answer, and the wall is what explains it: past
          // `OFFLINE_AFTER_MS` this screen is not the one you are looking at.
          onPress: () => {
            if (app.act(channel.id, { type: 'LEAVE_CHANNEL' })) onLeft();
          },
        },
      ]
    );

  /**
   * Deleting, which only the last member can do and which is the end of the
   * channel and everything recorded in it.
   *
   * **Two taps, and the second one is not next to the first.** A single
   * destructive confirm is the pattern everywhere else in this app, and it is
   * not enough here: what goes is unrecoverable, it is the only copy anybody
   * has, and the tap that starts it sits where "leave" sat in every previous
   * build. The second dialog exists to cost a moment and to say the number out
   * loud — a person who is about to lose four recordings should have read the
   * word "four" before it happens.
   */
  const confirmDelete = () =>
    Alert.alert(
      'Delete this channel?',
      recordingCount === 0
        ? 'You are its last member, so this is the end of it. It cannot be undone.'
        : `You are its last member, so this deletes the channel and ${countOf(
            recordingCount
          )} made in it. Share anything you want to keep first — this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              recordingCount === 0
                ? 'Delete for good?'
                : `Delete ${countOf(recordingCount)} for good?`,
              `Everything goes, permanently, after ${RETENTION_DAYS} days. There is no undo in the app.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  // Gated as leaving is, and it matters more here: this is a
                  // confirmed, permanent, unrecoverable action, and queued it
                  // used to take you back to a home screen with the channel
                  // still on it.
                  onPress: () => {
                    if (app.act(channel.id, { type: 'DELETE_CHANNEL' })) onLeft();
                  },
                },
              ]
            ),
        },
      ]
    );

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Channel Settings</Text>
        {/* "Close" rather than "Channel". Naming the destination reads well
            until there are three settings screens and each names a different
            place — then the one word every one of them shares is the act, and
            the reader stops having to check which screen they are on to know
            what the button does. *Back* was that word until there were two
            layouts, and it names a destination by implication; see
            HomeSettingsView, which carries the argument. */}
        <IconButton
          label="Close"
          icon={(color) => <CloseIcon color={color} />}
          onPress={done}
        />
      </View>

      <SectionLabel>Channel name</SectionLabel>
      <Card style={styles.stack}>
        {/*
          **The placeholder is the derived title, not a prompt.** It used to
          ask "What is this channel about?", which is a fair question and
          answers a different one: an empty field is not empty of consequence
          here — the channel is already called something, everywhere it is
          listed, and the field was the one place that would not say what.
          Showing the description in placeholder grey states the two facts
          together: this is what it is called now, and nobody typed it. Which
          is also the distinction the italic in the lists used to carry and no
          longer does; here it is carried by the thing that actually means it,
          text you did not write being drawn the way unwritten text is drawn.

          It tracks the roster, so clearing the field does not leave a stale
          prompt behind: the sentence under the field says an empty name goes
          back to listing who is here, and the placeholder is then that list.
        */}
        <Field
          value={name}
          onChangeText={(v) => setName(v.slice(0, MAX_CHANNEL_NAME_LENGTH))}
          placeholder={derivedTitle}
          autoCapitalize="words"
          editable={mayEdit}
          onSubmit={persist}
          onBlur={persist}
        />
        <Text style={type.muted}>
          {mayEdit
            ? 'Everyone in the channel sees this name, and anyone in the room can change it. Leave it empty to go back to listing who is here.'
            : 'Step in to rename this channel. Somebody is in there, and the name is what they are calling the place they are in.'}
        </Text>
      </Card>

      {/*
        Whether the channel records itself, which is about the channel rather
        than about the conversation — the same reasoning that puts the name and
        here, and the reason it is not a fourth button on the
        Recording card of the channel screen. That card is where a run is
        driven; this is where a channel is set up.

        On the same terms as the name, `mayEdit` included:
        a member somewhere else must not arrange for a conversation they are
        not in to be kept.
      */}
      <SectionLabel>Recording</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.heading}>Record automatically</Text>
        <View style={styles.choices}>
          {(
            [
              [true, 'On'],
              [false, 'Off'],
            ] as Array<[boolean, string]>
          ).map(([value, label]) => (
            <Button
              key={label}
              label={label}
              style={styles.choice}
              disabled={!mayEdit}
              variant={autoRecord === value ? 'primary' : 'default'}
              onPress={() => app.act(channel.id, {
                type: 'SET_AUTO_RECORD',
                autoRecord: value,
              })}
            />
          ))}
        </View>
        <Text style={type.muted}>
          Off, which is where every channel starts: a recording begins when
          somebody presses Record. On, one begins by itself as soon as there
          are two of you in the room, and everyone sees it running.
        </Text>
        <Text style={type.muted}>
          {mayEdit
            ? 'Pause and Stop work the same either way, and stopping is final — nothing starts a second recording until everybody has left the channel and come back.'
            : 'Step in to change this. What is kept from a conversation is for whoever is in it.'}
        </Text>
      </Card>

      {/*
        Whose phone this channel may ring, and how loudly. One person's own
        answer about one channel — nobody else on the roster is told, and
        nothing about the conversation changes.

        Here rather than on the channel screen because it is about the channel
        and not about the conversation going on inside it. And per channel
        rather than on Floor Settings because that is the scope at which the
        question has an answer — the same amount of traffic
        is welcome from the conversation somebody is waiting on and unwelcome
        from the one they joined for completeness.
      */}
      <SectionLabel>Notifications</SectionLabel>
      <Card style={styles.stack}>
        <NotificationLevelPicker channelId={channel.id} />
      </Card>

      {/*
        Every door onto this channel that has ever been opened, and the state
        of each. Here rather than on the channel screen on the same terms as
        the section above: it is about the channel rather than about the
        conversation, and it is read when somebody has a reason to wonder who
        can get in.
      */}
      {/*
        Before Guest links rather than after, because it is the larger door:
        a guest link admits somebody you handed it to, and this makes a page
        anybody with the address can read. The two belong together — they are
        the only two ways anything here leaves the channel — and the bigger
        one is read first.
      */}
      <SectionLabel>Public page</SectionLabel>
      <Card style={styles.stack}>
        <Publishing
          channelId={channel.id}
          isPublic={isPublic}
          settings={publication}
          onChanged={(next) => setIsPublic(next)}
        />
      </Card>

      <SectionLabel>Guest links</SectionLabel>
      <Card style={styles.stack}>
        {/*
          Revocable on the same terms as everything else here, and for the
          sharper version of the reason: shutting a door while a conversation
          is going on is a decision about who is in that conversation.
          Reading the list is not — it is how somebody works out who can get
          in — so the rows are shown either way.
        */}
        <GuestLinks
          channelId={channel.id}
          mayRevoke={hasTheRoom(channel, app.me?.id ?? '')}
        />
      </Card>

      {/*
        Last, and plain. The confirmation carries the weight — colouring the
        button itself would put the loudest thing on the screen on the rarest
        action. The exception is being the last member, where the tap really
        does destroy something, and the colour is then telling the truth.
      */}
      <SectionLabel>{lastMember ? 'Deleting' : 'Leaving'}</SectionLabel>
      <Card style={styles.stack}>
        <Button
          label={lastMember ? 'Delete channel' : 'Leave channel'}
          sublabel={
            lastMember
              ? recordingCount === 0
                ? 'You are its last member — this destroys it for good'
                : `This destroys it and ${countOf(recordingCount)}, for good`
              : recordingCount === 0
                ? 'Removes it from your home screen'
                : `Removes it from your home screen, ${countOf(
                    recordingCount
                  )} included`
          }
          variant={lastMember ? 'danger' : 'default'}
          onPress={() => (lastMember ? confirmDelete() : confirmLeave())}
        />
        <Text style={type.muted}>
          Stepping out is on the channel screen and is probably what you want:
          it keeps your place here.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2), paddingBottom: spacing(4) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stack: { gap: spacing(1) },
  choices: { flexDirection: 'row', gap: spacing(1) },
  choice: { flex: 1 },
  warning: { ...type.muted, color: colors.danger },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  linkText: { flex: 1, gap: spacing(0.25) },
});

/** "a recording" / "3 recordings" — the count read as a phrase. */
/**
 * How loudly this channel may interrupt the person reading the screen.
 *
 * Three buttons rather than a slider or a switch, because the middle value is
 * a real choice and not a midpoint: "pings make a sound, nothing else does" is
 * what most people want and is not something anybody arrives at by dragging.
 * Each carries the sentence describing what it does, since the labels alone
 * cannot say whether "Quiet" still delivers anything — and somebody choosing
 * it is asking to be left alone about this channel, not to stop being told.
 *
 * The current value comes from the channel snapshot, which is per connection
 * and already carries this viewer's own setting. It is held in local state
 * once tapped so the screen answers immediately; the next snapshot carries the
 * same value back out of the database, so the optimistic answer and the
 * authoritative one converge rather than fight. A refusal puts it back, which
 * matters because the one thing worse than a setting that does not take is a
 * screen claiming it did.
 */
function NotificationLevelPicker({ channelId }: { channelId: string }) {
  const app = useApp();
  const stored =
    app.channelViews[channelId]?.notificationLevel ?? DEFAULT_NOTIFICATION_LEVEL;
  const [level, setLevel] = useState<NotificationLevel>(stored);
  const [error, setError] = useState<string | null>(null);

  // The snapshot is the authority, so a change made on another device — or the
  // first snapshot to arrive after this screen opened — wins over what is on
  // screen.
  useEffect(() => {
    setLevel(stored);
  }, [stored]);

  const choose = (next: NotificationLevel) => {
    const previous = level;
    setLevel(next);
    setError(null);
    app.setNotificationLevel(channelId, next).then(
      (saved) => setLevel(saved),
      (failure: unknown) => {
        setLevel(previous);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not change that just now.'
        );
      }
    );
  };

  return (
    <>
      {NOTIFICATION_LEVELS.map((option) => {
        const { label, detail } = describeLevel(option);
        return (
          <Button
            key={option}
            label={label}
            sublabel={detail}
            variant={option === level ? 'primary' : 'default'}
            onPress={() => choose(option)}
          />
        );
      })}
      {error ? <Text style={styles.warning}>{error}</Text> : null}
    </>
  );
}

/**
 * The links this channel has, live and dead.
 *
 * Loaded when the screen opens rather than held in app state: nothing else
 * reads it, no rule turns on it, and a cached list would be wrong the moment
 * anybody minted or revoked one from another device. The same reasoning as
 * Settings and donations.
 *
 * Revoked links stay in the list, which is the point of keeping the rows: a
 * link that quietly vanished would leave somebody wondering whether they had
 * imagined making it. The two ways one dies read differently on purpose —
 * somebody revoked it, or the channel emptied and the rule did.
 */
/**
 * Whether this channel has a public page, and where it is.
 *
 * **Two decisions, and this is only the first of them.** Turning it on makes
 * a page exist; it puts nothing on that page. Every recording is agreed to
 * separately, by everybody who was in it, on its own card in the channel —
 * which is why the line under the switch says so rather than leaving somebody
 * to discover that their conversations did not appear.
 *
 * The address is shown rather than hidden behind a share sheet, because it is
 * the thing somebody came to this screen to get: it carries the channel id,
 * which is unguessable, so it is handed to people the way a guest link is.
 */
function Publishing({
  channelId,
  isPublic,
  settings,
  onChanged,
}: {
  channelId: string;
  isPublic: boolean;
  settings?: {
    language: string | null;
    explicit: boolean | null;
    category: string | null;
    imageAt: number | null;
  };
  /** Called with the new state, so the screen's own copy stays in step. */
  onChanged: (next: boolean, url: string | null) => void;
}) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await app.setChannelPublic(channelId, next);
      setUrl(result.url);
      onChanged(next, result.url);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'That did not work.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Checkbox
        label={busy ? 'Saving…' : 'This channel has a public page'}
        checked={isPublic}
        onChange={(next) => {
          if (busy) return;
          if (!next) return void set(false);
          Alert.alert(
            'Give this channel a public page?',
            'The page shows the channel’s name and description to anyone ' +
              'with the address. Members are not named.\n\n' +
              'No recording appears on it until everybody who was in that ' +
              'recording has agreed to publish it, one at a time, from its ' +
              'card on the channel screen.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Create the page', onPress: () => void set(true) },
            ]
          );
        }}
      />
      {error ? <Text style={styles.warning}>{error}</Text> : null}
      {isPublic ? (
        <>
          {url ? (
            <Text style={type.body} numberOfLines={1}>
              {url.replace(/^https?:\/\//, '')}
            </Text>
          ) : null}
          <Text style={type.muted}>
            Nothing is on the page until everybody in a recording agrees to
            publish it. Each recording is asked about separately, on its own
            card.
          </Text>
          {/*
            Everything below is only needed by a channel that wants to be
            findable in Apple or Spotify. The page and the feed work without
            any of it — a feed is pasted into an app by somebody who was given
            the address — so it is grouped under one sentence saying so rather
            than presented as four things left undone.
          */}
          <Text style={type.muted}>
            To be listed in a podcast directory, a feed also needs these.
          </Text>
          <CoverArt channelId={channelId} imageAt={settings?.imageAt ?? null} />
          <Declarations channelId={channelId} settings={settings} />
        </>
      ) : (
        <Text style={type.muted}>
          Off, which is how every channel starts. Nothing here is reachable by
          anybody outside it.
        </Text>
      )}
    </>
  );
}

/**
 * The channel's cover art, which a podcast directory will not list a feed
 * without.
 *
 * **Nothing is validated here.** The rules are Apple's — square, 1400 to 3000
 * pixels, no transparency — the server enforces them in the words of the
 * rule, and a second copy in the app is a second copy to fall out of step.
 * What this does is show the refusal, which already names the rule and the
 * measurement that broke it.
 */
function CoverArt({
  channelId,
  imageAt,
}: {
  channelId: string;
  imageAt: number | null;
}) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const choose = async () => {
    if (!app.token) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await pickAndUploadArtwork(app.token, channelId);
      if (result.cancelled) return;
      setNote(
        result.width
          ? `Cover set — ${result.width}×${result.height}.`
          : 'Cover set.'
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'That did not work.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        label={busy ? 'Uploading…' : imageAt ? 'Replace cover art' : 'Add cover art'}
        sublabel={
          imageAt
            ? 'Square, 1400–3000 pixels, no transparency'
            : 'Square JPEG or PNG, 1400–3000 pixels, no transparency'
        }
        disabled={busy}
        onPress={() => void choose()}
      />
      {error ? <Text style={styles.warning}>{error}</Text> : null}
      {note ? <Text style={type.muted}>{note}</Text> : null}
    </>
  );
}

/**
 * The three things a directory requires that nothing can derive: the language
 * the conversations are in, whether they are explicit, and which of Apple's
 * categories this belongs under.
 *
 * Each control sends only its own field, so two of them changed in quick
 * succession cannot race each other into the same row.
 *
 * **The category list opens in place rather than in a picker.** Nineteen
 * options is a wall if it is always drawn and a modal is a screen this app
 * does not otherwise have; the recording row already establishes the idiom of
 * a control that opens to reveal the rest of itself.
 */
function Declarations({
  channelId,
  settings,
}: {
  channelId: string;
  settings?: {
    language: string | null;
    explicit: boolean | null;
    category: string | null;
    imageAt: number | null;
  };
}) {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [language, setLanguage] = useState(settings?.language ?? '');

  useEffect(() => setLanguage(settings?.language ?? ''), [settings?.language]);

  const send = (declarations: {
    language?: string | null;
    explicit?: boolean | null;
    category?: string | null;
  }) => {
    setError(null);
    void app
      .setChannelDeclarations(channelId, declarations)
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error ? failure.message : 'That did not work.'
        )
      );
  };

  return (
    <>
      <Field
        value={language}
        onChangeText={setLanguage}
        // Committed on blur rather than per keystroke, as the channel name
        // is: a language tag is three characters and a request each would be
        // three requests for one decision.
        onBlur={() => send({ language: language.trim() || null })}
        placeholder="en"
        autoCapitalize="none"
      />
      <Text style={type.muted}>
        The language these conversations are in, as a tag like “en” or
        “pt-BR”. Left empty, the feed says English.
      </Text>

      <Checkbox
        label="These conversations are explicit"
        checked={settings?.explicit === true}
        onChange={(next) => send({ explicit: next })}
      />

      <Button
        label={pickingCategory ? 'Done' : 'Category'}
        sublabel={settings?.category ?? 'Not set — a directory needs one'}
        onPress={() => setPickingCategory((open) => !open)}
      />
      {pickingCategory
        ? ITUNES_CATEGORIES.map((name) => (
            <Button
              key={name}
              label={name}
              variant={settings?.category === name ? 'primary' : 'default'}
              onPress={() => {
                // Tapping the one already chosen clears it, which is the only
                // way back to none — and a channel that is not being listed
                // has no reason to carry one.
                send({ category: settings?.category === name ? null : name });
                setPickingCategory(false);
              }}
            />
          ))
        : null}
      {error ? <Text style={styles.warning}>{error}</Text> : null}
    </>
  );
}

function GuestLinks({
  channelId,
  mayRevoke,
}: {
  channelId: string;
  /** `hasTheRoom`, which the server asks again in `revokeGuestLink`. */
  mayRevoke: boolean;
}) {
  const app = useApp();
  const [links, setLinks] = useState<GuestLinkSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    app
      .guestLinks(channelId)
      .then(setLinks)
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error ? failure.message : 'Could not read the links.'
        )
      );
  }, [app, channelId]);

  useEffect(load, [load]);

  if (error) return <Text style={styles.warning}>{error}</Text>;
  if (!links) return <Text style={type.muted}>Reading…</Text>;
  if (links.length === 0) {
    return (
      <Text style={type.muted}>
        No guest links yet. The channel screen makes one and hands it to the
        share sheet.
      </Text>
    );
  }

  return (
    <>
      {links.map((link) => (
        <View key={link.token} style={styles.linkRow}>
          <View style={styles.linkText}>
            <Text style={type.body} numberOfLines={1}>
              {link.url.replace(/^https?:\/\//, '')}
            </Text>
            <Text style={type.muted}>
              {link.revokedAt === null
                ? 'Open — anybody with it can knock'
                : link.revokedBy === null
                  ? 'Closed when the channel emptied'
                  : 'Revoked'}
            </Text>
          </View>
          {link.revokedAt === null ? (
            <Button
              label="Revoke"
              disabled={!mayRevoke}
              onPress={() => {
                void app
                  .revokeGuestLink(channelId, link.token)
                  .then(load)
                  .catch(() => setError('That did not work.'));
              }}
            />
          ) : null}
        </View>
      ))}
      <Text style={type.muted}>
        {mayRevoke
          ? 'Revoking stops new people knocking. Anybody already in the channel stays until they leave or somebody removes them.'
          : 'Step in to revoke a link. Shutting a door onto a conversation is for whoever is in it.'}
      </Text>
    </>
  );
}

function countOf(n: number): string {
  return n === 1 ? 'its one recording' : `its ${n} recordings`;
}

/** Said in the warning, so it cannot disagree with what the server does. */
const RETENTION_DAYS = Math.round(DELETED_RETENTION_MS / (24 * 60 * 60 * 1000));

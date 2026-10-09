import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  DELETED_RETENTION_MS,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_COMMUNITY_MEMBERS,
} from '../../../core/constants';
import {
  canEditChannel,
  canInviteGuest,
  canMakeCommunity,
  capacityOf,
  isOwner,
} from '../../../core/channel';
import {
  DEFAULT_NOTIFICATION_LEVEL,
  NOTIFICATION_LEVELS,
  type NotificationLevel,
} from '../../../core/notifications';
import type { ChannelState } from '../../../core/types';
import { API_URL } from '../api/config';
import { api, type GuestLinkSummary } from '../api/http';
import { pickAndUploadArtwork } from '../api/upload';
import { ITUNES_CATEGORIES } from '../../../core/publication';
import { useText } from '../i18n';
import { shareLink } from '../share';
import { openUrl } from './links';
import { useApp } from '../state/AppProvider';
import {
  Button,
  Card,
  Checkbox,
  Field,
  IconButton,
  Reveal,
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
 * **The description is here, and only for a podcast or a community** —
 * restored 2026-09-27 under *Podcast* (then *Public page*), and offered to a
 * community since 2026-10-04, whose page its link opens shows it too.
 *
 * It was the section under the name until 2026-09-12, when it left for the
 * channel screen's clipboard tab as the *notepad*: a sheet you may read but
 * must open another screen to write on is not a notepad. What that argument
 * left out is who the words are for. Nobody in the channel needs telling what
 * it is — they are in it — and the one place a description is actually read by
 * somebody who does not know is the *public page*, which is why it is offered
 * beside the switch that makes that page exist and is not offered at all to a
 * channel with no page. A private channel writing a blurb nobody will ever
 * see was the whole of what the tab amounted to.
 *
 * **A channel that goes private keeps what it wrote.** The field disappears;
 * `SET_DESCRIPTION` is unchanged and the row is not cleared, so turning the
 * page back on brings the same words back with it — the same bargain
 * `unpublishBody` strikes with the recordings' agreements.
 */
export function ChannelSettingsView({
  channel,
  derivedTitle,
  publicAt,
  publication,
  mayTranscribeLive = false,
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
  /**
   * Whether this reader may turn the live transcript on, which is what draws
   * the switch at all. Per reader, on the snapshot, for `publicAt`'s reason;
   * see `ChannelView.mayTranscribeLive`.
   */
  mayTranscribeLive?: boolean;
  onBack: () => void;
  /** Called once membership is given up, to get off this channel's screens. */
  onLeft: () => void;
}) {
  const t = useText().channelSettings;
  const shared = useText().shared;
  const app = useApp();
  /**
   * Held locally as well as on the snapshot, so the On/Off pair answers the
   * press rather than the round trip. The snapshot is the authority and arrives
   * moments later; this is initialised from it and replaced by what the
   * server actually stored.
   */
  const [isPublic, setIsPublic] = useState(publicAt !== null);
  useEffect(() => setIsPublic(publicAt !== null), [publicAt]);
  // Alone, the same tap destroys the channel rather than merely removing you
  // from it. Nothing else on screen would say so.
  const lastMember = channel.participants.length === 1;
  /**
   * A community's owner, who has *Delete* where everybody else has *Leave*,
   * and alone holds its link — see `ChannelState.owner`.
   */
  const owner = isOwner(channel, app.me?.id ?? '');
  /** Whether this is a *community* at all, which a channel is for good. */
  const community = channel.owner !== undefined;
  /**
   * The two ways a channel faces outward, of which it is at most one: each
   * has a page found by its name and showing its description, so both keep a
   * name and both are offered the description.
   */
  const facesOut = isPublic || community;
  /** Whether the tap at the foot of the screen destroys rather than leaves. */
  const deletes = lastMember || owner;
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
  const [description, setDescription] = useState(channel.description ?? '');
  /**
   * Whether the description's box has the keyboard up, which is the only thing
   * `Reveal` needs to know. Focus rather than a mode: this is a field on a
   * settings screen and not a sheet behind an *Edit*, so there is nothing to
   * open — what there is, is a card near the foot of a long screen that the
   * keyboard covers. See `useRevealOnKeyboard`, which listens only while this
   * is true, and so leaves the name field at the top of the screen alone.
   */
  const [writing, setWriting] = useState(false);

  /**
   * What the channel already has, so leaving a field alone dispatches nothing.
   */
  const saved = useRef({
    name: channel.name ?? '',
    description: channel.description ?? '',
  });

  /**
   * **The field follows a name that changed elsewhere** — somebody else's
   * rename, the server's trim, or a channel named by becoming a *community* —
   * unless somebody is halfway through typing over it here. It used to be read
   * once, so a channel named by *Make it a community* went on showing the old
   * name under the new link until the screen was left.
   */
  useEffect(() => {
    const now = channel.name ?? '';
    const was = saved.current.name;
    if (now === was) return;
    saved.current.name = now;
    setName((field) => (field === was ? now : field));
  }, [channel.name]);

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
   * answers with the same state. See planning/decision/2026-09-16-being-offline-is-one-state.md.
   */
  const persist = () => {
    if (!mayEdit) return;
    /**
     * **A public channel keeps its name**, and the field is put back rather
     * than the action sent. The server refuses this too — `SET_NAME` with an
     * empty name on a public channel comes back `conflict` — but that refusal
     * is said on the channel, after this screen has closed, and here the
     * field would sit there empty looking saved until the next snapshot took
     * it back. Restoring it is what makes the sentence under the field true at
     * the moment somebody reads it.
     */
    if (facesOut && name.trim() === '') {
      setName(saved.current.name);
      return;
    }
    if (name !== saved.current.name) {
      if (app.act(channel.id, { type: 'SET_NAME', name })) {
        saved.current.name = name;
      }
    }
    /**
     * On the same terms, `saved` moving only when the action left: a
     * description typed while the socket was down is retried by the next blur
     * or by *Close*, which is what the name's note above is about.
     */
    if (description !== saved.current.description) {
      if (app.act(channel.id, { type: 'SET_DESCRIPTION', description })) {
        saved.current.description = description;
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
   * unless `channel.action` is acknowledged, which was weighed and not built.
   * What the registry refuses is said on the channel instead; see
   * planning/decision/2026-10-03-a-refused-channel-action-is-said-on-the-channel.md.
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
      t.leaveAsk(),
      t.leaveBody(
        recordingCount === 0 ? null : t.countOf(recordingCount),
        recordingCount === 1
      ),
      [
        { text: t.cancel(), style: 'cancel' },
        {
          text: t.leave(),
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
      t.deleteAsk(),
      // An owner deleting a community with people in it is ending it for
      // them too, which the last member's sentence would not say.
      owner && !lastMember
        ? t.communityDeleteBody(
            channel.participants.length,
            recordingCount === 0 ? null : t.countOf(recordingCount)
          )
        : t.deleteBody(recordingCount === 0 ? null : t.countOf(recordingCount)),
      [
        { text: t.cancel(), style: 'cancel' },
        {
          text: t.continueLabel(),
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              t.deleteForGood(
                recordingCount === 0 ? null : t.countOf(recordingCount)
              ),
              t.deleteForGoodBody(RETENTION_DAYS),
              [
                { text: t.cancel(), style: 'cancel' },
                {
                  text: t.deleteConfirm(),
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
        <Text style={type.heading}>{t.title()}</Text>
        {/* "Close" rather than "Channel". Naming the destination reads well
            until there are three settings screens and each names a different
            place — then the one word every one of them shares is the act, and
            the reader stops having to check which screen they are on to know
            what the button does. *Back* was that word until there were two
            layouts, and it names a destination by implication; see
            HomeSettingsView, which carries the argument. */}
        <IconButton
          label={shared.close()}
          icon={(color) => <CloseIcon color={color} />}
          onPress={done}
        />
      </View>

      <SectionLabel>{t.channelName()}</SectionLabel>
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
          {!mayEdit
            ? community && !owner
              ? t.ownerOnly()
              : t.renameStepIn()
            : community
              ? t.renameCommunity()
              : facesOut
                ? t.renamePublic()
                : t.renamePrivate()}
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
      <SectionLabel>{t.recording()}</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.heading}>{t.recordAutomatically()}</Text>
        <View style={styles.choices}>
          {(
            [
              [true, t.on()],
              [false, t.off()],
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
        <Text style={type.muted}>{t.autoRecordNote()}</Text>
        <Text style={type.muted}>
          {mayEdit
            ? t.autoRecordHow()
            : community && !owner
              ? t.ownerOnly()
              : t.autoRecordStepIn()}
        </Text>
      </Card>

      {/*
        The live transcript, and only for somebody who may switch it — the
        house pays, and until somebody else can there is nobody else to show
        it to. Not an action through the reducer, unlike the pair above: who
        may is an account mark the channel state has never heard of, so the
        server's route checks it and the snapshot carries the answer back.
      */}
      {mayTranscribeLive ? (
        <>
          <SectionLabel>{t.liveTranscript()}</SectionLabel>
          <Card style={styles.stack}>
            <View style={styles.choices}>
              {(
                [
                  [true, t.on()],
                  [false, t.off()],
                ] as Array<[boolean, string]>
              ).map(([value, label]) => (
                <Button
                  key={label}
                  label={label}
                  style={styles.choice}
                  variant={!!channel.liveTranscription === value ? 'primary' : 'default'}
                  onPress={() => {
                    if (!app.token) return;
                    api
                      .setLiveTranscription(app.token, channel.id, value)
                      .catch((e: unknown) =>
                        Alert.alert(
                          t.liveTranscript(),
                          e instanceof Error ? e.message : String(e)
                        )
                      );
                  }}
                />
              ))}
            </View>
            <Text style={type.muted}>{t.liveTranscriptNote()}</Text>
            <Text style={type.muted}>{t.liveTranscriptOnlyYou()}</Text>
          </Card>
        </>
      ) : null}

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
      <SectionLabel>{t.notifications()}</SectionLabel>
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
        anybody at all can find. The two belong together — they are the only
        two ways anything here leaves the channel — and the bigger one is read
        first.
      */}
      <SectionLabel>{t.podcast()}</SectionLabel>
      <Card style={styles.stack}>
        {/*
          A community is never a podcast too — the server refuses it in both
          directions — so it is told why rather than shown a switch that would
          only be refused. Still drawn, since the screen is where somebody
          learns there are two ways a channel faces outward.
        */}
        {community ? (
          <>
            <Text style={type.heading}>{t.isAPodcast()}</Text>
            <Text style={type.muted}>{t.communityNotPodcast()}</Text>
          </>
        ) : (
          <Publishing
            channelId={channel.id}
            isPublic={isPublic}
            named={channel.name !== null}
            settings={publication}
            onChanged={(next) => setIsPublic(next)}
          />
        )}
      </Card>

      {/*
        The channel's description, which only a channel with a public page is
        offered — see the head of this file for why, and `isPublic` for why the
        answer is held locally as well as on the snapshot: the card appears on
        the press that turns the page on rather than a round trip later.

        Under the Podcast card rather than above it, and outside it rather
        than inside `Publishing`: what to write depends on there being a page,
        so the page comes first, and the field is this screen's to persist on
        the same terms as the name — `Publishing` owns a pair of buttons and an
        HTTP call and has no business owning a third piece of channel state.

        Plain text and no preview. The markdown parser this field carried until
        2026-09-13 went with the words; the cap is kept, that being the
        server's rule rather than a flourish.
      */}
      {facesOut ? (
        <>
          {/*
            Brought into view when the keyboard opens over it, label and all:
            the unit is what has to be visible, and a reveal that stopped at
            the field would leave the character count under the keyboard. It
            is the fifth card down a screen that scrolls, which is why this one
            has it and the name at the top does not.
          */}
          <Reveal when={writing}>
            <SectionLabel>{t.description()}</SectionLabel>
            <Card style={styles.stack}>
              <Field
                value={description}
                onChangeText={(v) =>
                  setDescription(v.slice(0, MAX_CHANNEL_DESCRIPTION_LENGTH))
                }
                placeholder={t.descriptionPlaceholder()}
                autoCapitalize="sentences"
                multiline
                editable={mayEdit}
                onFocus={() => setWriting(true)}
                onBlur={() => {
                  setWriting(false);
                  persist();
                }}
              />
              <Text style={type.muted}>
                {mayEdit
                  ? community
                    ? t.communityDescriptionNote()
                    : t.descriptionNote()
                  : community && !owner
                    ? t.ownerOnly()
                    : t.descriptionStepIn()}
              </Text>
              <Text style={styles.count}>
                {description.length} / {MAX_CHANNEL_DESCRIPTION_LENGTH}
              </Text>
            </Card>
          </Reveal>
        </>
      ) : null}

      {/*
        The other way a channel faces outward, after the podcast: a door to
        the membership rather than a page for anybody. Offered to make only to
        a channel of one — `canMakeCommunity` — and otherwise not drawn on a
        channel that is not one, since nothing anybody could do here would
        change that.
      */}
      {community || canMakeCommunity(channel, app.me?.id ?? '') ? (
        <>
          <SectionLabel>{t.community()}</SectionLabel>
          <Card style={styles.stack}>
            {community ? (
              <>
                <Text style={type.heading}>{t.isACommunity()}</Text>
                <Text style={type.muted}>
                  {owner
                    ? t.communityOwnerWhat(capacityOf(channel))
                    : t.communityMemberWhat(capacityOf(channel))}
                </Text>
              </>
            ) : isPublic ? (
              <Text style={type.muted}>{t.podcastNotCommunity()}</Text>
            ) : (
              <MakeCommunity channel={channel} />
            )}
          </Card>
          {owner ? (
            <>
              <SectionLabel>{t.communityLink()}</SectionLabel>
              <Card style={styles.stack}>
                <CommunityLink
                  channelId={channel.id}
                  name={channel.name}
                  capacity={capacityOf(channel)}
                />
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <SectionLabel>{t.guestLinks()}</SectionLabel>
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
          mayRevoke={canInviteGuest(channel, app.me?.id ?? '')}
          ownersAlone={community && !owner}
        />
      </Card>

      {/*
        Last, and plain. The confirmation carries the weight — colouring the
        button itself would put the loudest thing on the screen on the rarest
        action. The exception is being the last member, where the tap really
        does destroy something, and the colour is then telling the truth.
      */}
      <SectionLabel>{deletes ? t.deleting() : t.leaving()}</SectionLabel>
      <Card style={styles.stack}>
        <Button
          label={deletes ? t.deleteChannel() : t.leaveChannel()}
          sublabel={
            lastMember
              ? recordingCount === 0
                ? t.lastMemberNoRecordings()
                : t.lastMemberWithRecordings(t.countOf(recordingCount))
              : owner
                ? undefined
                : recordingCount === 0
                  ? t.removesFromHome()
                  : t.removesFromHomeWith(t.countOf(recordingCount))
          }
          variant={deletes ? 'danger' : 'default'}
          onPress={() => (deletes ? confirmDelete() : confirmLeave())}
        />
        <Text style={type.muted}>
          {owner && !lastMember ? t.ownerCannotLeave() : t.steppingOutInstead()}
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
  /** The description's character count, under the field. */
  count: {
    ...type.muted,
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
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
  const levels = useText().notificationLevel;
  const t = useText().channelSettings;
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
            : t.couldNotChange()
        );
      }
    );
  };

  return (
    <>
      {NOTIFICATION_LEVELS.map((option) => {
        const { label, detail } = levels[option]();
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
 * Whether this channel is a podcast — has a public page — and where it is.
 *
 * **Two decisions, and this is only the first of them.** Turning it on makes
 * a page exist; it puts nothing on that page. Every recording is agreed to
 * separately, by everybody who was in it, on its own card in the channel —
 * which is why the line under the pair says so rather than leaving somebody
 * to discover that their conversations did not appear.
 *
 * The address is shown rather than hidden behind a share sheet, because it is
 * the thing somebody came to this screen to get.
 *
 * **It is not a secret, and this copy used to imply that it was.** The page's
 * address carries an unguessable channel id, and until /podcasts existed that
 * made a public channel effectively unlisted — so the words here said "anyone
 * with the address", which was true and is no longer. Every public channel is
 * now listed on a page anybody can read, and the confirmation says so before
 * the page is made rather than after. See
 * `planning/decision/2026-09-22-a-public-channel-is-findable-rather-than-unlisted.md`.
 *
 * **An On/Off pair of buttons, not a checkbox**, since 2026-09-22 — the shape
 * the Recording card one above already uses, and STYLE.md § *Checkbox* gives
 * the reason in a line: a box is a question nobody has answered yet, a pair is
 * an answer in force. Whether this channel has a page is the second of those.
 *
 * **Both directions confirm through `Alert.alert`**, which is the other half
 * of the change. Going private used to happen on one tap, on the reasoning
 * that taking a page down is the safe direction — it is not, once anything has
 * subscribed to the feed, and the alert is where what stops answering gets
 * said. Neither button acts on the press itself.
 *
 * Pressing the one already in force does nothing: no call and no alert. A pair
 * says which is in force by drawing it `primary`, so the press has nothing
 * left to tell anybody.
 *
 * **On is refused until the channel has a name**, the server refusing the same
 * thing: the page and the directory row are read by strangers, an unnamed
 * channel is described by the people in it, and the one thing this page may
 * never say is who those are. The field to fix it with is the first card on
 * this screen, which is why the sentence points up at it rather than offering
 * anything here. `named` comes from the snapshot rather than from the field
 * above, so the button enables when the rename has actually landed — pressing
 * it is what blurs the field and sends it. **Off is never gated**: a channel
 * that lost its name somehow must still be able to take its page down.
 */
function Publishing({
  channelId,
  isPublic,
  named,
  settings,
  onChanged,
}: {
  channelId: string;
  isPublic: boolean;
  /** Whether anybody has named this channel. See the note above. */
  named: boolean;
  settings?: {
    language: string | null;
    explicit: boolean | null;
    category: string | null;
    imageAt: number | null;
  };
  /** Called with the new state, so the screen's own copy stays in step. */
  onChanged: (next: boolean, url: string | null) => void;
}) {
  const t = useText().channelSettings;
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const linkWords = useText().links;
  /**
   * The page's address: what the switch answered with, or else the one the
   * server builds — `/c/<id>` on its own origin — so a channel that was
   * already a podcast when this screen opened shows its page too, rather
   * than only after somebody presses the switch again.
   */
  const pageUrl = url ?? (API_URL ? `${API_URL}/c/${channelId}` : null);
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
        failure instanceof Error ? failure.message : t.thatDidNotWork()
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={type.heading}>{t.isAPodcast()}</Text>
      <View style={styles.choices}>
        <Button
          label={t.on()}
          style={styles.choice}
          variant={isPublic ? 'primary' : 'default'}
          // Grey while the channel has no name, and while a call is in flight.
          // Not while it is already on: a pair says which one is in force by
          // drawing it `primary`, and greying that one as well would read as
          // the setting being unavailable rather than as settled.
          disabled={busy || (!isPublic && !named)}
          onPress={() => {
            // The button is disabled on both counts too, and this is the
            // braces to that belt: the two facts are a component apart, the
            // same reasoning `persist` gives for guarding a field it has
            // already made uneditable.
            if (busy || isPublic || !named) return;
            Alert.alert(
              t.publishAsk(),
              t.publishBody(),
              [
                { text: t.notNow(), style: 'cancel' },
                { text: t.createThePage(), onPress: () => void set(true) },
              ]
            );
          }}
        />
        <Button
          label={t.off()}
          style={styles.choice}
          variant={isPublic ? 'default' : 'primary'}
          disabled={busy}
          onPress={() => {
            if (busy || !isPublic) return;
            Alert.alert(
              t.unpublishAsk(),
              t.unpublishBody(),
              [
                { text: t.keepThePage(), style: 'cancel' },
                {
                  text: t.takeItDown(),
                  style: 'destructive',
                  onPress: () => void set(false),
                },
              ]
            );
          }}
        />
      </View>
      {busy ? <Text style={type.muted}>{t.saving()}</Text> : null}
      {error ? <Text style={styles.warning}>{error}</Text> : null}
      {isPublic ? (
        <>
          {pageUrl ? (
            <>
              <Text style={type.body} numberOfLines={1}>
                {pageUrl.replace(/^https?:\/\//, '')}
              </Text>
              <Button
                label={t.openPage()}
                onPress={() => void openUrl(pageUrl, linkWords)}
              />
            </>
          ) : null}
          <Text style={type.muted}>{t.pageNote()}</Text>
          {/*
            Everything below is only needed by a channel that wants to be
            findable in Apple or Spotify. The page and the feed work without
            any of it — a feed is pasted into an app by somebody who was given
            the address — so it is grouped under one sentence saying so rather
            than presented as four things left undone.
          */}
          <Text style={type.muted}>{t.directoryNeedsThese()}</Text>
          <CoverArt channelId={channelId} imageAt={settings?.imageAt ?? null} />
          <Declarations channelId={channelId} settings={settings} />
        </>
      ) : named ? (
        <Text style={type.muted}>{t.publicOffNote()}</Text>
      ) : (
        <Text style={type.muted}>{t.nameItFirst()}</Text>
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
  const t = useText().channelSettings;
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
          ? t.coverSetAt(result.width, result.height ?? 0)
          : t.coverSet()
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t.thatDidNotWork()
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        label={
          busy ? t.uploading() : imageAt ? t.replaceCoverArt() : t.addCoverArt()
        }
        sublabel={imageAt ? t.coverRulesShort() : t.coverRules()}
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
  const t = useText().channelSettings;
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
          failure instanceof Error ? failure.message : t.thatDidNotWork()
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
        placeholder={t.languagePlaceholder()}
        autoCapitalize="none"
      />
      <Text style={type.muted}>{t.languageNote()}</Text>

      <Checkbox
        label={t.explicit()}
        checked={settings?.explicit === true}
        onChange={(next) => send({ explicit: next })}
      />

      <Button
        label={pickingCategory ? t.done() : t.category()}
        sublabel={settings?.category ?? t.categoryUnset()}
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
  ownersAlone,
}: {
  channelId: string;
  /** `canInviteGuest`, which the server asks again in `revokeGuestLink`. */
  mayRevoke: boolean;
  /** A community whose controls are somebody else's: see `holdsTheControls`. */
  ownersAlone: boolean;
}) {
  const t = useText().channelSettings;
  const app = useApp();
  const [links, setLinks] = useState<GuestLinkSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    app
      .guestLinks(channelId)
      .then(setLinks)
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error ? failure.message : t.couldNotReadLinks()
        )
      );
  }, [app, channelId]);

  useEffect(load, [load]);

  if (error) return <Text style={styles.warning}>{error}</Text>;
  if (!links) return <Text style={type.muted}>{t.reading()}</Text>;
  if (links.length === 0) {
    return (
      <Text style={type.muted}>{t.noGuestLinksYet()}</Text>
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
                ? t.linkOpen()
                : link.revokedBy === null
                  ? t.linkClosedWhenEmptied()
                  : t.linkRevoked()}
            </Text>
          </View>
          {link.revokedAt === null ? (
            <Button
              label={t.revoke()}
              disabled={!mayRevoke}
              onPress={() => {
                void app
                  .revokeGuestLink(channelId, link.token)
                  .then(load)
                  .catch(() => setError(t.thatDidNotWork()));
              }}
            />
          ) : null}
        </View>
      ))}
      <Text style={type.muted}>
        {mayRevoke ? t.revokeNote() : ownersAlone ? t.ownerOnly() : t.revokeStepIn()}
      </Text>
    </>
  );
}

/**
 * A community's link, for its owner: what it is, sharing it, resetting it —
 * which revokes the old one — and turning it off.
 *
 * **No presence asked**, unlike the guest links above. A guest link opens a
 * room that is in use, so shutting it is a decision about a conversation; the
 * community link is a door to the membership, and it is the owner's alone.
 *
 * Both destructive controls confirm, since what they break is a link that is
 * already in other people's hands and cannot be taken back out of them.
 */
function CommunityLink({
  channelId,
  name,
  capacity,
}: {
  channelId: string;
  /** Read again when it changes, since a rename mints a new link. */
  name: string | null;
  capacity: number;
}) {
  const t = useText().channelSettings;
  const linkWords = useText().links;
  const app = useApp();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    app
      .communityLink(channelId)
      .then(setUrl)
      .catch(() => setError(t.couldNotReadLink()));
  }, [app, channelId, name]);

  const change = (open: boolean) =>
    void app
      .setCommunityLink(channelId, open)
      .then(setUrl)
      .catch(() => setError(t.thatDidNotWork()));

  const confirm = (title: string, body: string, label: string, open: boolean) =>
    Alert.alert(title, body, [
      { text: t.cancel(), style: 'cancel' },
      { text: label, style: 'destructive', onPress: () => change(open) },
    ]);

  if (error) return <Text style={styles.warning}>{error}</Text>;
  if (url === undefined) return <Text style={type.muted}>{t.reading()}</Text>;
  if (url === null) {
    return (
      <>
        <Text style={type.muted}>{t.communityLinkOff()}</Text>
        <Button label={t.turnOnLink()} onPress={() => change(true)} />
      </>
    );
  }
  return (
    <>
      <Text style={type.body} numberOfLines={1}>
        {url.replace(/^https?:\/\//, '')}
      </Text>
      <Text style={type.muted}>{t.communityLinkNote(capacity)}</Text>
      {/*
        Out of the app to the page itself, which is what somebody given the
        link will see: a new tab on the web, the system browser on a phone —
        `Linking.openURL` does both, and `openUrl` says so if the OS refuses.
      */}
      <View style={styles.choices}>
        <Button
          style={styles.choice}
          label={t.shareLink()}
          onPress={() => void shareLink(url)}
        />
        <Button
          style={styles.choice}
          label={t.openPage()}
          onPress={() => void openUrl(url, linkWords)}
        />
      </View>
      <View style={styles.choices}>
        <Button
          style={styles.choice}
          label={t.resetLink()}
          onPress={() => confirm(t.resetLinkAsk(), t.resetLinkBody(), t.resetLink(), true)}
        />
        <Button
          style={styles.choice}
          label={t.turnOffLink()}
          onPress={() =>
            confirm(t.turnOffLinkAsk(), t.turnOffLinkBody(), t.turnOffLink(), false)
          }
        />
      </View>
    </>
  );
}

/**
 * *Make channel into a community*, on a channel its viewer is alone in —
 * the only way a community comes to exist, since 2026-10-04. It replaced
 * *Start a community* on Home, which sat under *Start a channel* and read as
 * though a community were something other than a channel.
 *
 * A button that opens into the choice rather than the choice from the start,
 * the card itself saying what it costs before the press; no second dialog,
 * nobody else being in the channel to be affected by it.
 *
 * **A name field only for an unnamed channel**, since 2026-10-05. A community
 * cannot exist without the name its link is read from, and a named channel
 * already has one: offering a field there read as a second name, and what it
 * did was rename the channel. The reducer keeps a name the channel has
 * whatever is sent, so this is the only place one can be given.
 *
 * Nothing to do on success: the snapshot carrying `owner` redraws this
 * screen as a community's, link and all.
 */
function MakeCommunity({ channel }: { channel: ChannelState }) {
  const t = useText().channelSettings;
  const app = useApp();
  const [open, setOpen] = useState(false);
  const named = channel.name !== null;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      await app.makeCommunity(channel.id, named ? '' : name.trim());
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.couldNotMakeCommunity());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={type.muted}>{t.makeCommunityNote(MAX_COMMUNITY_MEMBERS)}</Text>
      {open ? (
        <>
          {named ? null : (
            <>
              <Field
                value={name}
                onChangeText={(v) => setName(v.slice(0, MAX_CHANNEL_NAME_LENGTH))}
                placeholder={t.channelName()}
                autoCapitalize="words"
                autoFocus
                onSubmit={name.trim() && !busy ? () => void make() : undefined}
                submitLabel="done"
              />
              <Text style={type.muted}>{t.communityNeedsName()}</Text>
            </>
          )}
          <View style={styles.choices}>
            <Button
              style={styles.choice}
              label={t.cancel()}
              onPress={() => {
                setOpen(false);
                setName('');
              }}
            />
            <Button
              style={styles.choice}
              label={busy ? t.making() : t.makeIt()}
              variant="primary"
              disabled={(!named && !name.trim()) || busy}
              onPress={() => void make()}
            />
          </View>
        </>
      ) : (
        <Button label={t.makeCommunity()} onPress={() => setOpen(true)} />
      )}
      {error ? <Text style={styles.warning}>{error}</Text> : null}
    </>
  );
}

/** Said in the warning, so it cannot disagree with what the server does. */
const RETENTION_DAYS = Math.round(DELETED_RETENTION_MS / (24 * 60 * 60 * 1000));

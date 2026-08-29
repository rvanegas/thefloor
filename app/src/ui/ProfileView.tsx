import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ProfileView as Profile } from '../../../core/protocol';
import { describeChannel } from '../../../core/naming';
import { MAX_PING_TEXT_LENGTH } from '../../../core/constants';
import { copyText } from '../clipboard';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, Screen, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import {
  describeAvailability,
  describePresence,
  describeQuiet,
  sentence,
} from './availability';
import { duration } from './relativeTime';
import { colors, radius, spacing, type } from './theme';

/**
 * Somebody else's profile.
 *
 * Fetched rather than passed in, because the server decides who may see one —
 * a contact, or somebody in a channel with you — and a 404 is the honest
 * answer to both "no such person" and "not yours to read", deliberately, so
 * that account ids cannot be walked to find out which exist.
 *
 * Read-only, and a separate component from the settings screen that edits your
 * own. An editor that is sometimes read-only grows a conditional in every
 * field it holds.
 */
export function ProfileView({
  accountId,
  fallbackName,
  onBack,
  onEnterChannel,
  onPing,
  pingableAt = null,
  onRemoved,
}: {
  accountId: string;
  /**
   * What to show while the profile is in flight, and if it never arrives.
   *
   * The caller already knows this person's name — it is in the roster they
   * tapped — so there is no reason to show a spinner where a name belongs, or
   * to leave the screen anonymous when the fetch is refused.
   */
  fallbackName: string;
  onBack: () => void;
  /**
   * Opens a channel the two of you share. Omitted where going somewhere else
   * would be wrong — from inside a channel, which is the other way this screen
   * is reached — and the cards are then drawn as cards rather than as buttons.
   *
   * **The section itself does not depend on this.** It used to, and that is
   * why nobody ever saw it: neither caller in the app passes this, so a list
   * that only existed alongside it existed nowhere. Which channels you share
   * with somebody, and when they were last in each, is worth reading whether
   * or not this screen is the place to act on it.
   */
  onEnterChannel?: (channelId: string) => void;
  /**
   * Asks this person to come to the channel you are both in, in your words.
   *
   * Supplied only where a ping means something: from inside a channel, about
   * somebody who belongs to it and is not standing in it. Everywhere else the
   * section is left out rather than shown dead, the same way the channels
   * section is — an affordance that is present but refuses is worse than one
   * that is honestly absent.
   *
   * Rejects with a message meant to be read. The server refuses a ping for
   * ordinary reasons — they walked in a moment ago, somebody pinged them
   * already — and those are answers rather than faults.
   */
  onPing?: (text: string) => Promise<void>;
  /**
   * When this person may next be pinged in the channel this card was opened
   * from, or null when that is now. Only meaningful alongside `onPing`.
   */
  pingableAt?: number | null;
  /**
   * What to do when this person stops being a contact, which takes with it
   * every channel that held only the two of you — possibly the one this screen
   * was opened from. The caller is the only end that knows whether that is
   * where it is, so it decides where to go; the default is simply back.
   */
  onRemoved?: () => void;
}) {
  const app = useApp();
  /**
   * This screen showing you to yourself, reached from the settings screen so
   * somebody can read their own bio as a contact will read it — rendered,
   * rather than as the Markdown they typed.
   *
   * Derived here rather than passed in, because every caller would compute the
   * same comparison and one of them would eventually forget. What it changes is
   * only what is left out: the Contact card, which would offer to add you to
   * your own contacts. The availability line needs nothing — the server already
   * withholds it, on the grounds that you are the one person whose whereabouts
   * you know.
   */
  const isSelf = app.me?.id === accountId;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'refused'>('loading');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [pingText, setPingText] = useState('');
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [pingSent, setPingSent] = useState(false);
  const [removing, setRemoving] = useState(false);
  /** While the decision about your own address is in flight. */
  const [showingEmail, setShowingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  /**
   * Whether the last copy landed, and nothing else. The same three states and
   * the same 2.5s fade the channel's clipboard card uses, that being the
   * established way a refusal is reported here: `copyText` returns a boolean
   * precisely so that a copy which did not happen is not announced as one.
   */
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2_500);
    return () => clearTimeout(timer);
  }, [copied]);

  // Their standing with you, if any. Absent from the list means a stranger —
  // which, on a profile reached from a channel roster, is the whole point.
  const contact = (app.home?.contacts ?? []).find(
    (entry) => entry.account.id === accountId
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await app.loadProfile(accountId);
        if (cancelled) return;
        setProfile(found);
        setState('ready');
      } catch {
        // Refused and absent are the same answer by design, so this cannot
        // distinguish them either — and should not try to.
        if (!cancelled) setState('refused');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  /**
   * Channels the two of you are both in. Drawn from Home's own list rather
   * than fetched, because that list already *is* every live channel you belong
   * to — including the one you are standing in, which belongs here as much as
   * any other: a card saying they have not been in the room you are sitting in
   * for a week is the whole point of the section.
   *
   * So the profile carries no names, no rosters and no occupancy. What it adds
   * is `sharedChannels`, joined below on the id — where *they* have been in
   * each of these, which is the one fact a list about channels cannot hold.
   */
  const shared = (app.home?.rejoinable ?? []).filter((channel) =>
    channel.others.some((other) => other.id === accountId)
  );

  /**
   * Where they have been in each, by channel id.
   *
   * Absent for a server that predates the field, and the map is then simply
   * empty — every card falls back to describing the room, which is what these
   * cards said before there was anything better to say. An empty map and an
   * empty array are the same thing here only because a channel missing from
   * one is treated exactly as a channel missing from the other.
   *
   * As of when the screen opened, and deliberately not refreshed: it is
   * fetched with the profile, so a card reading "Here now" goes on saying so
   * if they walk out while it is on screen. The same is already true of the
   * availability line at the top, for the same reason, and the alternative is
   * a request per snapshot to keep a card fresher than the screen it is on.
   * The room's own half of the line is live, coming from Home.
   */
  const presence = new Map(
    (profile?.sharedChannels ?? []).map((entry) => [entry.channelId, entry])
  );

  const ask = async () => {
    setAsking(true);
    setAskError(null);
    try {
      await app.connectWith(accountId);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  /**
   * Ends the contact, after saying what that costs.
   *
   * Confirmed rather than done, and the confirmation names both consequences
   * because neither is guessable from the button: it is mutual — the contacts
   * row *is* the pair, so they lose you as you lose them — and it leaves every
   * channel that held only the two of you. Channels with anybody else in them
   * are untouched, which is the reassurance worth giving in the same breath.
   */
  const removeContact = () => {
    const name = profile?.account.displayName ?? fallbackName;
    Alert.alert(
      `Remove ${name}?`,
      `You will each stop being the other's contact, and you will leave the ` +
        `channels that hold only the two of you. Channels with other people ` +
        `in them are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setRemoving(true);
            setAskError(null);
            app
              .removeContact(accountId)
              .then(() => (onRemoved ?? onBack)())
              .catch((e: unknown) => {
                setAskError(e instanceof Error ? e.message : String(e));
                setRemoving(false);
              });
          },
        },
      ]
    );
  };

  /**
   * Shows your own address to this person, or stops.
   *
   * The profile is re-read rather than patched in place, because the server is
   * what decides the answer and this screen has just changed something it
   * derives from. Patching would work today and would be a second copy of the
   * rule the moment showing it stops being the only thing that sets the field.
   */
  const setEmailShown = async (shown: boolean) => {
    setShowingEmail(true);
    setEmailError(null);
    try {
      await app.setEmailShown(accountId, shown);
      setProfile(await app.loadProfile(accountId));
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : String(e));
    } finally {
      setShowingEmail(false);
    }
  };

  const sendPing = async () => {
    if (!onPing) return;
    setPinging(true);
    setPingError(null);
    try {
      await onPing(pingText.trim());
      // Cleared on the way out so that reopening the card does not offer to
      // send the same words again, which the interval would refuse anyway.
      setPingText('');
      setPingSent(true);
    } catch (e) {
      setPingError(e instanceof Error ? e.message : String(e));
    } finally {
      setPinging(false);
    }
  };

  /**
   * `inApp` first, because it is a fact where the line below it is an
   * inference. Somebody sitting in a channel for an hour is in the app, and a
   * time subtracted from this device's clock reads as an hour idle for exactly
   * as long as this screen has gone without a snapshot — which is the whole of
   * what the old contact row got wrong.
   */
  const availability = describeAvailability(profile, app.serverNow());

  /**
   * How long until this person may be pinged again, or null when they may be
   * now.
   *
   * Recomputed on every render rather than held in state, which is what makes
   * it count down: a held channel snapshot re-renders twice a second, so this
   * ages on its own without a timer of its own. Clamped by the comparison
   * rather than by arithmetic — a window that has passed is not a wait of zero,
   * it is no wait at all, and the composer comes back.
   */
  const pingWait =
    pingableAt !== null && pingableAt > app.serverNow()
      ? pingableAt - app.serverNow()
      : null;

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading} numberOfLines={1}>
          {profile?.account.displayName ?? fallbackName}
        </Text>
        <Button label="Back" variant="ghost" onPress={onBack} />
      </View>

      {/*
        Somebody who belongs to this channel and is not in it. The one
        notification in the app that a person composes and aims, so it is the
        one place worth spending a text field on.

        Words are optional. An empty ping still says somebody is asking for
        you, which is the whole of what most pings mean, and requiring a
        sentence would make the common case the slow one.

        First on the screen, above even the availability lines. It is drawn
        only from inside a channel they are missing from, which is a screen
        opened to do something rather than to read something — and the one
        thing there is to do should not be under everything there is to read.
      */}
      {onPing ? (
        <>
          <SectionLabel>Ping</SectionLabel>
          <Card style={styles.stack}>
            {pingSent || pingWait !== null ? (
              // Two facts, either of which replaces the composer: they have
              // just sent one, or somebody has. The confirmation does not wait
              // on the countdown — a snapshot is half a second away and the
              // words have already gone, so hanging "Sent" on the server
              // having told us the window would leave the screen looking as
              // though it had lost them. When the window *is* known it is said
              // as a length rather than a moment; when it is not, the sentence
              // this said before the countdown existed is still true.
              <Text style={type.muted}>
                {pingSent ? 'Sent.' : 'They have just been pinged.'}
                {pingWait !== null
                  ? ` You can ping them again in ${duration(pingWait)}.`
                  : ' They will not be pinged again for a few minutes.'}
              </Text>
            ) : (
              <>
            <Field
              value={pingText}
              onChangeText={(v) => {
                setPingText(v.slice(0, MAX_PING_TEXT_LENGTH));
                // The confirmation belongs to the ping that was sent, not to
                // the field; typing again is the start of a different one.
                setPingSent(false);
              }}
              placeholder="Anything you want to say (optional)"
              autoCapitalize="sentences"
            />
            <View style={styles.pingFoot}>
              <Text style={type.muted}>
                {pingText.length > 0
                  ? `${MAX_PING_TEXT_LENGTH - pingText.length} left`
                  : 'They will get a notification.'}
              </Text>
              <Button
                label={pinging ? 'Sending…' : 'Send ping'}
                variant="primary"
                disabled={pinging}
                onPress={() => void sendPing()}
              />
            </View>
              </>
            )}
            {pingError ? <Text style={styles.error}>{pingError}</Text> : null}
          </Card>
        </>
      ) : null}

      {/*
        Where they are, which is what decides whether to try them at all. It
        lived on Home's contact rows until Home became a list of channels, and
        it is here rather than nowhere because a channel's idleness is a
        different fact: a room nobody has been in for a week says nothing about
        whether its other member is holding a phone right now.

        Only a contact is told, which is exactly the audience the contact rows
        had. The server withholds both fields from anybody else, so an absent
        pair is a stranger, an acquaintance from a shared channel, or a server
        that predates this — and all three get no line rather than a hedge.
      */}
      {/*
        How many people are here because of them, counting onwards: the people
        they invited, the people those people invited, and so on. It sits with
        availability rather than in the card because it is a fact about the
        account, where the card is prose they wrote.

        Shown at zero as well, which is deliberate. It is a count rather than a
        badge, and a line that appears only once it is flattering turns
        everybody's first week into a screen with something missing from it.
        What is not shown is an *absent* count — a server too old to send one —
        since a nought it never claimed would be a number we made up.
      */}
      <View style={styles.facts}>
        {availability ? (
          <Text style={type.muted}>{availability}</Text>
        ) : null}
        {profile?.invited !== undefined ? (
          <Text style={type.muted}>{`Invited ${profile.invited}`}</Text>
        ) : null}
        {/*
          Who invited them, and only ever a name you already know: the server
          sends this when the inviter is you or one of your contacts, and sends
          nothing otherwise. So there is no case to handle here where the name
          would be a stranger's — absent means there is no line, whether that
          is because nobody invited them, because you do not know who did, or
          because the server predates the field.
        */}
        {profile?.invitedBy ? (
          <Text style={type.muted} numberOfLines={1}>
            {`Invited by ${profile.invitedBy.displayName}`}
          </Text>
        ) : null}
      </View>

      <Card style={styles.stack}>
        {state === 'loading' ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : profile?.bio ? (
          <InlineMarkdown text={profile.bio} style={styles.bio} />
        ) : (
          <Text style={type.muted}>
            {state === 'refused'
              ? 'There is no profile here to show you.'
              : isSelf
                ? 'You have not written anything about yourself yet. The field is on the settings screen.'
                : 'They have not written anything about themselves yet.'}
          </Text>
        )}
      </Card>

      {/*
        Every channel the two of you share, and when they were last in each.

        Left out for your own profile, the same way the Contact card is: it
        would be Home's list of your own channels with your own name against
        every line, which is a screen you already have.
      */}
      {isSelf || shared.length === 0 ? null : (
        <>
          <SectionLabel>Channels with them</SectionLabel>
          <View style={styles.stack}>
            {shared.map((channel) => {
              const title =
                channel.name ??
                describeChannel(channel.others.map((o) => o.displayName));
              const where = presence.get(channel.channelId);
              /*
                Where they have been, and — when it is a different fact — how
                many people are in the room. Theirs comes first and is always
                drawn, this screen being about them; the count is appended only
                when there is somebody to count, since a card reading "Last
                here 2 days ago" while three people were talking in there would
                be true and would be withholding the reason to tap it.

                The second branch is the line these cards drew before a profile
                carried anything about the person, kept for a server that sends
                no `sharedChannels`. It describes the room: it said "Nobody
                here right now" for any empty channel whatever its age, so the
                room Home called five minutes ago was described here as merely
                empty, and a contact channel neither of you has ever opened
                claimed to have been left.
              */
              const line = where
                ? [
                    describePresence(where, app.serverNow()),
                    channel.presentCount > 0
                      ? `${channel.presentCount} present`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : channel.presentCount > 0
                  ? `${channel.presentCount} present`
                  : sentence(
                      describeQuiet(
                        {
                          everUsed: channel.everUsed,
                          // `lastActiveAt` for a server that predates the
                          // better stamp, as on Home: the same answer for
                          // every channel nobody is in, which is the only
                          // kind this line is drawn for.
                          lastPresenceAt:
                            channel.lastPresenceAt ?? channel.lastActiveAt,
                        },
                        app.serverNow()
                      ) ?? ''
                    );
              const body = (
                <>
                  <Text
                    style={channel.name ? type.body : styles.channelDescribed}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text style={type.muted}>{line}</Text>
                </>
              );
              /*
                A card rather than a button where there is nowhere to go: from
                inside a channel this screen is something to read, and an
                affordance that is present but refuses is worse than one that
                is honestly absent — the rule the ping section follows, applied
                to the tap rather than to the section, because the reading is
                worth having on its own.
              */
              return onEnterChannel ? (
                <Pressable
                  key={channel.channelId}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}. ${line}. Step in.`}
                  onPress={() => {
                    // The same tap Home's rows take, preference and all: with
                    // "Tap a channel to step in" off, this opens the channel
                    // without arriving in it. Two lists of the same channels
                    // answering a tap differently would be a setting that held
                    // in one place and not the other.
                    if (app.tapToStepIn) {
                      app.act(channel.channelId, { type: 'ENTER' });
                    }
                    onEnterChannel(channel.channelId);
                  }}
                  style={({ pressed }) => [
                    styles.channel,
                    pressed && styles.channelPressed,
                  ]}
                >
                  {body}
                </Pressable>
              ) : (
                <View key={channel.channelId} style={styles.channel}>
                  {body}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/*
        Addresses, which are two separate decisions and are drawn as two.

        Theirs is above yours because it is the half you might act on — an
        address you have been given is a thing to copy, and a thing you have
        given is a thing you already know. Neither half implies the other:
        somebody showing you theirs has not asked for yours, and there is no
        control here that would let them.

        Contacts only, matching the server, which refuses the same call from
        anybody else. Somebody met in a channel an acquaintance opened can be
        asked to be a contact — the card below does that — and this is a step
        past it rather than part of it.
      */}
      {isSelf || contact?.status !== 'accepted' ? null : (
        <>
          <SectionLabel>Email</SectionLabel>
          <Card style={styles.stack}>
            {profile?.email ? (
              <>
                {/* Selectable, because an address on a screen is something
                    people reach for by hand when a button is not enough — and
                    the button is the fallback rather than the only way. */}
                <Text style={type.body} selectable numberOfLines={1}>
                  {profile.email}
                </Text>
                <Button
                  label={
                    copied === 'done'
                      ? '✓ copied'
                      : copied === 'failed'
                        ? '✗ copy failed'
                        : 'Copy'
                  }
                  variant="primary"
                  onPress={() => {
                    void (async () => {
                      setCopied(
                        (await copyText(profile.email!)) ? 'done' : 'failed'
                      );
                    })();
                  }}
                />
              </>
            ) : (
              // Said rather than left blank, so the empty half of the card is
              // an answer instead of a gap somebody reads as a bug. It is also
              // what makes the two halves legible as independent: yours is
              // below and may well be shown.
              <Text style={type.muted}>
                They are not showing you their email.
              </Text>
            )}

            <View style={styles.rule} />

            {profile?.myEmailShown ? (
              <>
                <Text style={type.muted}>They can see your email.</Text>
                <Button
                  label={showingEmail ? 'Hiding…' : 'Stop showing my email'}
                  variant="ghost"
                  disabled={showingEmail}
                  onPress={() => void setEmailShown(false)}
                />
                {/* The one thing the button cannot do, said where it is about
                    to be pressed. Stopping ends the standing ability to come
                    back for the address; it does not reach into anywhere they
                    have already written it down. */}
                <Text style={type.muted}>
                  They will not be able to see it again — though they may
                  already have it written down somewhere.
                </Text>
              </>
            ) : (
              <>
                <Button
                  label={showingEmail ? 'Showing…' : 'Show my email'}
                  disabled={showingEmail}
                  onPress={() => void setEmailShown(true)}
                />
                <Text style={type.muted}>
                  Show my email to this contact.
                </Text>
              </>
            )}
            {emailError ? (
              <Text style={styles.error}>{emailError}</Text>
            ) : null}
          </Card>
        </>
      )}

      {/*
        Meeting somebody in a channel an acquaintance opened is exactly when
        you want to keep them, and until there was an "Add contact" here there
        was no way to: you had their name and their id, and adding a contact
        needed an address they had not given you.

        Being in a channel together is permission to ask, not consent to be
        anybody's contact — so this sends a request like any other, and they
        decide.

        Left out entirely when this is you. Every branch below is about the
        relationship between two people, and there is no such relationship to
        report or to change — "Add contact" aimed at yourself is the one the
        screen would otherwise offer, since you are not among your own
        contacts.

        Last on the screen, under Email rather than over it. Three of the four
        branches below belong to somebody who is not a contact yet, and the
        Email card is drawn only for somebody who is — so the two never
        compete for the position, and putting this one at the foot costs a
        stranger's "Add contact" nothing while keeping "Remove contact" away
        from the top of a screen opened to read about a person.
      */}
      {isSelf ? null : (
        <>
          <SectionLabel>Contact</SectionLabel>
          <Card style={styles.stack}>
            {contact?.status === 'accepted' ? (
              <>
                <Text style={type.muted}>Already one of your contacts.</Text>
                {/*
                  Plain, the way "Leave channel" is in ChannelSettingsView, and
                  on the same reasoning: the confirmation carries the weight,
                  and colouring the button would put the loudest thing on the
                  screen on its rarest action. Red is kept for the taps that
                  really do destroy something — deleting an account, deleting a
                  recording — and forgetting somebody is not one of them.
                */}
                <Button
                  label={removing ? 'Removing…' : 'Remove contact'}
                  disabled={removing}
                  onPress={removeContact}
                />
              </>
            ) : contact?.status === 'outgoing' ? (
              <Text style={type.muted}>
                Request sent — waiting for them to accept.
              </Text>
            ) : contact?.status === 'incoming' ? (
              <>
                <Button
                  label={asking ? 'Accepting…' : 'Accept their request'}
                  variant="primary"
                  disabled={asking}
                  onPress={() => void ask()}
                />
                <Text style={type.muted}>They asked you first.</Text>
              </>
            ) : (
              <>
                <Button
                  label={asking ? 'Asking…' : 'Add contact'}
                  disabled={asking || state === 'refused'}
                  onPress={() => void ask()}
                />
                <Text style={type.muted}>
                  They will see a request on their home screen and decide.
                </Text>
              </>
            )}
            {askError ? <Text style={styles.error}>{askError}</Text> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}


const styles = StyleSheet.create({
  container: { padding: spacing(2) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
    marginBottom: spacing(1),
  },
  stack: { gap: spacing(1) },
  channel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(1.5),
    gap: 2,
  },
  channelPressed: { backgroundColor: colors.surfaceRaised },
  /** Italic when nobody has named it; see core/naming.ts. */
  channelDescribed: { ...type.body, fontStyle: 'italic' },
  bio: { ...type.muted, lineHeight: 20 },
  /**
   * Between the two halves of the email card: theirs above, yours below.
   *
   * A line rather than a second card, because they belong to one subject and
   * two cards would read as two unrelated settings — and rather than nothing,
   * because without it the four stacked lines read as one paragraph about one
   * address.
   */
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  /**
   * The two lines under the name that are facts about the account rather than
   * anything it wrote: where they are, and how many people they brought here.
   * Either may be absent, and the gap belongs to the group so that one alone
   * sits exactly where two do.
   */
  facts: { gap: 2, marginBottom: spacing(1) },
  pingFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  error: { color: colors.danger, fontSize: 13 },
});

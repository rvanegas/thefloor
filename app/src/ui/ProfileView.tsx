import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ProfileView as Profile } from '../../../core/protocol';
import {
  IM_SERVICES,
  IM_SERVICE_HINTS,
  IM_SERVICE_NAMES,
  imLink,
  normaliseImHandle,
  type ImHandles,
  type ImService,
} from '../../../core/im';
import { describeChannel } from '../../../core/naming';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PING_TEXT_LENGTH,
} from '../../../core/constants';
import { copyText } from '../clipboard';
import { useApp } from '../state/AppProvider';
import {
  Button,
  Card,
  Field,
  Screen,
  SectionLabel,
  useRevealOnKeyboard,
} from './components';
import {
  describeAvailability,
  describePresence,
  describeQuiet,
  sentence,
} from './availability';
import { duration } from './relativeTime';
import { colors, radius, spacing, type } from './theme';

/**
 * What the three fields start out holding: every service, blank where there is
 * no handle. A record with all three keys rather than the wire's partial one,
 * because a text field's value cannot be undefined and a controlled field that
 * becomes one is a field that stops taking typing.
 */
const imFields = (handles: ImHandles | undefined): Record<ImService, string> =>
  Object.fromEntries(
    IM_SERVICES.map((service) => [service, handles?.[service] ?? ''])
  ) as Record<ImService, string>;

/** The same thing back the other way: the wire's shape, blanks dropped. */
const imOf = (fields: Record<ImService, string>): ImHandles =>
  Object.fromEntries(
    IM_SERVICES.filter((service) => fields[service] !== '').map((service) => [
      service,
      fields[service],
    ])
  );

/**
 * What is wrong with what somebody has typed, or null while there is nothing
 * to say — which includes an empty field, that being how a handle is removed
 * rather than a mistake.
 *
 * The wording names the likely fault rather than the rule. Almost every
 * refused number is one written the way it is dialled at home, and "include
 * the country code" is the sentence that fixes it; a message about E.164 would
 * be accurate and would help nobody.
 */
function imProblem(service: ImService, typed: string): string | null {
  if (typed.trim() === '') return null;
  if (normaliseImHandle(service, typed)) return null;
  return service === 'telegram'
    ? 'A Telegram username, five characters or more — letters, digits and underscores.'
    : 'A phone number with its country code, like +1 555 123 4567.';
}

/**
 * Somebody else's profile.
 *
 * Fetched rather than passed in, because the server decides who may see one —
 * a contact, or somebody in a channel with you — and a 404 is the honest
 * answer to both "no such person" and "not yours to read", deliberately, so
 * that account ids cannot be walked to find out which exist.
 *
 * Read-only, except about you. Your own carries an Edit button, and what a
 * contact reads — your name and where to reach you — becomes fields in place.
 * There was a separate screen for that until 2026-08-29,
 * `ContactsSettingsView`, kept apart on the grounds that an editor which is
 * sometimes read-only grows a conditional in every field it holds. That is a
 * real cost on a screen with eight fields and very nearly none here: `isSelf`
 * already leaves out the shared channels and the Contact card and reduces the
 * Email card to its top half, so edit mode is a swap and an omission — and the
 * separate screen had to fetch this same profile a second time to know what to
 * put in its fields.
 *
 * A profile that cannot be edited is a read-only profile, and an editor for one
 * is that profile editing. So it is one screen with a mode rather than two
 * screens, and the mode is the thing that was already implied.
 *
 * **There is no bio.** It was the first thing this screen was built around and
 * it went on 2026-08-31, field, column and all. What is left is a person's
 * standing and how to reach them — availability, who brought them, the
 * channels you share, an address and three handles — which is what somebody
 * opening a profile was after. See decisions/DECISIONS.md.
 *
 * **Edit mode does not say whose account this is.** It carried a "Signed in
 * as …" line under the name field, inherited from the settings screen and from
 * Home before that, and it was removed on 2026-08-31: the only way in is the
 * card labelled *You* on Contacts, so the screen was answering a question its
 * own route had already answered. The line survived two moves because at each
 * of them it was the only sentence about the account on a screen about
 * something else; here it is on the screen about the account.
 *
 * **The two modes are not the same screen with fields in it.** Edit mode
 * leaves the facts out — availability, the invited count, who invited you —
 * because none of them is editable or in doubt, and they would sit between the
 * name and the fields saying nothing. What it keeps that it used to leave out
 * is the address: "what am I signed in as" is a question somebody has while
 * looking at their own name in a field, and until 2026-08-31 nothing in this
 * application answered it.
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
   * This screen showing you to yourself: the first card on the contact list,
   * and your own card in a channel roster. Your profile as a contact reads it.
   *
   * Derived here rather than passed in, because every caller would compute the
   * same comparison and one of them would eventually forget. What it changes is
   * what is left out — the Contact card, which would offer to add you to your
   * own contacts — and what is added: Edit, this being the screen your name
   * and handles are written on. The availability line needs nothing; the
   * server already withholds it, on the grounds that you are the one person whose whereabouts
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
  /**
   * Editing your own, which is the only kind there is to edit.
   *
   * The drafts are seeded from the fetched profile when Edit is tapped rather
   * than held in step with it, so nothing arriving later can type over a
   * sentence somebody is in the middle of.
   */
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  /**
   * The three messaging handles, as typed rather than as stored.
   *
   * Held as whatever is in the field, because normalisation is what happens to
   * a handle on the way to the server: a field that rewrote `+1 555 123 4567`
   * into `+15551234567` under somebody's cursor would be correcting them
   * mid-sentence, and the two are the same handle anyway.
   */
  const [draftIm, setDraftIm] = useState<Record<ImService, string>>({
    whatsapp: '',
    telegram: '',
    signal: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * What the server already has, so that leaving a field alone writes nothing.
   *
   * A ref rather than state: it is never rendered, and it has to be readable by
   * a blur handler that fired before a re-render would have delivered it.
   */
  const saved = useRef<{
    displayName: string;
    /** Canonical, since that is the shape the server answers with. */
    im: Record<ImService, string>;
  }>({
    displayName: '',
    im: { whatsapp: '', telegram: '', signal: '' },
  });

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

  /**
   * Opens the handle in the app it belongs to.
   *
   * The URL is a universal link, so a phone with the app installed lands in a
   * conversation and a phone without one lands on a page saying what the app
   * is — which is the honest answer to "reach them on Signal" from somebody
   * who has no Signal. An OS that refuses outright is reported rather than
   * swallowed, on `openPrivacy`'s reasoning: a dead button is worse than a
   * message, and the address is in the message so it can still be used by
   * hand.
   */
  const openIm = async (service: ImService, handle: string) => {
    const url = imLink(service, handle);
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(`Could not open ${IM_SERVICE_NAMES[service]}`, handle);
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
   * Into edit mode, with what the server holds already in the fields.
   *
   * Only ever reached with a loaded profile, the button being disabled until
   * then — so there is no case where the drafts are seeded from nothing and a
   * blur writes an empty handle over a real one.
   */
  const startEditing = () => {
    if (!profile) return;
    const held = imFields(profile.im);
    saved.current = {
      displayName: profile.account.displayName,
      im: held,
    };
    setDraftName(profile.account.displayName);
    setDraftIm(held);
    setSaveError(null);
    setEditing(true);
  };

  /**
   * Writes whatever has actually changed.
   *
   * There is no Save button and every field writes on blur, which is the rule
   * the screen this replaced was built on: one button meaning "keep my work"
   * beside a nearer, more obvious one meaning "throw it away" is a choice
   * nobody should be asked to make.
   *
   * Rethrows so the way out can decline to close on a failure. A way out that
   * left anyway would be a silent discard wearing a different hat.
   */
  const persist = async () => {
    const name = draftName.trim();
    // A blank name is refused rather than written: it is how everybody else
    // finds you, and the server ignores an empty one anyway. Saying so under
    // the field is what stands in for a disabled button.
    const nameChanged = name !== '' && name !== saved.current.displayName;

    /*
      The handles that have actually changed, compared canonically: two
      spellings of one number are not an edit, and sending one would have the
      server write what it already holds every time a field lost focus.

      A handle that is neither blank nor readable is left out rather than sent.
      The server would refuse it — and refuse the name alongside it, this being
      one write — so a half-typed number would block saving a rename somebody
      had just finished. The field says what is wrong underneath itself; see
      `imProblem`.
    */
    const im: ImHandles = {};
    for (const service of IM_SERVICES) {
      const typed = draftIm[service].trim();
      const value = typed === '' ? '' : (normaliseImHandle(service, typed) ?? '');
      if (typed !== '' && value === '') continue;
      if (value !== saved.current.im[service]) im[service] = value;
    }
    const imChanged = Object.keys(im).length > 0;

    if (!nameChanged && !imChanged) return;

    const changes: { displayName?: string; im?: ImHandles } = {};
    if (nameChanged) changes.displayName = name;
    if (imChanged) changes.im = im;

    setSaving(true);
    setSaveError(null);
    try {
      await app.saveProfile(changes);
      saved.current = {
        displayName: changes.displayName ?? saved.current.displayName,
        im: { ...saved.current.im, ...im },
      };
      /*
        Patched rather than re-read. `saveProfile` resolves to nothing, and the
        server was handed exactly these fields — there is nothing else in a
        profile that a write to it changes, so a second GET would spend a round
        trip being told what we had just said. `app.me` is updated by
        `saveProfile` itself, which is what renames the card this screen was
        opened from.
      */
      setProfile((held) =>
        held
          ? {
              ...held,
              account: {
                ...held.account,
                displayName: saved.current.displayName,
              },
              // Rebuilt from what was kept rather than merged, so that a
              // handle which was cleared leaves rather than lingering as an
              // empty string the read view would draw a dead link for.
              im: imOf(saved.current.im),
            }
          : held
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  /** Keeps the work and stops editing — and stays put if it could not be kept. */
  const doneEditing = async () => {
    try {
      await persist();
      setEditing(false);
    } catch {
      // The error is on screen, and the edit is still in the field.
    }
  };

  const named = draftName.trim() !== '';

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

  /**
   * The ping card, brought wholly into view when the keyboard opens over it.
   *
   * Held while the composer is showing rather than while the field has focus:
   * it is the only field on this screen, so any keyboard here is that one's,
   * and the card is what has to be visible — a reveal that stopped at the
   * field would leave "Send ping" underneath the keyboard. See
   * `useRevealOnKeyboard`.
   */
  const pingCard = useRevealOnKeyboard(
    onPing !== undefined && !pingSent && pingWait === null
  );

  return (
    <Screen contentStyle={styles.container}>
      {/*
        The header, which in edit mode holds the way out and nothing else.

        The name field was up here until 2026-08-31, standing where the
        heading it replaces stands — which put a text field on the same line as
        a button, made that line the only one on the screen where a field has
        no label, and left the sole thing every other section has above it to
        be inferred from the placeholder. It is a section now, like Email and
        Messaging, and Done is alone: the header stops being two things and
        goes back to being the one it is everywhere else.
      */}
      <View style={[styles.header, editing && styles.headerAlone]}>
        {editing ? null : (
          <View style={styles.headerMain}>
            <Text style={type.heading} numberOfLines={1}>
              {profile?.account.displayName ?? fallbackName}
            </Text>
          </View>
        )}
        {editing ? (
          // Alone, deliberately: a way out that keeps the work, standing beside
          // a nearer one that abandons it, is exactly the choice this screen
          // refuses to ask for. Back returns once there is nothing pending.
          <Button
            label={saving ? 'Saving…' : 'Done'}
            variant="ghost"
            disabled={saving}
            onPress={() => void doneEditing()}
          />
        ) : (
          <>
            {/* Disabled until the fetch lands, so the fields are never seeded
                from a profile nobody has read yet. */}
            {isSelf ? (
              <Button
                label="Edit"
                variant="ghost"
                disabled={state !== 'ready'}
                onPress={startEditing}
              />
            ) : null}
            <Button label="Back" variant="ghost" onPress={onBack} />
          </>
        )}
      </View>

      {/* Under the header rather than beside the field that failed: any field
          can raise it, and it belongs to the write rather than to one of
          them. */}
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      {/*
        What everybody else finds you by, and the first section because it is
        the one thing here that is not optional.

        The refusal is said under the field rather than by disabling Done, on
        the rule the rest of this screen follows: a control that does nothing
        is worse than a sentence saying why. What is in the field stays there,
        and what is unwritable is simply not written.
      */}
      {editing ? (
        <>
          <SectionLabel>Name</SectionLabel>
          <Card style={styles.stack}>
            <Field
              value={draftName}
              onChangeText={(v) =>
                setDraftName(v.slice(0, MAX_DISPLAY_NAME_LENGTH))
              }
              placeholder="What people should call you"
              autoCapitalize="words"
              onBlur={() => void persist().catch(() => {})}
            />
            {!named ? (
              <Text style={styles.error}>
                A name cannot be empty — it is how everyone else finds you, so
                this one is kept until you type another.
              </Text>
            ) : null}
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
        account, where the card is prose they wrote — and the pair now sits
        directly under the name, above everything there is to do, because
        where somebody is is what decides whether to do any of it.

        Shown at zero as well, which is deliberate. It is a count rather than a
        badge, and a line that appears only once it is flattering turns
        everybody's first week into a screen with something missing from it.
        What is not shown is an *absent* count — a server too old to send one —
        since a nought it never claimed would be a number we made up.
      */}
      {/*
        Left out while editing, which is the one place the two modes order the
        screen differently rather than swapping a line for a field.

        Nothing here is editable and nothing here is in doubt: where you are,
        how many people you brought and who brought you are the server's
        answers about you, and none of them changes because a name field is
        open. Edit mode is the handful of things you can change, and three
        lines you cannot, sitting between the name and the fields, make the
        screen longer without making it say anything. The name is the
        exception and stays, being a field there.
      */}
      {editing ? null : (
        <View style={styles.facts}>
          {availability ? (
            <Text style={type.muted}>{availability}</Text>
          ) : null}
          {profile?.invited !== undefined ? (
            <Text style={type.muted}>{`Invited ${profile.invited}`}</Text>
          ) : null}
          {/*
            Who invited them, and only ever a name you already know: the server
            sends this when the inviter is you or one of your contacts, and
            sends nothing otherwise. So there is no case to handle here where
            the name would be a stranger's — absent means there is no line,
            whether that is because nobody invited them, because you do not
            know who did, or because the server predates the field.
          */}
          {profile?.invitedBy ? (
            <Text style={type.muted} numberOfLines={1}>
              {`Invited by ${profile.invitedBy.displayName}`}
            </Text>
          ) : null}
        </View>
      )}

      {/*
        Somebody who belongs to this channel and is not in it. The one
        notification in the app that a person composes and aims, so it is the
        one place worth spending a text field on.

        Words are optional. An empty ping still says somebody is asking for
        you, which is the whole of what most pings mean, and requiring a
        sentence would make the common case the slow one.

        First of the things to do, and under the facts rather than above
        them. It is drawn only from inside a channel they are missing from,
        which is a screen opened to do something rather than to read something,
        so it stays above everything after it — but whether to ping
        somebody is decided by whether they are about, and the line that says
        so is three words long. Reading it first costs nothing and answers the
        question the composer is asking.
      */}
      {onPing ? (
        // Kept in the native tree so it can be measured, and wrapping the
        // label as well as the card so what is revealed is the whole section.
        <View ref={pingCard} collapsable={false}>
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
        </View>
      ) : null}

      {/*
        Every channel the two of you share, and when they were last in each.

        Left out for your own profile, the same way the Contact card is: it
        would be Home's list of your own channels with your own name against
        every line, which is a screen you already have.

        Above Email rather than below Messaging, since 2026-08-31. It sat at
        the foot on the reading that the screen goes things-to-do first and
        things-to-read after, with the two ways of reaching somebody sitting
        together at the top. What that got wrong is which of these is a way of
        reaching somebody. A shared channel is the nearest one there is — it is
        inside this application, it is one tap, and the line under each says
        whether anybody is in there now — where an address and a handle both
        mean leaving for another application and waiting. So the order is by
        how directly each thing reaches the person: the room you both already
        have, then the ways out to somewhere else.

        It also puts the two facts that decide anything next to each other.
        Where somebody is, at the top, and where they have been in your rooms,
        immediately under it — which used to be separated by everything else
        on the screen.
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
        asked to be a contact — the card further down does that — and this is a
        step past it rather than part of it.

        Under the shared channels, which is the order the whole screen is in:
        by how directly each thing reaches the person. A ping and a shared room
        are inside this application; an address and a handle are ways of
        leaving it and waiting. So the two of those sit together down here,
        below the ways that do not require anybody to change applications, and
        above nothing but the request to be somebody's contact.

        **Your own is drawn too, in both modes, and it is one half rather than
        two.** It was left out entirely until 2026-08-31, on the reading that
        the card is about a disclosure and there is none to make to yourself.
        What that missed is that the address is also a fact you can be unsure
        of: this application signs you in by email and there was nowhere in it
        that said which one. So the top half stays — your address, and the
        button to copy it — and the bottom half, which is a decision about one
        named reader, does not. It is on the edit screen as well because "what
        am I signed in as" is exactly the question somebody has while looking
        at their own name in a field, and it is the one thing there that
        answers it.
      */}
      {isSelf ? (
        <>
          <SectionLabel>Email</SectionLabel>
          <Card style={styles.stack}>
            {/* Selectable and copyable for the same reasons a contact's is. */}
            <Text style={type.body} selectable numberOfLines={1}>
              {profile?.email ?? '—'}
            </Text>
            {profile?.email ? (
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
            ) : null}
            {/* Where the other half of this card went, said once rather than
                drawn as a control that would have nobody to aim at. */}
            <Text style={type.muted}>
              How you sign in. Nobody else sees it unless you show it to them,
              which is done one contact at a time, from their profile.
            </Text>
          </Card>
        </>
      ) : contact?.status !== 'accepted' ? null : (
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
        Where else they can be reached, and the second half of the errand the
        Email card is the first half of — so it sits directly under it, above
        everything there is merely to read.

        Drawn only when there is something in it, which is what makes it
        absent for a stranger, for somebody who has filled none of it in, and
        for a server that predates the field. All three mean the same thing to
        a reader — there is no way to reach this person elsewhere from here —
        and none of them is worth an empty card saying so.

        Not shown while editing, where the same three handles are fields. A
        card of links above the fields that write them would be the profile
        arguing with itself.
      */}
      {editing || !profile?.im ? null : (
        <>
          <SectionLabel>Messaging</SectionLabel>
          <Card style={styles.stack}>
            {IM_SERVICES.filter((service) => profile.im?.[service]).map(
              (service) => {
                const handle = profile.im![service]!;
                return (
                  <View key={service} style={styles.imRow}>
                    <View style={styles.imWho}>
                      <Text style={type.label}>
                        {IM_SERVICE_NAMES[service]}
                      </Text>
                      {/* Selectable for the same reason the address above is:
                          the button is the fast way and not the only way. */}
                      <Text style={type.body} selectable numberOfLines={1}>
                        {handle}
                      </Text>
                    </View>
                    {/* The roster's Ping button, in shape and in weight:
                        tightened because `Button` is sized for a card of its
                        own and this one sits at the end of a row of text, and
                        ghost because a handle is a way out of this
                        application rather than the thing the screen is for.
                        Three primary buttons stacked down a card made the
                        section read as the errand. */}
                    <Button
                      label="Open"
                      variant="ghost"
                      style={styles.imOpen}
                      onPress={() => void openIm(service, handle)}
                    />
                  </View>
                );
              }
            )}
            {isSelf ? (
              // Your own handles are not a way to reach yourself, so the card
              // says what it is doing on your screen: this is what a contact
              // sees, which is the one thing worth knowing about it.
              <Text style={type.muted}>
                Your contacts see these on your profile.
              </Text>
            ) : null}
          </Card>
        </>
      )}

      {/*
        Whether there is anything here at all, and nothing else.

        This card held the bio until 2026-08-31, and with it the two answers
        that were never about the bio: the fetch is still out, or it was
        refused. Those are what is left. A profile that arrived draws nothing
        here — everything there is to know is in the sections around it, and a
        card between them saying so would be the shape of the missing
        paragraph rather than a thing to read.

        A ready profile with nothing in it is not an empty screen: a name, how
        many people they brought here and where they are is a profile, and it
        is above this line.
      */}
      {state !== 'ready' ? (
        <Card style={styles.stack}>
          {state === 'loading' ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <Text style={type.muted}>
              There is no profile here to show you.
            </Text>
          )}
        </Card>
      ) : null}

      {/*
        The three handles, as fields.

        Under the name rather than above it, and last on the screen: your name
        is what everybody else finds you by and these are an appendix to it —
        and because two of the three are phone numbers, which is a keyboard
        nobody should meet before they have been asked who they are.

        Each writes on blur like the fields above, and each says underneath
        what it will accept once what is in it cannot be read as a handle. A
        message rather than a disabled Done, on the reasoning the name field
        already follows: the field keeps the typing and the screen keeps
        working, and what is unreadable is simply not written.
      */}
      {editing ? (
        <>
          <SectionLabel>Messaging</SectionLabel>
          <Card style={styles.stack}>
            {IM_SERVICES.map((service) => {
              const problem = imProblem(service, draftIm[service]);
              return (
                <View key={service} style={styles.imField}>
                  <Text style={type.label}>{IM_SERVICE_NAMES[service]}</Text>
                  <Field
                    value={draftIm[service]}
                    onChangeText={(v) =>
                      setDraftIm((held) => ({ ...held, [service]: v }))
                    }
                    placeholder={IM_SERVICE_HINTS[service]}
                    keyboardType={
                      service === 'telegram' ? 'default' : 'phone-pad'
                    }
                    onBlur={() => void persist().catch(() => {})}
                  />
                  {problem ? (
                    <Text style={styles.error}>{problem}</Text>
                  ) : null}
                </View>
              );
            })}
            <Text style={type.muted}>
              Shown to your contacts, who can tap one to open the conversation
              there. Leave a field empty to take it off your profile.
            </Text>
          </Card>
        </>
      ) : null}

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

        Last on the screen, below Email rather than beside it. Three of the
        four branches below belong to somebody who is not a contact yet, and
        the Email card is drawn for a contact or for yourself — so the two
        never compete for a position, and putting this one at the foot costs a
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
  /** The name, taking whatever the buttons leave. */
  headerMain: { flex: 1, gap: spacing(0.5) },
  /**
   * Edit mode, where Done is the only thing in the header. `space-between`
   * puts a lone child at the start, and the way out belongs where every other
   * screen's is.
   */
  headerAlone: { justifyContent: 'flex-end' },
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
   * The lines directly under the name that are facts about the account rather
   * than anything it wrote: where they are, how many people they brought here,
   * and who brought them. Any may be absent, and the gap belongs to the group
   * so that one alone sits exactly where three do.
   */
  facts: { gap: 2, marginBottom: spacing(1) },
  /** A handle and the button that opens it, on one line. */
  imRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  /** The name and the handle, taking whatever the button leaves. */
  imWho: { flex: 1, gap: 2 },
  /** ChannelView's `cardPing`, and deliberately the same numbers. */
  imOpen: {
    paddingVertical: spacing(0.5),
    paddingHorizontal: spacing(1),
    minHeight: 0,
  },
  imField: { gap: spacing(0.5) },
  pingFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  error: { color: colors.danger, fontSize: 13 },
});

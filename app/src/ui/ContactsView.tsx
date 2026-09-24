import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  ContactView as Contact,
  HomeView as HomeViewData,
} from '../../../core/protocol';
import { useText } from '../i18n';
import { canShare, shareLink } from '../share';
import { useApp } from '../state/AppProvider';
import { describeAvailability } from './availability';
import {
  Button,
  Card,
  Empty,
  Field,
  Reveal,
  SectionLabel,
} from './components';
import { colors, spacing, type } from './theme';

/**
 * The requests it is this reader's turn to do something about.
 *
 * **Incoming only, which is the entire reason this is a function and not a
 * `filter` written twice.** The *Requests* section below is `status !==
 * 'accepted'` — everything outstanding, in both directions — and that is right
 * for a section whose job is to show you where things stand. It is wrong for a
 * mark on a tab: an outgoing request is one only the other person can answer,
 * so a dab drawn from those puts something on the switch that tapping through
 * cannot resolve, and it stays there until somebody else acts. The one state
 * this interface must never be in is asking for attention it has nothing to do
 * with.
 *
 * Exported for `HomeView` to draw the dab from, the way `nearbyChannels` is
 * exported from `ChannelsView` for the bars: what counts as something to do is
 * this list's question, and the tier above it should not be answering it a
 * second time.
 *
 * **Nothing here is remembered, and that is the point.** This is a view of the
 * snapshot, so the mark arrives with the request over the socket and leaves
 * when the request is accepted or declined. There is nothing to mark as seen,
 * and so nothing that can be left showing a mark for something already dealt
 * with — which is exactly what the Support tab's mark cannot manage, and why
 * that one needs `state/helpSeen.ts` and this one does not.
 */
export function answerableRequests(home: HomeViewData | null): Contact[] {
  return (home?.contacts ?? []).filter((entry) => entry.status === 'incoming');
}

/**
 * The people you know, and whether they are about — the body of the Contacts
 * tab, and one of the two lists the tier holds.
 *
 * **A body rather than a screen, since 2026-09-01.** It had a header with the
 * title and a *Home* button, and it covered the channel list, which is how a
 * pair of peers came to be navigated as a root and a child. It has neither now:
 * the switch above is the whole of how you get between the two, and the frame
 * around this is `HomeView`. See planning/decisions/DECISIONS.md § *The tier
 * above both lists*.
 *
 * The channel list used to carry this, and lost it when it became a list of
 * channels — which was right for that list and wrong for the fact: a channel's
 * idleness says when anybody was last in a room, and says nothing at all about
 * whether its other member is holding a phone right now. Those are different
 * questions and only one of them was still being answered.
 *
 * It is a list of its own rather than a section of that one because of what a
 * contact row is for. A row is not a channel — a contact row that offered one
 * would be the overlap that took the old list apart. What a row does is open
 * the person: where they are, how to reach them, and the one destructive thing
 * you can do about them.
 *
 * A profile opened from here is a different matter, and is why this takes
 * `onEnterChannel`. Its "Channels with them" section is not a directory of
 * rooms competing with the channel list; it is the rooms this pair share, read
 * on the screen about the pair, and the reason to read a line saying three
 * people are in one of them is to go there. See ProfileView.
 *
 * **Requests are here, since 2026-09-05**, and not in the channel list where
 * they were drawn back when it was the whole app. They are not contacts yet,
 * which is what kept them out — but they are not channels either, and being
 * neither is not a reason to file them under the one they are further from.
 * A request is a person who is about to be in this list or is not: answering
 * one adds a row below, withdrawing one takes it off the screen, and the form
 * that sends one is at the top of this same list. They sit above *You* and
 * above the contacts because they are the only thing on either tab with
 * something outstanding to do about it.
 *
 * You are a card of your own, since 2026-08-29, under the add-contact row
 * rather than above it, and under a section label reading *You* since
 * 2026-08-31. The server has never put you in your own contact list and still
 * does not — it returns the *other* id of each contacts row, which is what
 * stops the list being about you — so the card is drawn from `app.me` and sits
 * in its own section rather than in theirs. Adding somebody is what this
 * list is for when it is not enough, so it takes the top; your own card is a
 * way in to your profile, which is a thing you go to occasionally and not the
 * first thing to read. There is no Settings button any more: what it opened
 * was your own account, which is your profile with the fields showing, and
 * that now lives behind Edit on the profile itself. See ProfileView.
 */
export function ContactsView({
  onEnterChannel,
  onOpenProfile,
}: {
  /**
   * Opens a channel shared with whoever's profile is open. Optional, so this
   * still renders somewhere with nowhere to go — the profile draws the cards
   * either way and only the tap depends on it.
   */
  onEnterChannel?: (channelId: string) => void;
  /**
   * Opens a tapped contact. Always given, and always by the tier: where the
   * profile *goes* — the pane next door in a split, over the whole tier on a
   * phone — is a question about the frame rather than about this list, and it
   * is answered once in `HomeView` rather than twice here. This used to hold
   * its own profile state for the phone case, which is what made it a screen.
   */
  onOpenProfile: (contact: {
    id: string;
    name: string;
    /**
     * Opens it already editing. One caller: *Choose a Username*, below, which
     * is a way in to one field rather than to the screen it is on — sending
     * somebody to their own profile to hunt for Edit would be handing them a
     * map instead of an answer.
     */
    edit?: boolean;
  }) => void;
}) {
  const app = useApp();
  const t = useText().contacts;
  const now = app.serverNow();

  const contacts = (app.home?.contacts ?? [])
    .filter((entry) => entry.status === 'accepted')
    .sort(byAvailability);

  // Everybody who is not a contact yet, in either direction. The accepted ones
  // are the list below; these are the ones there is still something to do
  // about.
  //
  // Wider than `answerableRequests` below, and legitimately: this section is
  // what is outstanding, which includes what you are waiting on. The mark on
  // the tab is what *you* can act on, which is the incoming half alone.
  const requests = (app.home?.contacts ?? []).filter(
    (entry) => entry.status !== 'accepted'
  );

  return (
    <>
      <AddContact
        onChooseUsername={
          app.me
            ? () =>
                app.me &&
                onOpenProfile({
                  id: app.me.id,
                  name: app.me.displayName,
                  edit: true,
                })
            : undefined
        }
      />

      {/*
        Requests, drawn only when there are any — an account with nothing
        outstanding sees the people it knows and nothing else, which is what
        this list is for the rest of the time.
      */}
      {requests.length > 0 ? (
        <>
          <SectionLabel>{t.requests()}</SectionLabel>
          <View style={[styles.list, styles.requests]}>
            {requests.map((entry) => (
              <RequestRow
                // An outgoing request carries no account id — deliberately, so
                // that one sent to an address without an account is
                // indistinguishable from one sent to a user. Its identity is
                // the address, which is what `displayName` holds for these rows
                // and is unique: there cannot be two requests to one address.
                key={entry.account.id || `sent:${entry.account.displayName}`}
                entry={entry}
                onEnterChannel={onEnterChannel}
              />
            ))}
          </View>
        </>
      ) : null}

      {/*
        You, in a section of your own rather than outside every section.

        Not sorted with the rest and not counted among them: `byAvailability`
        orders people by how likely they are to answer, which is not a question
        about yourself, and a list that said "Nobody yet" under a card with your
        name on it would be answering a different question than it was asked.

        The word "You" is the label rather than the card's second line, since
        2026-08-31. It says the same thing in either place — and said as a
        heading it also names the route, which is what lets the profile behind
        this card stop introducing itself. Where you are is still not shown:
        the server withholds that about you deliberately, you being the one
        person who already knows.
      */}
      {app.me ? (
        <>
          <SectionLabel>{t.you()}</SectionLabel>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.openYourProfile(app.me.displayName)}
            onPress={() =>
              app.me &&
              onOpenProfile({ id: app.me.id, name: app.me.displayName })
            }
            style={({ pressed }) => pressed && styles.rowPressed}
          >
            <Card style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={type.body} numberOfLines={1}>
                  {app.me.displayName}
                </Text>
              </View>
            </Card>
          </Pressable>
        </>
      ) : null}

      {contacts.length > 0 ? <SectionLabel>{t.yourContacts()}</SectionLabel> : null}
      {contacts.length === 0 ? (
        <Empty>{t.nobodyYet()}</Empty>
      ) : (
        <View style={styles.list}>
          {contacts.map((entry) => (
            <ContactRow
              key={entry.account.id}
              entry={entry}
              now={now}
              onPress={() =>
                onOpenProfile({
                  id: entry.account.id,
                  name: entry.account.displayName,
                })
              }
            />
          ))}
        </View>
      )}
    </>
  );
}

/**
 * Whoever is most likely to answer, first.
 *
 * The same shape as Home's `byIdleness`, and for the same reason: a list you
 * open to decide who to talk to should not make you read all of it to find out
 * who is about. Anybody in the app sorts above everybody who is not, and the
 * rest fall by how recently they were — which is what the line under each name
 * already says, so the order and the words agree rather than having to be
 * reconciled by the reader.
 *
 * **Not known is last, not first.** A contact with no `lastSeenAt` has either
 * never connected since the field existed or is being served by a server that
 * predates it, and neither is evidence of being around. Treating a missing
 * stamp as zero would be the same answer by accident; saying so is what stops
 * somebody later "fixing" it to `Date.now()`.
 *
 * Ties break on the name, so the order is stable between snapshots. Without it
 * two contacts who have never been seen would swap places on every render, and
 * a list that reshuffles under a thumb is worse than one in any fixed order.
 */
function byAvailability(a: Contact, b: Contact): number {
  if (!!a.inApp !== !!b.inApp) return a.inApp ? -1 : 1;
  // Compared as "has a stamp at all" before "which stamp", rather than by
  // standing in for a missing one with a sentinel — subtracting two of those
  // is NaN, and a comparator that returns NaN sorts by nothing at all.
  const seenA = a.lastSeenAt ?? null;
  const seenB = b.lastSeenAt ?? null;
  if (seenA !== null && seenB !== null && seenA !== seenB) return seenB - seenA;
  if (seenA === null && seenB !== null) return 1;
  if (seenB === null && seenA !== null) return -1;
  return a.account.displayName.localeCompare(b.account.displayName);
}

function ContactRow({
  entry,
  now,
  onPress,
}: {
  entry: Contact;
  now: number;
  onPress: () => void;
}) {
  const t = useText().contacts;
  const availability = describeAvailability(entry, now, useText().availability);
  return (
    // The whole row, as on Home: there is one thing to do with a contact from
    // here, so a target the size of the row is the honest shape for it.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.openTheirProfile(
        entry.account.displayName,
        availability
      )}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <Card style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={type.body} numberOfLines={1}>
            {entry.account.displayName}
          </Text>
          {/*
            Nothing rather than a hedge when it is not known — a server that
            predates the fields, or somebody who has not connected since they
            existed. "Unknown" would be reporting on the rule rather than on the
            person. See describeAvailability.
          */}
          {availability ? (
            <Text style={type.muted}>{availability}</Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * A contact request, incoming or outgoing — a row for somebody who is not in
 * the list above yet, and may never be.
 *
 * No profile behind it and no availability on it, both deliberately. An
 * outgoing request is an address rather than a person: whether anybody is
 * behind it is exactly what must not be revealed, which is why the server
 * withholds the id and the name. So this is the one row here that does not
 * open anybody, and it carries its actions on itself instead.
 */
function RequestRow({
  entry,
  onEnterChannel,
}: {
  entry: Contact;
  /**
   * Where accepting goes, since 2026-09-24: the pair channel the acceptance
   * makes. Optional, so this row still answers a request where there is
   * nowhere to be taken — a caller that did not pass one, or a server too old
   * to name the channel.
   */
  onEnterChannel?: (channelId: string) => void;
}) {
  const app = useApp();
  const t = useText().contacts;
  const { account, status } = entry;
  return (
    <Card style={styles.requestRow}>
      <View style={styles.rowMain}>
        <Text style={type.body}>{account.displayName}</Text>
        <Text style={type.muted}>
          {status === 'incoming' ? t.wantsToBeAContact() : t.pending()}
        </Text>
      </View>
      {status === 'incoming' ? (
        <View style={styles.rowActions}>
          {/*
            **Accepting lands you in the channel it just made**, since
            2026-09-24. Becoming contacts is what creates the place the two of
            you talk — the server does it on this route, and has since Home
            became a list of channels — and until now nothing said so: the
            channel appeared in *Your channels* with no mark, no bar and no
            line, which for somebody's first contact is the whole of what the
            application does next, announced nowhere. This is the second half
            of the arrival the waiting bar fixed the first half of.

            It navigates and nothing more. Stepping in claims the phone's
            audio outright, and that is a decision with a control of its own
            on the screen this opens — see `enterChannel` in `App.tsx`, which
            is `setDetail` and no action at all.

            Nowhere to go is not an error: no handler, or a server too old to
            name the channel, leaves the row doing exactly what it did before.
          */}
          <Button
            label={t.accept()}
            variant="primary"
            onPress={() => {
              void app.acceptContact(account.id).then((channelId) => {
                if (channelId) onEnterChannel?.(channelId);
              });
            }}
          />
          <Button
            label={t.decline()}
            onPress={() => app.declineContact(account.id)}
          />
        </View>
      ) : (
        <View style={styles.rowActions}>
          <Text style={styles.pendingTag}>{t.sent()}</Text>
          {/*
            Identified by the address, which is what displayName holds for
            outgoing rows — these have no account id to cancel by, on purpose.
          */}
          <Button
            label={t.withdraw()}
            onPress={() =>
              app.withdrawContact(account.displayName).catch((e) => {
                Alert.alert(
                  t.couldNotWithdraw(),
                  e instanceof Error ? e.message : String(e)
                );
              })
            }
          />
        </View>
      )}
    </Card>
  );
}

/**
 * Asking somebody to be a contact, folded away until it is wanted.
 *
 * It was a permanent field at the foot of Home. At the top of a list of people
 * it would be the first thing on the screen every time, and adding a contact is
 * something you do occasionally where reading the list is what you came for —
 * so it is a line until tapped. The field only exists while it is open, which
 * is also what keeps the keyboard off a screen nobody is typing into.
 */
function AddContact({
  onChooseUsername,
}: {
  /** Opens your own profile, already in edit mode. Absent before `me` lands. */
  onChooseUsername?: () => void;
}) {
  const app = useApp();
  const t = useText().contacts;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const { accepted } = await app.requestContact(query.trim());
      setMessage({
        ok: true,
        text: accepted ? t.alreadyAsked() : t.requestSent(),
      });
      setQuery('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    // Closed, it is the channel list's start-a-channel row: a mark and a
    // label in the shape of a card rather than of a button, and since
    // 2026-09-02 in the same position too, above the first section label
    // rather than at the foot of a list. The two tabs' one affordance for
    // making something new should not be two different shapes in two
    // different places, and this is the same kind of thing — available rather
    // than urgent, which is why only the mark carries the accent.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.addAContact()}
        onPress={() => setOpen(true)}
        style={({ pressed }) => pressed && styles.rowPressed}
      >
        <Card style={styles.addRow}>
          <View style={styles.addMark}>
            <Text style={styles.addMarkGlyph}>+</Text>
          </View>
          <Text style={styles.addLabel}>{t.addAContact()}</Text>
        </Card>
      </Pressable>
    );
  }

  /*
    **Brought into view when the keyboard opens over it, rather than avoided.**
    The obvious reading is a `KeyboardAvoidingView` around this card, and it is
    the wrong one: this card is rendered inside a `Screen`, which is the
    application's one avoider, and a second nested in it counts the keyboard's
    height twice on iOS and leaves a gap that tall under the card. What the
    avoider does not do is *scroll*, and this card grows tall enough — a field,
    two buttons, an outcome line, and the invite link under it — that a
    shortened viewport can leave its lower half beneath the keyboard, which is
    where *Send request* is. Same reasoning as the channel notepad; see
    `RevealContext`.

    `when` is the card being open rather than the field having focus: the only
    keyboard this row of the screen can raise is this field's.
  */
  return (
    <Reveal when={open}>
    <Card style={styles.addContact}>
      {/*
        The title the row above turns into. Closed, this is a mark and the
        words *Add a contact*; open, the words stay and the mark is spent, so
        the card is visibly the same offer taken up rather than a new thing
        that appeared. In the row's own type and colour for that reason, not
        `SectionLabel`'s — a heading over the card would read as something
        above it rather than as what it used to be.
      */}
      <Text style={styles.addLabel}>{t.addAContact()}</Text>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={t.searchByEmail()}
        keyboardType="email-address"
        autoFocus
        onSubmit={query.trim() && !busy ? send : undefined}
        submitLabel="send"
      />
      <View style={styles.addActionsSpread}>
        <Button
          label={t.cancel()}
          onPress={() => {
            setOpen(false);
            setQuery('');
            // The outcome of the last request goes with the form that produced
            // it — a confirmation left behind would be describing something
            // nobody can see any more.
            setMessage(null);
          }}
        />
        <Button
          label={busy ? t.sending() : t.sendRequest()}
          onPress={send}
          disabled={!query.trim() || busy}
        />
      </View>
      {message ? (
        <Text
          style={[
            styles.message,
            { color: message.ok ? colors.success : colors.danger },
          ]}
        >
          {message.text}
        </Text>
      ) : null}

      <Text style={styles.or}>{t.or()}</Text>
      <InviteLink onChooseUsername={onChooseUsername} />
    </Card>
    </Reveal>
  );
}

/**
 * The other way of adding somebody: a link you hand over yourself.
 *
 * **The second half of one card rather than a card of its own**, because the
 * two are one question — *how do I get this person in here* — answered for the
 * two situations somebody is in. The field above needs an address and reaches
 * the person by email; this needs nothing and reaches them however you already
 * talk to them, which is the case the address form cannot serve at all.
 *
 * **It is conditional on a username, and says why when there is none.** A link
 * is `/i/<username>/<pin>` and there is no link without the first half, so the
 * absence is explained and made actionable rather than hidden — hiding it
 * would leave somebody who had heard of invite links looking for a control
 * that is not drawn.
 *
 * Asked on mount rather than held: this component exists only while the card
 * is open, so a fresh answer costs one request per opening and cannot be stale
 * — including just after somebody has been away choosing a username.
 */
function InviteLink({
  onChooseUsername,
}: {
  onChooseUsername?: () => void;
}) {
  const app = useApp();
  const t = useText().contacts;
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [minting, setMinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void app
      .inviteLink()
      .then((minted) => {
        if (!cancelled) setUrl(minted);
      })
      // An older server, or one that cannot answer, leaves this undefined and
      // the section simply is not drawn. Nothing here is worth an error
      // message on a screen somebody opened to type an address into.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Once per opening of the card. `app` changes identity often and refetching
    // on every one of those would mint a pin a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The same three states and the same fade the profile's copy uses. */
  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (url === undefined) return null;

  if (url === null) {
    return (
      <View style={styles.invite}>
        <Text style={type.muted}>{t.toGenerateAnInviteLink()}</Text>
        <View style={styles.addActions}>
          <Button
            label={t.chooseAUsername()}
            // Absent only in the moment before `me` lands, which is why the
            // button is drawn disabled rather than withheld: a control that
            // appears a beat after the sentence explaining it is a control
            // somebody has already given up looking for.
            onPress={onChooseUsername ?? (() => undefined)}
            disabled={!onChooseUsername}
          />
        </View>
      </View>
    );
  }

  /**
   * Mints on the press rather than handing over what was fetched on mount.
   *
   * A link is good for one person, so sharing twice has to produce two links
   * — otherwise somebody who sends one to two people has sent the second
   * person an invitation that is already spent. The mount fetch is what
   * decides whether this section exists at all; this is what is handed over.
   *
   * The share sheet rather than the clipboard, for the reason the channel's
   * guest link uses it: the destination is a person, and this is how you
   * reach somebody you already talk to somewhere else. A browser with no Web
   * Share API falls back to a copy, which is why the button says which of the
   * two it is about to do. See src/share.ts.
   */
  async function hand() {
    setMinting(true);
    try {
      const fresh = (await app.inviteLink()) ?? url;
      if (!fresh) return;
      setUrl(fresh);
      const handoff = await shareLink(fresh);
      setCopied(
        handoff === 'copied' ? 'done' : handoff === 'failed' ? 'failed' : 'idle'
      );
    } catch {
      setCopied('failed');
    } finally {
      setMinting(false);
    }
  }

  return (
    <View style={styles.invite}>
      <View style={styles.addActions}>
        <Button
          label={
            minting
              ? t.makingALink()
              : canShare
                ? t.shareInviteLink()
                : t.copyInviteLink()
          }
          onPress={hand}
          disabled={minting}
          style={styles.wideButton}
        />
      </View>
      {/*
        Only an outcome, and only when there is one to report. A copy that
        happened because there was nowhere to share to looks exactly like a
        tap that did nothing, so it says where the link went; a share that
        went to the sheet is its own evidence and says nothing.
      */}
      {copied === 'idle' ? null : (
        <Text style={type.muted}>
          {copied === 'done' ? t.linkCopied() : t.clipboardRefused()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing(1) },
  /** The gap a section label below would otherwise sit straight on top of. */
  requests: { marginBottom: spacing(0.5) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  /**
   * A contact's row packs its one line to the left; this one has controls on
   * the end, so it spreads instead.
   */
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1.5),
  },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.5) },
  pendingTag: { ...type.muted, color: colors.textFaint },
  rowMain: { flex: 1, gap: 2 },
  rowPressed: { opacity: 0.7 },
  /**
   * Home's `startRow`, and deliberately the same numbers: the mark and the
   * label are one phrase and pack to the left rather than being spread apart,
   * and the card is shorter than a contact's because it has one line where
   * they have two.
   */
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(1.5),
    marginBottom: spacing(1.5),
  },
  addMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.floorDim,
  },
  addMarkGlyph: {
    color: colors.floor,
    fontSize: 19,
    // Centred by hand, as on Home: the glyph's box is taller than its ink.
    lineHeight: 21,
    fontWeight: '500',
  },
  /**
   * The row's label, and the open card's title — one style deliberately, so
   * the words cannot come to be drawn two different ways in the two halves of
   * one offer.
   */
  addLabel: { fontSize: 15, fontWeight: '600', color: colors.floor },
  addContact: { gap: spacing(1), marginBottom: spacing(1.5) },
  /**
   * What separates the two ways of adding somebody. A word rather than a rule:
   * they are alternatives to each other, and a line reads as the end of one
   * thing and the start of another where "or" says the two are one question
   * answered twice. Lower case and italic so it is a joint rather than a
   * heading — a second title inside one card would make it look like two.
   */
  or: {
    ...type.muted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: spacing(0.5),
  },
  invite: { gap: spacing(0.75) },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(0.5),
  },
  /**
   * The pair that ends the address form, pushed out to the card's two edges
   * rather than huddled at the right: *Cancel* on the left, *Send request* on
   * the right, which is where a phone puts a dismissal and a commitment.
   */
  addActionsSpread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing(0.5),
  },
  /** A single action that owns its row, drawn the full width of the card. */
  wideButton: { flex: 1 },
  message: { fontSize: 13 },
});

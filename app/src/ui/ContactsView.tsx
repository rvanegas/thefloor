import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  ContactView as Contact,
  HomeView as HomeViewData,
} from '../../../core/protocol';
import { useText } from '../i18n';
import { canShare, shareText } from '../share';
import { useApp } from '../state/AppProvider';
import { describeAvailability } from './availability';
import { Button, Card, Empty, SectionLabel } from './components';
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
 * around this is `HomeView`. See planning/decision/DECISIONS.md § *The tier
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
 * Adding a contact, which is handing somebody an invite link.
 *
 * **One action since 2026-10-15.** It was a card that opened onto an email
 * field, *Send request*, an *or*, and *Share Invite Link* underneath — two
 * ways of asking the same question with two different outcomes, a request
 * somebody had to answer and a link that made a contact outright. The field
 * went; the row is the button. See
 * `decision/2026-10-15-an-invite-link-carries-a-pin-again.md`.
 *
 * **It mints on every press**, so this asks the server each time rather than
 * holding a link. A link is good for one person — `/i/<username>/<pin>`,
 * spent by the first who takes it — so sharing twice has to produce two
 * links, or the second person gets one already spent. The URL is the
 * server's to compose, `origin` being something only it knows.
 *
 * The share sheet rather than the clipboard, for the reason the channel's
 * guest link uses it: the destination is a person, and this is how you reach
 * somebody you already talk to somewhere else. A browser with no Web Share
 * API falls back to a copy, and says so, since a copy that happened because
 * there was nowhere to share to looks exactly like a tap that did nothing.
 * See src/share.ts.
 *
 * **It is conditional on a username, and says why when there is none.** A
 * link cannot be written without one, so the absence is explained and made
 * actionable rather than hidden — the server answers `null`, and the row
 * opens onto *Choose a username*.
 */
function AddContact({
  onChooseUsername,
}: {
  /** Opens your own profile, already in edit mode. Absent before `me` lands. */
  onChooseUsername?: () => void;
}) {
  const app = useApp();
  const t = useText().contacts;
  const [minting, setMinting] = useState(false);
  const [outcome, setOutcome] = useState<
    'idle' | 'copied' | 'failed' | 'noUsername'
  >('idle');

  /** The same fade the profile's copy uses, for the two passing outcomes. */
  useEffect(() => {
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const timer = setTimeout(() => setOutcome('idle'), 2500);
    return () => clearTimeout(timer);
  }, [outcome]);

  async function hand() {
    setMinting(true);
    try {
      const url = await app.inviteLink();
      if (!url) {
        setOutcome('noUsername');
        return;
      }
      // The link alone, since 2026-10-13 — see `contactInvite`.
      const handoff = await shareText(t.contactInvite(url));
      setOutcome(
        handoff === 'copied' ? 'copied' : handoff === 'failed' ? 'failed' : 'idle'
      );
    } catch {
      setOutcome('failed');
    } finally {
      setMinting(false);
    }
  }

  // Home's start-a-channel row: a mark and a label in the shape of a card
  // rather than of a button, above the first section label. The two tabs'
  // one affordance for making something new should not be two different
  // shapes in two different places — available rather than urgent, which is
  // why only the mark carries the accent.
  return (
    <View style={styles.add}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.addAContact()}
        accessibilityHint={canShare ? t.shareInviteLink() : t.copyInviteLink()}
        onPress={hand}
        disabled={minting}
        style={({ pressed }) => pressed && styles.rowPressed}
      >
        <Card style={styles.addRow}>
          <View style={styles.addMark}>
            <Text style={styles.addMarkGlyph}>+</Text>
          </View>
          <Text style={styles.addLabel}>
            {minting ? t.makingALink() : t.addAContact()}
          </Text>
        </Card>
      </Pressable>
      {outcome === 'noUsername' ? (
        <Card style={styles.addContact}>
          <Text style={type.muted}>{t.toGenerateAnInviteLink()}</Text>
          <View style={styles.addActions}>
            <Button label={t.cancel()} onPress={() => setOutcome('idle')} />
            <Button
              label={t.chooseAUsername()}
              // Absent only in the moment before `me` lands, which is why the
              // button is drawn disabled rather than withheld: a control that
              // appears a beat after the sentence explaining it is a control
              // somebody has already given up looking for.
              onPress={() => {
                setOutcome('idle');
                onChooseUsername?.();
              }}
              disabled={!onChooseUsername}
            />
          </View>
        </Card>
      ) : outcome === 'copied' || outcome === 'failed' ? (
        <Text style={[type.muted, styles.outcome]}>
          {outcome === 'copied' ? t.linkCopied() : t.clipboardRefused()}
        </Text>
      ) : null}
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
  add: { gap: spacing(1), marginBottom: spacing(1.5) },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(1.5),
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
  addLabel: { fontSize: 15, fontWeight: '600', color: colors.floor },
  /** What *Choose a username* sits on, under the row that asked for it. */
  addContact: { gap: spacing(1) },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(0.5),
  },
  /** Under the row, aligned with its label rather than its mark. */
  outcome: { paddingHorizontal: spacing(1.5) },
});

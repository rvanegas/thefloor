import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ContactView as Contact } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { describeAvailability } from './availability';
import { Button, Card, Empty, Field, Screen, SectionLabel } from './components';
import { ProfileView } from './ProfileView';
import { colors, spacing, type } from './theme';

/**
 * The people you know, and whether they are about.
 *
 * Home used to carry this, and lost it when it became a list of channels —
 * which was right for Home and wrong for the fact: a channel's idleness says
 * when anybody was last in a room, and says nothing at all about whether its
 * other member is holding a phone right now. Those are different questions and
 * only one of them was still being answered.
 *
 * It is a screen rather than a section because of what a contact row is for.
 * A row is not a channel — the channel list is Home's job, and a contact row
 * that offered one would be the overlap that took the old list apart. What a
 * row does is open the person: where they are, how to reach them, and the one
 * destructive thing you can do about them.
 *
 * A profile opened from here is a different matter, and is why this screen now
 * takes `onEnterChannel`. Its "Channels with them" section is not a directory
 * of rooms competing with Home's; it is the rooms this pair share, read on the
 * screen about the pair, and the reason to read a line saying three people are
 * in one of them is to go there. See ProfileView.
 *
 * Requests stay on Home. They are not contacts yet, they are the one thing on
 * that screen that cannot be a channel, and answering one is a thing to do
 * rather than somebody to look up.
 *
 * You are a card of your own, since 2026-08-29, under the add-contact row
 * rather than above it, and under a section label reading *You* since
 * 2026-08-31. The server has never put you in your own contact list and still
 * does not — it returns the *other* id of each contacts row, which is what
 * stops the list being about you — so the card is drawn from `app.me` and sits
 * in its own section rather than in theirs. Adding somebody is what this
 * screen is for when the list is not enough, so it takes the top; your own
 * card is a way in to your profile, which is a thing you go to occasionally
 * and not the first thing to read. There is no
 * Settings button any more: what it opened was your own account, which is your
 * profile with the fields showing, and that now lives behind Edit on the
 * profile itself. See ProfileView.
 */
export function ContactsView({
  onHome,
  onEnterChannel,
}: {
  onHome: () => void;
  /**
   * Opens a channel shared with whoever's profile is open. Optional, so this
   * screen still renders somewhere with nowhere to go — the profile draws the
   * cards either way and only the tap depends on it.
   */
  onEnterChannel?: (channelId: string) => void;
}) {
  const app = useApp();
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null
  );
  const now = app.serverNow();

  const contacts = (app.home?.contacts ?? [])
    .filter((entry) => entry.status === 'accepted')
    .sort(byAvailability);

  if (profile) {
    return (
      <ProfileView
        accountId={profile.id}
        // Read from `app.me` for your own rather than from what the card said
        // when it was tapped, so a name changed on the profile itself is not
        // stale the moment it is written.
        fallbackName={
          profile.id === app.me?.id ? app.me.displayName : profile.name
        }
        onBack={() => setProfile(null)}
        // Stepping into a channel the two of you share. Handed straight
        // through: what a tap does — arrive, or merely open — is the profile's
        // business and the same preference Home reads, and where the channel
        // screen goes when it is closed is whoever gave us this.
        onEnterChannel={onEnterChannel}
        // Removing a contact from their own profile takes the row this screen
        // was opened from with it, so there is nothing to go back to.
        onRemoved={() => setProfile(null)}
      />
    );
  }

  /*
    Pinned, as Home's and the channel's are. This list is as long as the number
    of people somebody knows and has no other way out of it — the one button up
    here is the way back — so a header that scrolls away strands whoever is
    furthest down it, which is exactly whoever has the most contacts.

    `AddContact` stays in the scroll. It is a field with a button under it and
    it grows a line when it has something to report, and a pinned header is the
    one place on a screen that cannot afford something that changes height for
    a reason nobody asked about. It also is not navigation: it is the first
    thing you do on this screen, which is what the top of a scroll is for.
  */
  const header = (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={type.title}>Contacts</Text>
        {/* The way back, and nothing beside it. Every other screen carries its
            scope's settings here too; this one's were your own account, which
            is your own profile — the card under "You". */}
        <View style={styles.headerActions}>
          <Button label="Home" variant="ghost" onPress={onHome} />
        </View>
      </View>
    </View>
  );

  return (
    <Screen header={header} contentStyle={styles.container}>
      <AddContact />

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
          <SectionLabel>You</SectionLabel>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${app.me.displayName}. You. Open your profile.`}
            onPress={() =>
              app.me && setProfile({ id: app.me.id, name: app.me.displayName })
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

      {contacts.length > 0 ? <SectionLabel>Contacts</SectionLabel> : null}
      {contacts.length === 0 ? (
        <Empty>
          Nobody yet. Add somebody by the address they signed up with, and they
          decide.
        </Empty>
      ) : (
        <View style={styles.list}>
          {contacts.map((entry) => (
            <ContactRow
              key={entry.account.id}
              entry={entry}
              now={now}
              onPress={() =>
                setProfile({
                  id: entry.account.id,
                  name: entry.account.displayName,
                })
              }
            />
          ))}
        </View>
      )}
    </Screen>
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
  const availability = describeAvailability(entry, now);
  return (
    // The whole row, as on Home: there is one thing to do with a contact from
    // here, so a target the size of the row is the honest shape for it.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.account.displayName}.${
        availability ? ` ${availability}.` : ''
      } Open their profile.`}
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
 * Asking somebody to be a contact, folded away until it is wanted.
 *
 * It was a permanent field at the foot of Home. At the top of a list of people
 * it would be the first thing on the screen every time, and adding a contact is
 * something you do occasionally where reading the list is what you came for —
 * so it is a line until tapped. The field only exists while it is open, which
 * is also what keeps the keyboard off a screen nobody is typing into.
 */
function AddContact() {
  const app = useApp();
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
        text: accepted
          ? 'They had already asked — you are now contacts.'
          : 'Request sent — awaiting their acceptance.',
      });
      setQuery('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    // Closed, it is Home's start-a-channel row: a mark and a label in the
    // shape of a card rather than of a button. The two screens' one
    // affordance for making something new should not be two different
    // shapes, and this is the same kind of thing — available rather than
    // urgent, which is why only the mark carries the accent.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add contact"
        onPress={() => setOpen(true)}
        style={({ pressed }) => pressed && styles.rowPressed}
      >
        <Card style={styles.addRow}>
          <View style={styles.addMark}>
            <Text style={styles.addMarkGlyph}>+</Text>
          </View>
          <Text style={styles.addLabel}>Add contact</Text>
        </Card>
      </Pressable>
    );
  }

  return (
    <Card style={styles.addContact}>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search by email address"
        keyboardType="email-address"
        autoFocus
        onSubmit={query.trim() && !busy ? send : undefined}
        submitLabel="send"
      />
      <View style={styles.addActions}>
        <Button
          label="Cancel"
          variant="ghost"
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
          label={busy ? 'Sending…' : 'Send request'}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  /**
   * The pinned header, carrying `container`'s horizontal padding itself now
   * that it sits outside the scroll, so the title lines up with the rows
   * under it. The hairline is what a pinned header needs and a scrolling one
   * does not — see the note on TranscriptView's.
   */
  header: {
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(1),
    paddingBottom: spacing(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  /** What used to be `header` itself: the title and the way back. */
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /**
   * Negative trailing margin, so `Button`'s card-sized horizontal padding
   * does not inset it further from the edge than the title is from the other
   * one.
   */
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -spacing(1),
  },
  list: { gap: spacing(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
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
  addLabel: { fontSize: 15, fontWeight: '600', color: colors.floor },
  addContact: { gap: spacing(1), marginBottom: spacing(1.5) },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(0.5),
  },
  message: { fontSize: 13 },
});

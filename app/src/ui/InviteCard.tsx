import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  canInvite,
  canInviteGuest,
  canMintMemberLink,
  capacityOf,
  holdsTheControls,
  isOwner,
  membersPromised,
  presentOrEmpty,
} from '../../../core/channel';
import type { ChannelState } from '../../../core/types';
import { api } from '../api/http';
import { useText } from '../i18n';
import { canShare, shareLink } from '../share';
import { useApp } from '../state/AppProvider';
import { Button, Card } from './components';
import { colors, spacing, type } from './theme';

/** Which of the card's three faces is showing, beyond the closed row. */
type Stage = 'choose' | 'member' | 'guest';

/**
 * **The People tab's way in, since 2026-10-16**, when the *Invite* tab went.
 * After the people cards, a row in the shape of *Add a contact* and *Start a
 * channel* — the `+` mark and the word in the floor's colour, the one
 * affordance for making something new drawn the same on all three tabs that
 * have one.
 *
 * **Kind first, then who**, which is the sequence Rodrigo asked for and the
 * reverse of the tab it replaced. There, each contact's row opened its own
 * *Member* or *Guest*; here the card opens to *Invite as member* and *Invite
 * as guest*, and the choice opens the list of contacts not already in the
 * channel with that one act on every row, and a link at the foot for
 * somebody who is not a contact — a *member link* (`/m/<username>/<pin>`), or
 * in a community its own link, for a member; the *guest link* for a guest.
 *
 * **In the tab, never a dialog.** Each step expands in place under the row,
 * so the people it is about stay on screen above it, which is the reasoning
 * that took the per-contact fork out of an `Alert` on 2026-09-22. The mark
 * turns to a `×` while the card is open and closes it from any step; *Back*
 * goes up one.
 *
 * Every control is drawn, refused with the sentence that says why rather than
 * withheld, as the tab drew them: a full channel greys *member* and says so,
 * a community's member is told the owner asks people in, and somebody outside
 * the room is told to step in.
 */
export function InviteCard({
  channel,
  me,
  now,
  onInviteMember,
}: {
  channel: ChannelState;
  me: string;
  now: number;
  /** Asks a contact in as a member: the `INVITE` action. */
  onInviteMember: (contactId: string) => void;
}) {
  const t = useText().channelCards;
  const tc = useText().channel;
  const app = useApp();
  const [stage, setStage] = React.useState<Stage | null>(null);
  /** Per contact: `'asking'`, `'asked'`, or the sentence the server refused with. */
  const [askedIn, setAskedIn] = React.useState<Record<string, string>>({});
  const [linking, setLinking] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const ownersAlone = !holdsTheControls(channel, me);
  const inTheRoom = presentOrEmpty(channel, me);
  const mayAskIn = inTheRoom && !ownersAlone;
  const capacity = capacityOf(channel);
  const full = membersPromised(channel, now) >= capacity;
  const community = channel.owner !== undefined;

  const invitable = (app.home?.contacts ?? []).filter(
    (entry) => entry.status === 'accepted' && !channel.participants.includes(entry.account.id)
  );
  // The accounts already sitting in the room as guests, whose second seat the
  // server would refuse: the row says what is true instead.
  const seated = new Set(
    Object.values(channel.guests ?? {})
      .map((guest) => guest.accountId)
      .filter((id): id is string => !!id)
  );

  const go = (next: Stage | null) => {
    setStage(next);
    setNote(null);
    setError(null);
  };

  /** Mints the link this kind gets, and hands it to the share sheet. */
  const shareTheLink = async (kind: 'member' | 'guest') => {
    setLinking(true);
    setNote(null);
    setError(null);
    try {
      let url: string | null;
      if (kind === 'guest') {
        url = await app.inviteGuest(channel.id);
        // After the mint: the rung claims a guest link exists.
        app.markTried('guest');
      } else if (community) {
        url = app.token ? (await api.communityLink(app.token, channel.id)).url : null;
      } else {
        url = await app.inviteMember(channel.id);
      }
      if (!url) {
        setError(community ? tc.thatDidNotWork() : t.linkNeedsAUsername());
        return;
      }
      const handoff = await shareLink(url);
      if (handoff === 'copied') setNote(tc.linkCopied());
      else if (handoff === 'failed') setError(tc.linkWouldNotCopy());
    } catch (e) {
      setError(e instanceof Error ? e.message : tc.thatDidNotWork());
    } finally {
      setLinking(false);
    }
  };

  const askAsGuest = async (contactId: string) => {
    setAskedIn((prior) => ({ ...prior, [contactId]: 'asking' }));
    try {
      await app.askInAsGuest(channel.id, contactId);
      setAskedIn((prior) => ({ ...prior, [contactId]: 'asked' }));
    } catch (e) {
      setAskedIn((prior) => ({
        ...prior,
        [contactId]: e instanceof Error ? e.message : tc.thatDidNotWork(),
      }));
    }
  };

  // Why a refused option is refused, in the order the room decides it.
  const refusal = ownersAlone
    ? t.ownerAsksPeopleIn()
    : !inTheRoom
      ? t.stepInToAskAnybodyIn()
      : null;

  const memberLinkAllowed = community
    ? isOwner(channel, me) && inTheRoom
    : canMintMemberLink(channel, me, now);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.inviteCard()}
        accessibilityState={{ expanded: stage !== null }}
        onPress={() => go(stage === null ? 'choose' : null)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Card style={styles.row}>
          <View style={styles.mark}>
            <Text style={[styles.markGlyph, stage !== null && styles.markGlyphOpen]}>+</Text>
          </View>
          <Text style={styles.label}>{t.inviteCard()}</Text>
        </Card>
      </Pressable>

      {stage === 'choose' ? (
        <Card style={styles.stack}>
          <Button
            label={t.inviteAsMember()}
            disabled={!mayAskIn || full}
            onPress={() => go('member')}
          />
          <Button
            label={t.inviteAsGuest()}
            disabled={!mayAskIn}
            onPress={() => go('guest')}
          />
          <Text style={type.muted}>
            {refusal ?? (full ? t.memberOrGuestFull(capacity) : t.memberOrGuest())}
          </Text>
        </Card>
      ) : null}

      {stage === 'member' || stage === 'guest' ? (
        <Card style={styles.stack}>
          <View style={styles.head}>
            <Text style={styles.headLabel}>
              {stage === 'member' ? t.inviteAsMember() : t.inviteAsGuest()}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.back()}
              hitSlop={spacing(1)}
              onPress={() => go('choose')}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.back}>{t.back()}</Text>
            </Pressable>
          </View>

          {invitable.length === 0 ? (
            <Text style={type.muted}>{t.everyContactAlreadyIn()}</Text>
          ) : (
            invitable.map((entry) => {
              const id = entry.account.id;
              const state = askedIn[id];
              const said =
                stage === 'guest' && seated.has(id)
                  ? t.hereAsAGuest()
                  : stage === 'guest' && state === 'asked'
                    ? t.askedInAsAGuest()
                    : stage === 'guest' && state === 'asking'
                      ? t.asking()
                      : null;
              const refused =
                stage === 'guest' && state && state !== 'asking' && state !== 'asked'
                  ? state
                  : null;
              return (
                <View key={id}>
                  <View style={styles.contact}>
                    <Text style={[type.body, styles.name]} numberOfLines={1}>
                      {entry.account.displayName}
                    </Text>
                    {said ? (
                      <Text style={type.muted}>{said}</Text>
                    ) : (
                      <Button
                        label={stage === 'member' ? t.inviteThem() : t.askThemIn()}
                        accessibilityLabel={t.invite(entry.account.displayName)}
                        disabled={
                          stage === 'member'
                            ? !canInvite(channel, me, id, now)
                            : !mayAskIn
                        }
                        onPress={() =>
                          stage === 'member' ? onInviteMember(id) : void askAsGuest(id)
                        }
                      />
                    )}
                  </View>
                  {refused ? <Text style={styles.warning}>{refused}</Text> : null}
                </View>
              );
            })
          )}

          <View style={styles.link}>
            <Button
              label={
                linking
                  ? tc.makingALink()
                  : stage === 'guest'
                    ? canShare
                      ? tc.shareAGuestLink()
                      : tc.copyAGuestLink()
                    : community
                      ? canShare
                        ? t.shareTheCommunityLink()
                        : t.copyTheCommunityLink()
                      : canShare
                        ? t.shareAMemberLink()
                        : t.copyAMemberLink()
              }
              disabled={
                linking ||
                (stage === 'guest' ? !canInviteGuest(channel, me) : !memberLinkAllowed)
              }
              onPress={() => void shareTheLink(stage)}
            />
            <Text style={type.muted}>
              {stage === 'guest'
                ? canInviteGuest(channel, me)
                  ? tc.guestLinkWhat()
                  : ownersAlone
                    ? tc.ownerInvites()
                    : tc.stepInToMakeALink()
                : community
                  ? t.communityLinkWhat()
                  : full
                    ? t.memberOrGuestFull(capacity)
                    : t.memberLinkWhat(capacity)}
            </Text>
            {error ? <Text style={styles.warning}>{error}</Text> : null}
            {note ? <Text style={type.muted}>{note}</Text> : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing(1) },
  // *Start a channel*'s row and *Add a contact*'s, number for number: the same
  // affordance, the same shape, on all three tabs that have one.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(1.5),
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.floorDim,
  },
  markGlyph: {
    color: colors.floor,
    fontSize: 19,
    // Centred by hand: the glyph's box is taller than its ink.
    lineHeight: 21,
    fontWeight: '500',
  },
  // A `×` drawn by the `+` already there, while the card holds something
  // open — the per-contact mark's construction, kept.
  markGlyphOpen: { transform: [{ rotate: '45deg' }] },
  label: { fontSize: 15, fontWeight: '600', color: colors.floor },
  pressed: { opacity: 0.6 },
  stack: { gap: spacing(1) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  back: { color: colors.text, fontSize: 13, fontWeight: '600' },
  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  name: { flex: 1 },
  link: { gap: spacing(1), marginTop: spacing(0.5) },
  warning: { color: colors.silenced, fontSize: 13 },
});

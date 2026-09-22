import { isItunesCategory } from '../../core/publication';
import { artworkKeyFor } from './artwork';
import { PUBLISHED_CONTENT_TYPE, transcodeToPublished } from './export';
import { isGuestId } from './guests';
import type { Db, RecordingRow } from './db';
import type { RecordingStore } from './storage';
import type { UsageMeter } from './usage';

/**
 * Publication: a channel declaring itself public, and the recordings its
 * participants have agreed to put in front of the world.
 *
 * **Everything in this file is about one asymmetry.** Every other rule this
 * server has about a recording is scoped to channel membership, down to
 * hiding a recording's *existence* — the export route answers 404 for absent,
 * deleted and not-yours alike, and says in a comment that knowing a recording
 * exists is itself something only the channel's members should learn.
 * Publishing inverts that for a chosen subset, and it is the first act in
 * this system that a later act cannot undo. Withdrawing takes the item off
 * the page and out of the feed; it does not reach a file somebody has already
 * downloaded, and this system has no reach into any subscriber's client.
 *
 * So the bar is deliberately higher than anything else here, in three ways
 * that are each worth stating separately:
 *
 * 1. **Unanimity, not authority.** `mayManageRecording` is the bar for acts
 *    that shape a shared artefact — deleting, renaming, transcribing — and it
 *    asks whether you are a member. That is right for those: they show what
 *    everybody said to people who were already there. Publishing shows it to
 *    anybody, and no single member has standing to decide that for the rest.
 *    A recording publishes when every account that took part has consented,
 *    and not before. See `recording_consents` in db.ts.
 *
 * 2. **A guest is asked where there is anybody to ask, and is an obstacle
 *    only where there is not.** The rule is about whose voice would be
 *    broadcast, so it turns on two things and not on the word *guest*:
 *
 *    - **Did they speak?** A run's audience unions presence with stems, so
 *      somebody who sat in the room and never opened their microphone is on
 *      the roster. Nothing of theirs is in the audio. They are not asked and
 *      they block nothing — the alternative lets a silent listener veto a
 *      conversation they are not in, permanently, with nobody able to undo it.
 *    - **Do they have an account?** A guest is somebody holding a seat in a
 *      channel they are not a member of, *with or without an account here*.
 *      One who signed in before knocking is a person this server can ask, so
 *      they join the consent set exactly like a member — and may withdraw
 *      exactly like one.
 *
 *    What is left is a guest who spoke and has no account, and there the
 *    refusal stands: there is genuinely nobody to ask. The alternatives were
 *    dropping their stem, which changes what the episode *is* and would mean
 *    re-rendering from stems — the one thing `transcodeToPublished` forbids —
 *    or asking the members on their behalf, which is exactly the standing
 *    point 1 denies. The fix is a guest link that carries the possibility up
 *    front, which is a design rather than a guard and is in the task.
 *
 * 3. **The channel and the recording are two decisions.** A public channel
 *    has a page; a published recording is on it. A channel that goes private
 *    again takes the whole page down without clearing a single
 *    `published_at`, which is the honest shape: the consents are still given,
 *    and making the channel public again is not a fresh decision anybody has
 *    to retake.
 *
 * **On what is in the audio.** `planning/decisions/2026-09-16-nothing-here-knows-what-a-track-is.md`
 * retired the copyright question on the explicit strength of there being no
 * public surface, and named this feature as the one thing that would reopen
 * it. It is reopened here, and the answer is not to start inspecting uploads
 * — acquiring that knowledge is what creates the duty, and that argument is
 * unchanged. The answer is that a host serving the public owes a way to be
 * told and a willingness to act: the public page carries a takedown address,
 * and `unpublish` is the act. Nothing here fingerprints, hashes or guesses.
 */
export class Publication {
  constructor(
    private db: Db,
    private now: () => number,
    private options: {
      store: RecordingStore | null;
      usage: UsageMeter;
      /** Pushes a fresh snapshot of one channel to everybody in it. */
      announce: (channelId: string) => void;
      /** One recording's finished, floor-gated Opus mix. */
      recordingAudio: (recordingId: string) => Promise<Buffer>;
      onError: (error: unknown, context: string) => void;
    }
  ) {}

  // --- The channel's own declaration ---------------------------------------

  /**
   * Turns a channel's public page on or off.
   *
   * Any member may, which is the one place here the ordinary bar applies —
   * and it applies because this decides whether a *page* exists, not what is
   * on it. A public channel with nothing published is a page that says so,
   * and that is the correct intermediate state rather than a leak: the
   * recordings on it are exactly the ones every participant agreed to, and
   * this switch cannot add one.
   *
   * Going private is immediate and complete in the only sense available: the
   * page and the feed stop answering. It does not clear anybody's consent,
   * and it does not recall an episode already downloaded — see the note on
   * the class.
   *
   * **Only a named channel may have one**, which is the one precondition here
   * and is about what a stranger reads rather than about who is deciding. An
   * unnamed channel is described by its roster — `describeChannel` in core —
   * so the only name it has is a list of the people in it, and the one thing
   * a public page is forbidden to say is who these people are. The page and
   * the directory row used to answer that with the words *A conversation*,
   * which is not a name: it identified nothing, it was the same string on
   * every such row, and a list on which several entries are indistinguishable
   * is a list nobody can use. So the name is asked for at the switch, where
   * the field to type it into is on the same screen, rather than substituted
   * afterwards. Clearing it again is refused in channels.ts, the two guards
   * being the two directions of one rule.
   */
  setPublic(
    channelId: string,
    userId: string,
    wanted: boolean
  ): { ok: true; publicAt: number | null } | Refusal {
    const channel = this.channelFor(channelId, userId);
    if (!channel) return refuse('No such channel.', 'not_found');
    if (wanted && channel.name === null) {
      return refuse(
        'Name this channel before giving it a public page. An unnamed channel is listed by who is in it, and a public page never names a member.',
        'conflict'
      );
    }

    const publicAt = wanted ? (channel.public_at ?? this.now()) : null;
    this.db
      .prepare('UPDATE channels SET public_at = ? WHERE id = ?')
      .run(publicAt, channelId);
    this.options.announce(channelId);
    return { ok: true, publicAt };
  }

  /**
   * Sets the declarations a feed requires and nothing can derive: the
   * language its conversations are in, whether they are explicit, and which
   * of Apple's categories it belongs under.
   *
   * None is inferable and none is guessed. A feed with no `<language>` falls
   * back to the site default rather than to a detection, because a wrong
   * declaration about somebody's own channel is worse than an absent one —
   * see feed.ts. A category is refused outright rather than corrected: it has
   * to be one of Apple's exact strings or the directory rejects the feed, and
   * silently storing something near it would fail at submission instead.
   */
  setDeclarations(
    channelId: string,
    userId: string,
    declarations: {
      language?: string | null;
      explicit?: boolean | null;
      category?: string | null;
    }
  ): { ok: true } | Refusal {
    const channel = this.channelFor(channelId, userId);
    if (!channel) return refuse('No such channel.', 'not_found');

    if (declarations.category !== undefined && declarations.category !== null) {
      if (!isItunesCategory(declarations.category)) {
        return refuse('That is not one of Apple’s categories.', 'invalid');
      }
    }
    if (declarations.language !== undefined) {
      const trimmed = declarations.language?.trim().slice(0, 32) || null;
      this.db
        .prepare('UPDATE channels SET language = ? WHERE id = ?')
        .run(trimmed, channelId);
    }
    if (declarations.explicit !== undefined) {
      this.db
        .prepare('UPDATE channels SET explicit = ? WHERE id = ?')
        .run(
          declarations.explicit === null ? null : declarations.explicit ? 1 : 0,
          channelId
        );
    }
    if (declarations.category !== undefined) {
      this.db
        .prepare('UPDATE channels SET category = ? WHERE id = ?')
        .run(declarations.category, channelId);
    }
    this.options.announce(channelId);
    return { ok: true };
  }

  /**
   * Stores a channel's cover art, replacing whatever was there.
   *
   * Any member may, on the same terms as `setPublic`: it is the channel's
   * public face rather than anybody's voice, and nothing about it is somebody
   * else's to consent to.
   *
   * The object is written before the row, so a failure leaves a key nobody
   * reads rather than a row promising a picture that is not there — the same
   * ordering `mix` uses and for the same reason.
   */
  async setArtwork(
    channelId: string,
    userId: string,
    bytes: Buffer,
    contentType: string
  ): Promise<{ ok: true } | Refusal> {
    const channel = this.channelFor(channelId, userId);
    if (!channel) return refuse('No such channel.', 'not_found');
    const store = this.options.store;
    if (!store) return refuse('Storage is not configured.', 'conflict');

    await store.put(artworkKeyFor(channelId), bytes, contentType);
    this.db
      .prepare('UPDATE channels SET image_at = ?, image_type = ? WHERE id = ?')
      .run(this.now(), contentType, channelId);
    this.options.announce(channelId);
    return { ok: true };
  }

  // --- Consent, which is the whole of the difficulty -----------------------

  /**
   * Records that this person agrees their recording may be published, and
   * publishes it if that was the last agreement outstanding.
   *
   * Consent is per recording rather than per channel, deliberately. Agreeing
   * to publish last Tuesday's conversation says nothing whatever about this
   * one, and a standing channel-level permission would quietly convert one
   * judgement into every future judgement.
   *
   * **The publish happens here rather than in a second call somebody makes.**
   * If it did not, the last person to consent would then have to press a
   * different button, and everybody before them would have agreed to
   * something that did not happen — which makes "I consented" and "it is
   * published" two states a member has to reason about separately for no
   * gain. Unanimity is the decision; this is where the decision takes effect.
   */
  consent(
    recordingId: string,
    userId: string
  ): { ok: true; state: PublicationState } | Refusal {
    const row = this.recordingFor(recordingId, userId);
    if (!row) return refuse('No such recording.', 'not_found');

    const blocked = this.whyNotPublishable(row);
    if (blocked) return blocked;

    // A member of the channel who was not in this recording. `stateOf`
    // recomputes the consent set from who took part and drops anybody else's
    // row, so this used to be a write that could never be read back: the app
    // showed the checkbox, the tick stored a row, and `mine` came back false
    // on the next snapshot. Refused here rather than stored and ignored —
    // agreeing to publish a conversation you are not in is not a thing to
    // record. The app no longer offers it either.
    if (!this.mustConsent(row).includes(userId)) {
      return refuse(
        'None of your voice is in this recording, so there is nothing here ' +
          'for you to agree to.',
        'invalid'
      );
    }

    this.db
      .prepare(
        `INSERT INTO recording_consents (recording_id, account_id, at)
         VALUES (?, ?, ?)
         ON CONFLICT (recording_id, account_id) DO NOTHING`
      )
      .run(recordingId, userId, this.now());

    const state = this.stateOf(row);
    if (state.consented.length === state.required.length && !row.published_at) {
      this.publish(row);
    }
    this.options.announce(row.channel_id);
    return { ok: true, state: this.stateOf(this.reread(recordingId) ?? row) };
  }

  /**
   * Withdraws one person's agreement, and takes the recording down if it was
   * published.
   *
   * **Any one participant, at any time, with no appeal to the others.** That
   * is the mirror of unanimity and follows from it: if it took everybody to
   * put it up, it cannot take everybody to take it down, or a person who
   * changed their mind would be outvoted about their own voice.
   *
   * What this cannot do is the thing the interface has to say out loud. It
   * stops new listeners; it does not reach the clients that already have the
   * file. `unpublish` below is the same act performed by somebody who was not
   * in the room, and is no more capable.
   */
  withdraw(
    recordingId: string,
    userId: string
  ): { ok: true; state: PublicationState } | Refusal {
    const row = this.recordingFor(recordingId, userId);
    if (!row) return refuse('No such recording.', 'not_found');

    this.db
      .prepare(
        'DELETE FROM recording_consents WHERE recording_id = ? AND account_id = ?'
      )
      .run(recordingId, userId);
    if (row.published_at) this.unpublish(recordingId);
    this.options.announce(row.channel_id);
    return { ok: true, state: this.stateOf(this.reread(recordingId) ?? row) };
  }

  /**
   * Where one recording stands, for the card that offers to publish it.
   *
   * The names of who has and has not agreed are deliberately in here: a
   * unanimity rule that does not say who is outstanding is one that leaves
   * five people waiting on each other in silence.
   */
  stateOf(row: RecordingRow): PublicationState {
    const required = this.mustConsent(row);
    const consented = (
      this.db
        .prepare(
          'SELECT account_id FROM recording_consents WHERE recording_id = ?'
        )
        .all(row.id) as unknown as Array<{ account_id: string }>
    )
      .map((r) => r.account_id)
      // Somebody who has left the channel is not asked, and their old consent
      // is not counted either — the set is recomputed from who took part, so
      // a stale row cannot hold a publication open or push one through.
      .filter((id) => required.includes(id));

    return {
      required,
      consented,
      publishedAt: row.published_at,
      audioState: row.aac_state,
      blockedByGuest: this.blockingGuests(row).length > 0,
    };
  }

  // --- What makes a recording ineligible, before anybody is asked ----------

  /**
   * The refusals that are facts about the recording rather than about who is
   * asking. Checked before a consent is even recorded, so that nobody agrees
   * to something that was never going to happen.
   */
  private whyNotPublishable(row: RecordingRow): Refusal | null {
    if (row.deleted_at !== null) {
      return refuse('This recording has been deleted.', 'not_found');
    }
    if (this.blockingGuests(row).length > 0) {
      return refuse(
        'Somebody spoke here as a guest without an account, so there is ' +
          'nobody to ask. This recording cannot be published.',
        'invalid'
      );
    }
    if (row.mix_state === 'pending') {
      return refuse('This recording is still being prepared.', 'conflict');
    }
    return null;
  }

  /**
   * Every guest identity this recording touched, and the two things about
   * each that decide what it means for publishing.
   *
   * **`spoke` is the question, not `present`.** A recording's audience unions
   * presence with stems — see `fileRun`, which says why — so somebody who sat
   * in the room and never opened their microphone is on the roster. Nothing
   * of theirs is in the audio, so there is nothing of theirs to publish and
   * nothing for them to consent to. Treating them as an obstacle would make a
   * silent listener able to veto a conversation they are not in.
   *
   * **`accountId` is the other half.** A *guest* is somebody holding a seat
   * in a channel they are not a member of — with or without an account here,
   * as GLOSSARY.md says. One who signed in before knocking has an account on
   * `guest_sessions`, which means there is a person to ask after all: they
   * join the consent set exactly like a member. Only a guest with no account
   * is genuinely unreachable.
   */
  private guestsOf(row: RecordingRow): Array<{
    identity: string;
    accountId: string | null;
    spoke: boolean;
    agreed: boolean;
  }> {
    const roster = parseJson<string[]>(row.participants) ?? [];
    const stems = parseJson<Record<string, unknown[]>>(row.stems) ?? {};
    const identities = [
      ...new Set([...roster, ...Object.keys(stems)]),
    ].filter(isGuestId);

    return identities.map((identity) => {
      const session = this.db
        .prepare(
          'SELECT account_id, publish_consent_at FROM guest_sessions WHERE id = ?'
        )
        .get(identity) as
        | { account_id: string | null; publish_consent_at: number | null }
        | undefined;
      return {
        identity,
        // A seat that has since been swept leaves no row, which reads as no
        // account and no agreement — the safe direction in both: it makes
        // them count as somebody who cannot be asked rather than as somebody
        // silently taken as willing.
        accountId: session?.account_id ?? null,
        agreed: session?.publish_consent_at != null,
        spoke: (stems[identity]?.length ?? 0) > 0,
      };
    });
  }

  /**
   * The guests who actually stop this being publishable.
   *
   * Three ways not to be one, and each is a different kind of answer:
   * they never spoke, so none of their voice is in it; they have an account,
   * so they are asked per recording like a member; or they agreed at the
   * microphone, which is the one moment a seat with no account can be asked
   * anything meaningful — see `Guests.setPublishConsent`.
   *
   * What is left is somebody who spoke, has no account, and has not agreed:
   * their voice is in the audio and there is nobody to ask.
   */
  private blockingGuests(row: RecordingRow): string[] {
    return this.guestsOf(row)
      .filter((guest) => guest.spoke && !guest.accountId && !guest.agreed)
      .map((guest) => guest.identity);
  }

  /**
   * A guest has changed their mind at the microphone. Takes down anything in
   * this channel their voice is in, if they have stopped agreeing.
   *
   * **The same act as a member's withdrawal and it is not a coincidence.**
   * A seat cannot be asked per recording — it expires, so there is nobody to
   * come back to — but while it lives, the person holding it has exactly the
   * standing a member has over their own voice. Agreeing again does not
   * republish: somebody else has to be the one to decide that, which is what
   * a consent is for.
   */
  guestConsentChanged(
    channelId: string,
    guestId: string,
    consented: boolean
  ): void {
    if (consented) return;
    const rows = this.db
      .prepare(
        `SELECT * FROM recordings
          WHERE channel_id = ? AND published_at IS NOT NULL`
      )
      .all(channelId) as unknown as RecordingRow[];
    for (const row of rows) {
      if (this.blockingGuests(row).includes(guestId)) this.unpublish(row.id);
    }
    this.options.announce(channelId);
  }

  /**
   * Whose agreement is needed: every account whose voice this would publish.
   *
   * `media` is not a person and is filtered out — a track played into the
   * room has a stem and no opinion.
   *
   * Guests with accounts are folded in under those accounts rather than under
   * their seat, which is what makes the same person one entry whether they
   * arrived through the front door or through a link. Guests without accounts
   * are absent because there is nobody the list could name; whether their
   * presence stops publication altogether is `blockingGuests`, above.
   */
  private mustConsent(row: RecordingRow): string[] {
    const roster = parseJson<string[]>(row.participants) ?? [];
    const stems = Object.keys(
      parseJson<Record<string, unknown>>(row.stems) ?? {}
    );
    const members = [...new Set([...roster, ...stems])].filter(
      (id) => !isGuestId(id) && id !== MEDIA_IDENTITY
    );
    // Only guests with accounts, and only ones who spoke. A guest who agreed
    // at the microphone is *not* here: they have said yes once, for this
    // seat, and there is no account to come back and ask again — so they are
    // not an outstanding agreement anybody could be waiting on. See
    // `blockingGuests`, which is where their answer is actually read.
    const guestAccounts = this.guestsOf(row)
      .filter((guest) => guest.spoke && guest.accountId)
      .map((guest) => guest.accountId!);
    return [...new Set([...members, ...guestAccounts])];
  }

  // --- The two acts themselves ---------------------------------------------

  /**
   * Marks a recording published and starts the transcode.
   *
   * The row is marked before the AAC file exists, and the order is
   * deliberate. `aac_state` is what the page and the feed read to decide
   * whether to offer an episode yet, so a published-but-pending recording is
   * a representable state — which is the state every published recording
   * passes through, and the reason that column exists at all rather than a
   * fourth value in `mix_state`.
   */
  private publish(row: RecordingRow): void {
    // An episode that was published before, withdrawn and published again
    // still has its file: `unpublish` deliberately leaves the object in the
    // bucket so that a reversed decision costs nothing. Re-encoding it would
    // make a minute's second thoughts cost a transcode and leave the episode
    // unavailable in the meantime, for bytes that are already correct.
    const republishing = row.aac_state === 'ready' && !!row.published_bytes;
    this.db
      .prepare(
        'UPDATE recordings SET published_at = ?, aac_state = ? WHERE id = ?'
      )
      .run(this.now(), republishing ? 'ready' : 'pending', row.id);
    if (!republishing) void this.transcode(row.id, row.channel_id);
  }

  /**
   * Takes a recording out of the feed and off the page.
   *
   * `published_at` is cleared and the AAC object is left in the bucket. That
   * looks like a leak and is not: the key is unguessable, the route that
   * serves it checks `published_at` on every request, and the sweep removes
   * it with everything else when the recording is deleted. Deleting it here
   * instead would mean republishing costs a second transcode for a decision
   * somebody may reverse in a minute.
   */
  unpublish(recordingId: string): void {
    this.db
      .prepare('UPDATE recordings SET published_at = NULL WHERE id = ?')
      .run(recordingId);
  }

  /**
   * Renders the M4A a podcast client can play, from the Opus mix.
   *
   * **From the mix, never from the stems** — see `transcodeToPublished`,
   * which says why at length. The short version is that the floor is applied
   * once, in `buildStemGraph`, and anything that rendered its own audio for
   * publication would be a second place it could be got wrong.
   *
   * Failure is recorded rather than thrown. Nobody is holding a request open:
   * this runs after the consent that triggered it has already been answered,
   * exactly as mixing runs after a run ends, and a failed transcode leaves a
   * published recording whose page entry says it is still being prepared.
   */
  private async transcode(
    recordingId: string,
    channelId: string
  ): Promise<void> {
    const store = this.options.store;
    if (!store) return;
    try {
      const mixed = await this.options.recordingAudio(recordingId);
      const { data } = await transcodeToPublished(mixed);
      await store.put(
        publishedKeyFor(channelId, recordingId),
        data,
        PUBLISHED_CONTENT_TYPE
      );
      this.options.usage.recordBytes({
        kind: 'publish-write',
        bytes: data.length,
        recordingId,
      });
      this.db
        .prepare(
          "UPDATE recordings SET aac_state = 'ready', published_bytes = ? WHERE id = ?"
        )
        .run(data.length, recordingId);
    } catch (error) {
      this.db
        .prepare("UPDATE recordings SET aac_state = 'failed' WHERE id = ?")
        .run(recordingId);
      this.options.onError(error, `publish transcode ${recordingId}`);
    }
    // Nobody asked for this, so no dispatch is going to push a snapshot on
    // its behalf — the same reason `mix` emits when it stores a mix.
    this.options.announce(channelId);
  }

  // --- Lookups -------------------------------------------------------------

  private channelFor(
    channelId: string,
    userId: string
  ): { id: string; name: string | null; public_at: number | null } | null {
    const row = this.db
      .prepare(
        `SELECT id, name, public_at FROM channels
          WHERE id = ? AND deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM json_each(channels.participants)
                         WHERE json_each.value = ?)`
      )
      .get(channelId, userId) as
      | { id: string; name: string | null; public_at: number | null }
      | undefined;
    return row ?? null;
  }

  /**
   * One recording, if this person has any standing over publishing it.
   *
   * Absent and not-yours are one answer here as they are everywhere else:
   * that a recording exists is something only its own people learn, and
   * publication does not get to be the endpoint that says otherwise.
   *
   * **Two ways in, and the second is not channel membership.** Everywhere
   * else in this server, reach is *are you in this channel* — `recordingsFor`
   * is that rule and playing, exporting and deleting all ask it. Publishing
   * cannot use it alone, because the question here is not who may hear this
   * recording but **whose voice this would broadcast**, and those sets come
   * apart in exactly one place: a guest who spoke while signed in is in the
   * audio and is not a member.
   *
   * Letting the members alone decide about that person would be the same
   * mistake as letting one member decide for the rest, one layer down. So
   * anybody in `mustConsent` reaches the recording — which is the smallest
   * widening that makes a say possible, and confers nothing else: they cannot
   * play it, export it, rename it or delete it, all of which still ask
   * `recordingsFor`.
   */
  private recordingFor(
    recordingId: string,
    userId: string
  ): RecordingRow | null {
    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as RecordingRow | undefined;
    if (!row) return null;

    const member = this.db
      .prepare(
        `SELECT 1 FROM channels
          WHERE id = ?
            AND EXISTS (SELECT 1 FROM json_each(channels.participants)
                         WHERE json_each.value = ?)`
      )
      .get(row.channel_id, userId);
    if (member) return row;

    return this.mustConsent(row).includes(userId) ? row : null;
  }

  private reread(recordingId: string): RecordingRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM recordings WHERE id = ?')
        .get(recordingId) as unknown as RecordingRow | undefined) ?? null
    );
  }
}

/**
 * The room's identity for a track being played into it. Copied rather than
 * imported from channels.ts, which imports this module — and a cycle between
 * the two would be a worse price than one duplicated string constant.
 */
const MEDIA_IDENTITY = 'media';

/** Where a published episode lives, beside the mix it was made from. */
export function publishedKeyFor(
  channelId: string,
  recordingId: string
): string {
  return `${channelId}/${recordingId}/published.m4a`;
}

export interface PublicationState {
  /** Every account whose agreement is needed, including those who have given it. */
  required: string[];
  /** Who has agreed so far. */
  consented: string[];
  /** When it went public, or null. */
  publishedAt: number | null;
  /** `'pending'`, `'ready'`, `'failed'` or null — the episode's own file. */
  audioState: string | null;
  /**
   * Whether somebody spoke here as a guest with no account, which makes it
   * unpublishable however many of the rest agree — there is nobody to ask.
   */
  blockedByGuest: boolean;
}

export interface Refusal {
  ok: false;
  error: string;
  code: 'not_found' | 'conflict' | 'invalid';
}

function refuse(error: string, code: Refusal['code']): Refusal {
  return { ok: false, error, code };
}

/** Tolerates the malformed, as the sweep's parser does and for the same reason. */
function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

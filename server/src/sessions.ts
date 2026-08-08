import { recordedMs } from '../../core/recording';
import {
  createSession,
  isParticipant,
  otherParty,
  reduce,
} from '../../core/session';
import type { SessionAction, SessionState } from '../../core/types';
import type { InviteView, RejoinableView } from '../../core/protocol';
import type { Accounts } from './accounts';
import { newId, type Db, type RecordingRow } from './db';
import type { MediaServer } from './media';

export const TICK_INTERVAL_MS = 500;

/**
 * How long to leave the audio room standing after a session ends. Clients drop
 * their own connection as soon as they see they are no longer present, so this
 * only has to outlast one push. Deleting it immediately yanked the room out
 * from under still-connected clients, which surfaced as unclean socket closes
 * and ping timeouts — noise that hides real warnings, and a microphone held
 * open until the client noticed.
 */
export const ROOM_CLOSE_GRACE_MS = 5_000;

/**
 * The authority for live sessions. Every rule it enforces comes from core/ —
 * this class owns *when* the reducer runs and *who* is allowed to act, not what
 * the rules are.
 *
 * Sessions live in memory while active and are written to SQLite when they end.
 * That trade is deliberate: they are short-lived by construction (an empty one
 * self-destructs in a minute), and keeping the tick loop in memory avoids a
 * write every 500ms. A server restart drops live sessions, which is a real
 * limitation and the first thing to revisit if restarts become routine.
 */
export class SessionRegistry {
  private sessions = new Map<string, SessionState>();
  /** Live egress handle per session, present only while capture is running. */
  private capturing = new Map<string, string>();
  /** Object keys written so far, in order, per session. */
  private segments = new Map<string, string[]>();
  private listeners = new Set<(sessionIds: string[]) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Db,
    private accounts: Accounts,
    private now: () => number = Date.now,
    private media?: MediaServer,
    private onMediaError: (error: unknown, context: string) => void = () => {},
    private roomCloseGraceMs: number = ROOM_CLOSE_GRACE_MS
  ) {}

  // --- Lifecycle ----------------------------------------------------------

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Advances every live session's timers. Exposed so tests can step it. */
  tick(): void {
    const now = this.now();
    const changed: string[] = [];
    for (const [id, session] of this.sessions) {
      if (session.status !== 'active') continue;
      const next = reduce(session, { type: 'TICK' }, now);
      if (next !== session) {
        this.commit(session, next);
        changed.push(id);
      }
    }
    if (changed.length > 0) this.emit(changed);
  }

  onChange(listener: (sessionIds: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(sessionIds: string[]): void {
    for (const listener of this.listeners) listener(sessionIds);
  }

  // --- Commands -----------------------------------------------------------

  /**
   * Creates a session and places the initiator in it. Requires an accepted
   * contact: you cannot open a channel to someone who has not agreed to one.
   */
  create(
    initiator: string,
    invitee: string
  ): { ok: true; session: SessionState } | { ok: false; error: string } {
    if (initiator === invitee) return { ok: false, error: 'That’s you.' };
    if (!this.accounts.areContacts(initiator, invitee)) {
      return { ok: false, error: 'Not a contact.' };
    }

    // One live session per pair. Without this, repeated taps stack duplicate
    // sessions and the invitee sees a pile of banners from one person.
    const existing = [...this.sessions.values()].find(
      (s) =>
        s.status === 'active' &&
        isParticipant(s, initiator) &&
        isParticipant(s, invitee)
    );
    if (existing) {
      const rejoined = reduce(
        existing,
        { type: 'ENTER', userId: initiator },
        this.now()
      );
      if (rejoined !== existing) this.commit(existing, rejoined);
      this.emit([existing.id]);
      return { ok: true, session: this.sessions.get(existing.id)! };
    }

    const session = createSession({
      id: newId('sess'),
      initiator,
      invitee,
      now: this.now(),
    });
    this.sessions.set(session.id, session);
    this.db
      .prepare(
        'INSERT INTO sessions (id, initiator_id, invitee_id, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(session.id, initiator, invitee, session.createdAt);
    this.emit([session.id]);
    return { ok: true, session };
  }

  /**
   * Applies an action on behalf of `userId`. The caller must have taken that id
   * from the authenticated connection — this is the one place a client could
   * otherwise act as the other party.
   */
  dispatch(
    sessionId: string,
    userId: string,
    action: Omit<SessionAction, 'userId'> & { type: SessionAction['type'] }
  ): { ok: true; session: SessionState } | { ok: false; error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, error: 'No such session.' };
    if (!isParticipant(session, userId)) {
      return { ok: false, error: 'Not your session.' };
    }
    if (action.type === 'TICK') return { ok: false, error: 'Not an action.' };

    const next = reduce(
      session,
      { ...action, userId } as SessionAction,
      this.now()
    );
    if (next !== session) {
      this.commit(session, next);
      this.emit([sessionId]);
    }
    return { ok: true, session: this.sessions.get(sessionId) ?? next };
  }

  // --- Queries ------------------------------------------------------------

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /** Visible only to participants; everyone else gets nothing, not an error. */
  viewableBy(sessionId: string, userId: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || !isParticipant(session, userId)) return undefined;
    return session;
  }

  /** A session the invitee has never entered. */
  invitesFor(userId: string): InviteView[] {
    const invites: InviteView[] = [];
    for (const session of this.sessions.values()) {
      if (session.status !== 'active') continue;
      if (session.invitee !== userId) continue;
      if (session.everPresent.includes(userId)) continue;
      const from = this.accounts.public(session.initiator);
      if (from) {
        invites.push({ sessionId: session.id, from, createdAt: session.createdAt });
      }
    }
    return invites.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** A session this user entered and left, still alive and re-enterable. */
  rejoinableFor(userId: string): RejoinableView[] {
    const rejoinable: RejoinableView[] = [];
    for (const session of this.sessions.values()) {
      if (session.status !== 'active') continue;
      if (!isParticipant(session, userId)) continue;
      if (session.present.includes(userId)) continue;
      if (!session.everPresent.includes(userId)) continue;

      const otherId = otherParty(session, userId);
      const other = this.accounts.public(otherId);
      if (!other) continue;
      rejoinable.push({
        sessionId: session.id,
        other,
        otherPresent: session.present.includes(otherId),
        createdAt: session.createdAt,
      });
    }
    return rejoinable.sort((a, b) => a.createdAt - b.createdAt);
  }

  recordingsFor(userId: string): RecordingRow[] {
    return this.db
      .prepare(
        `SELECT * FROM recordings
         WHERE initiator_id = ? OR invitee_id = ?
         ORDER BY started_at DESC`
      )
      .all(userId, userId) as unknown as RecordingRow[];
  }

  // --- Persistence --------------------------------------------------------

  private commit(before: SessionState, after: SessionState): void {
    this.sessions.set(after.id, after);
    this.applyFloorToMedia(before, after);
    this.applyRecordingToMedia(before, after);
    if (before.status === 'active' && after.status === 'ended') {
      this.persistEnded(after);
      // A backstop, not the mechanism: participants leave on their own once
      // told the session ended. This guarantees the room does not outlive it.
      setTimeout(() => {
        this.run(() => this.media?.closeRoom(after.id), `closeRoom ${after.id}`);
      }, this.roomCloseGraceMs).unref?.();
      // Keep it briefly so watchers get a final snapshot explaining why it
      // ended, rather than the session vanishing from under them.
      setTimeout(() => this.sessions.delete(after.id), 30_000).unref?.();
    }
  }

  /**
   * Turns a change of floor-holder into an actual mute. Whoever does not hold
   * the floor while someone does is silenced at the media server; when nobody
   * holds it, both are open.
   *
   * Note this reacts to the *committed* state, so it cannot disagree with what
   * the reducer decided or with what the clients were told.
   */
  private applyFloorToMedia(before: SessionState, after: SessionState): void {
    if (!this.media) return;
    if (before.floor.holder === after.floor.holder) return;

    // Both directions are stated explicitly on every transition rather than
    // only the one that changed, so the media plane is told the whole truth and
    // cannot drift out of step with the reducer.
    for (const listener of [after.initiator, after.invitee]) {
      const speaker = otherParty(after, listener);
      // Whoever holds the floor stops receiving the other party. Nothing is
      // done to the silenced person's own publishing.
      const silenced = after.floor.holder === listener;
      this.run(
        () =>
          this.media?.setSilenced({
            room: after.id,
            speaker,
            listener,
            silenced,
          }),
        `setSilenced ${after.id} ${listener}<-${speaker}=${silenced}`
      );
    }
  }

  /**
   * Turns recording state into actual capture. There is no pause in the egress
   * API and pausing must genuinely stop capture — people pause precisely so
   * something is not recorded — so a pause stops the current segment and a
   * resume starts a new one. A session therefore yields one object per run,
   * concatenated when exported.
   */
  private applyRecordingToMedia(
    before: SessionState,
    after: SessionState
  ): void {
    if (!this.media) return;
    const was = before.recording.status;
    const now = after.recording.status;
    if (was === now) return;

    const shouldCapture = now === 'recording';
    const isCapturing = this.capturing.has(after.id);

    if (shouldCapture && !isCapturing) {
      const existing = this.segments.get(after.id) ?? [];
      const key = `${after.id}/${String(existing.length + 1).padStart(3, '0')}.ogg`;
      // Reserved before the call returns so a second transition cannot pick the
      // same index, and so a failed start still shows up as a gap rather than
      // silently reusing a key.
      this.segments.set(after.id, [...existing, key]);
      this.run(async () => {
        const handle = await this.media!.startRecording({
          room: after.id,
          key,
        });
        // The session may have moved on while the call was in flight.
        if (this.sessions.get(after.id)?.recording.status === 'recording') {
          this.capturing.set(after.id, handle);
        } else {
          await this.media!.stopRecording(handle);
        }
      }, `startRecording ${key}`);
      return;
    }

    if (!shouldCapture && isCapturing) {
      const handle = this.capturing.get(after.id)!;
      this.capturing.delete(after.id);
      this.run(
        () => this.media?.stopRecording(handle),
        `stopRecording ${after.id}`
      );
    }
  }

  /**
   * Media calls are deliberately not awaited: the session state is already
   * committed and the clients have been told, so a slow or failing media server
   * must not stall the rules. Failures are surfaced to the caller's logger
   * rather than swallowed — a mute that did not land means someone is audible
   * who should not be, which is worth seeing.
   */
  private run(operation: () => Promise<unknown> | undefined, context: string): void {
    try {
      operation()?.catch((error) => this.onMediaError(error, context));
    } catch (error) {
      this.onMediaError(error, context);
    }
  }

  /** A join credential for this participant, scoped to this session's room. */
  async mediaToken(
    sessionId: string,
    userId: string
  ): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
    if (!this.media) return { ok: false, error: 'Audio is not configured.' };
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return { ok: false, error: 'No such session.' };
    }
    if (!isParticipant(session, userId)) {
      return { ok: false, error: 'Not your session.' };
    }
    const account = this.accounts.public(userId);
    if (!account) return { ok: false, error: 'No such account.' };

    const token = await this.media.issueToken({
      room: sessionId,
      identity: userId,
      displayName: account.displayName,
    });
    return { ok: true, token };
  }

  private persistEnded(session: SessionState): void {
    this.db
      .prepare('UPDATE sessions SET ended_at = ?, ended_reason = ? WHERE id = ?')
      .run(session.endedAt, session.endedReason, session.id);

    const duration = recordedMs(session.recording, session.endedAt ?? this.now());
    if (session.recording.status !== 'stopped' || duration <= 0) return;

    const keys = this.segments.get(session.id) ?? [];
    this.segments.delete(session.id);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO recordings
           (id, session_id, initiator_id, invitee_id, started_at, duration_ms, s3_key, segment_keys)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('rec'),
        session.id,
        session.initiator,
        session.invitee,
        session.recording.startedAt ?? session.createdAt,
        duration,
        keys[0] ?? '',
        JSON.stringify(keys)
      );
  }
}

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

export const TICK_INTERVAL_MS = 500;

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
  private listeners = new Set<(sessionIds: string[]) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Db,
    private accounts: Accounts,
    private now: () => number = Date.now
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
    if (before.status === 'active' && after.status === 'ended') {
      this.persistEnded(after);
      // Keep it briefly so watchers get a final snapshot explaining why it
      // ended, rather than the session vanishing from under them.
      setTimeout(() => this.sessions.delete(after.id), 30_000).unref?.();
    }
  }

  private persistEnded(session: SessionState): void {
    this.db
      .prepare('UPDATE sessions SET ended_at = ?, ended_reason = ? WHERE id = ?')
      .run(session.endedAt, session.endedReason, session.id);

    const duration = recordedMs(session.recording, session.endedAt ?? this.now());
    if (session.recording.status !== 'stopped' || duration <= 0) return;

    this.db
      .prepare(
        `INSERT OR IGNORE INTO recordings
           (id, session_id, initiator_id, invitee_id, started_at, duration_ms, s3_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('rec'),
        session.id,
        session.initiator,
        session.invitee,
        session.recording.startedAt ?? session.createdAt,
        duration,
        // Placeholder until LiveKit Egress writes the real object.
        `s3://thefloor-recordings/${session.id}.m4a`
      );
  }
}

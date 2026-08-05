import { recordedMs } from '../core/recording';
import {
  createSession,
  isParticipant,
  otherParty,
  reduce,
} from '../core/session';
import type { SessionAction, SessionState, UserId } from '../core/types';
import type {
  Account,
  ContactEntry,
  ContactStatus,
  LiveInvite,
  RecordingRecord,
  RejoinableSession,
} from './types';

/** 'accepted', or 'pending:<requesterId>' while awaiting the recipient. */
type PairState = 'accepted' | `pending:${string}`;

/**
 * An in-process stand-in for the server: accounts, contacts, sessions, and
 * recording metadata. It owns no transport — real signalling, WebRTC audio, and
 * S3 uploads slot in behind this same surface later.
 */
export class MockBackend {
  private accounts = new Map<UserId, Account>();
  private contacts = new Map<string, PairState>();
  private sessions = new Map<string, SessionState>();
  private recordings: RecordingRecord[] = [];
  private listeners = new Set<() => void>();
  private nextId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.seed();
  }

  // --- Reactivity ---------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.ensureTimer();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stopTimer();
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /**
   * Drives time-based transitions — floor expiry and the empty-session
   * auto-end — for every live session, and files a recording when one ends.
   */
  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      this.sessions.forEach((session, id) => {
        if (session.status !== 'active') return;
        const next = reduce(session, { type: 'TICK' }, now);
        if (next !== session) {
          this.sessions.set(id, next);
          this.fileRecordingIfEnded(session, next);
          changed = true;
        }
      });
      // Tick every second even when nothing changed, so countdowns re-render.
      if (changed || this.hasLiveSession()) this.emit();
    }, 500);
  }

  private hasLiveSession(): boolean {
    for (const session of this.sessions.values()) {
      if (session.status === 'active') return true;
    }
    return false;
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // --- Auth ---------------------------------------------------------------

  /** In the mock, any six-digit code is accepted; nothing is actually sent. */
  requestCode(identifier: string): void {
    void identifier;
  }

  isValidCode(code: string): boolean {
    return /^\d{6}$/.test(code.trim());
  }

  findByIdentifier(identifier: string): Account | undefined {
    const needle = identifier.trim().toLowerCase();
    return [...this.accounts.values()].find(
      (a) => a.identifier.toLowerCase() === needle
    );
  }

  /** Signs in an existing account, or creates one when a display name is given. */
  signIn(identifier: string, displayName?: string): Account {
    const existing = this.findByIdentifier(identifier);
    if (existing) return existing;
    const account: Account = {
      id: `u${this.nextId++}`,
      displayName: displayName?.trim() || identifier.trim(),
      identifier: identifier.trim(),
    };
    this.accounts.set(account.id, account);
    this.emit();
    return account;
  }

  getAccount(id: UserId): Account | undefined {
    return this.accounts.get(id);
  }

  // --- Contacts -----------------------------------------------------------

  private pairKey(a: UserId, b: UserId): string {
    return [a, b].sort().join('|');
  }

  private setPair(a: UserId, b: UserId, value: PairState) {
    this.contacts.set(this.pairKey(a, b), value);
  }

  private getPair(a: UserId, b: UserId): PairState | undefined {
    return this.contacts.get(this.pairKey(a, b));
  }

  contactsFor(userId: UserId): ContactEntry[] {
    const entries: ContactEntry[] = [];
    this.contacts.forEach((value, key) => {
      const [x, y] = key.split('|');
      if (x !== userId && y !== userId) return;
      const otherId = x === userId ? y : x;
      const account = this.accounts.get(otherId);
      if (!account) return;

      if (value === 'accepted') {
        entries.push({ account, status: 'accepted' });
      } else if (value.startsWith('pending:')) {
        const requester = value.slice('pending:'.length);
        entries.push({
          account,
          status: requester === userId ? 'outgoing' : 'incoming',
        });
      }
    });
    return entries.sort((a, b) => {
      const rank = (s: ContactStatus) =>
        s === 'incoming' ? 0 : s === 'accepted' ? 1 : 2;
      return (
        rank(a.status) - rank(b.status) ||
        a.account.displayName.localeCompare(b.account.displayName)
      );
    });
  }

  /**
   * Sends a contact request. Adding is never one-directional — the pair only
   * becomes mutual once the recipient accepts.
   */
  sendContactRequest(
    from: UserId,
    identifier: string
  ): { ok: true } | { ok: false; error: string } {
    const target = this.findByIdentifier(identifier);
    if (!target) return { ok: false, error: 'No account with that phone or email.' };
    if (target.id === from) return { ok: false, error: 'That’s you.' };

    const existing = this.getPair(from, target.id);
    if (existing === 'accepted') {
      return { ok: false, error: 'Already a contact.' };
    }
    if (existing?.startsWith('pending:')) {
      const requester = existing.slice('pending:'.length);
      if (requester === from) return { ok: false, error: 'Request already sent.' };
      // They already asked us — treat this as an acceptance.
      this.setPair(from, target.id, 'accepted');
      this.emit();
      return { ok: true };
    }

    this.setPair(from, target.id, `pending:${from}`);
    this.emit();
    return { ok: true };
  }

  acceptContactRequest(userId: UserId, otherId: UserId): void {
    const existing = this.getPair(userId, otherId);
    if (existing?.startsWith('pending:')) {
      this.setPair(userId, otherId, 'accepted');
      this.emit();
    }
  }

  declineContactRequest(userId: UserId, otherId: UserId): void {
    this.contacts.delete(this.pairKey(userId, otherId));
    this.emit();
  }

  // --- Sessions -----------------------------------------------------------

  /** Creates the session and puts the initiator in it, waiting. */
  startSession(initiator: UserId, invitee: UserId): string {
    const id = `s${this.nextId++}`;
    this.sessions.set(
      id,
      createSession({ id, initiator, invitee, now: Date.now() })
    );
    this.emit();
    return id;
  }

  getSession(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  dispatch(sessionId: string, action: SessionAction): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const next = reduce(session, action, Date.now());
    if (next === session) return;
    this.sessions.set(sessionId, next);
    this.fileRecordingIfEnded(session, next);
    this.emit();
  }

  /**
   * Live invites are in-app only: they surface while the session exists and the
   * invitee has *never* entered it. Once they have, a later absence is a
   * re-entry (see `liveSessionsFor`), not a fresh invitation. There is no
   * OS-level push in this version.
   */
  invitesFor(userId: UserId): LiveInvite[] {
    const invites: LiveInvite[] = [];
    this.sessions.forEach((session) => {
      if (session.status !== 'active') return;
      if (session.invitee !== userId) return;
      if (session.everPresent.includes(userId)) return;
      const from = this.accounts.get(session.initiator);
      if (from) {
        invites.push({ sessionId: session.id, from, createdAt: session.createdAt });
      }
    });
    return invites.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Sessions this user has entered and since left, which are still alive. The
   * spec allows re-entry for as long as a session exists but gives Home no
   * route back to one, so these surface as their own list. Symmetric across
   * both roles — an initiator who leaves is no more stranded than an invitee.
   */
  liveSessionsFor(userId: UserId): RejoinableSession[] {
    const rejoinable: RejoinableSession[] = [];
    this.sessions.forEach((session) => {
      if (session.status !== 'active') return;
      if (!isParticipant(session, userId)) return;
      if (session.present.includes(userId)) return;
      if (!session.everPresent.includes(userId)) return;

      const otherId = otherParty(session, userId);
      const other = this.accounts.get(otherId);
      if (!other) return;
      rejoinable.push({
        sessionId: session.id,
        other,
        otherPresent: session.present.includes(otherId),
        createdAt: session.createdAt,
      });
    });
    return rejoinable.sort((a, b) => a.createdAt - b.createdAt);
  }

  // --- Recordings ---------------------------------------------------------

  private fileRecordingIfEnded(before: SessionState, after: SessionState): void {
    if (before.status !== 'active' || after.status !== 'ended') return;
    const duration = recordedMs(after.recording, after.endedAt ?? Date.now());
    if (after.recording.status !== 'stopped' || duration <= 0) return;
    if (this.recordings.some((r) => r.sessionId === after.id)) return;

    this.recordings.push({
      id: `r${this.nextId++}`,
      sessionId: after.id,
      participants: [after.initiator, after.invitee],
      startedAt: after.recording.startedAt ?? after.createdAt,
      durationMs: duration,
      s3Key: `s3://thefloor-recordings/${after.id}.m4a`,
    });
  }

  /**
   * Stands in for issuing a download of the stored object. Access is granted to
   * either participant independently of the other's cooperation, so this checks
   * only that the requester was in the session.
   */
  exportRecording(id: string, userId: UserId): string | null {
    const recording = this.recordings.find((r) => r.id === id);
    if (!recording || !recording.participants.includes(userId)) return null;
    return recording.s3Key;
  }

  /** Both participants get their own independent access to every recording. */
  recordingsFor(userId: UserId): RecordingRecord[] {
    return this.recordings
      .filter((r) => r.participants.includes(userId))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  // --- Demo seed ----------------------------------------------------------

  private seed() {
    const you: Account = {
      id: `u${this.nextId++}`,
      displayName: 'You',
      identifier: '+15550000001',
    };
    const dana: Account = {
      id: `u${this.nextId++}`,
      displayName: 'Dana Chu',
      identifier: '+15550000002',
    };
    const miro: Account = {
      id: `u${this.nextId++}`,
      displayName: 'Miro Okafor',
      identifier: 'miro@example.com',
    };
    const priya: Account = {
      id: `u${this.nextId++}`,
      displayName: 'Priya Raman',
      identifier: 'priya@example.com',
    };
    [you, dana, miro, priya].forEach((a) => this.accounts.set(a.id, a));

    this.setPair(you.id, dana.id, 'accepted');
    this.setPair(you.id, miro.id, 'accepted');
    // An incoming request awaiting this user's response.
    this.setPair(you.id, priya.id, `pending:${priya.id}`);
  }
}

export const backend = new MockBackend();

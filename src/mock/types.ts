import type { UserId } from '../core/types';

export interface Account {
  id: UserId;
  displayName: string;
  /** Phone number or email — whichever the account was created with. */
  identifier: string;
}

export type ContactStatus =
  | 'accepted'
  /** This user sent a request and is awaiting the other's response. */
  | 'outgoing'
  /** This user received a request and has not yet responded. */
  | 'incoming';

export interface ContactEntry {
  account: Account;
  status: ContactStatus;
}

export interface LiveInvite {
  sessionId: string;
  from: Account;
  createdAt: number;
}

export interface RecordingRecord {
  id: string;
  sessionId: string;
  /** The other party, from the perspective of whoever is listing it. */
  participants: UserId[];
  startedAt: number;
  durationMs: number;
  /** Stand-in for the S3 object both participants can fetch independently. */
  s3Key: string;
}

/** An active session this user has left and may re-enter. */
export interface RejoinableSession {
  sessionId: string;
  /** The other participant, whichever role this user held. */
  other: Account;
  /** Whether they are still in there waiting, or the session sits empty. */
  otherPresent: boolean;
  createdAt: number;
}

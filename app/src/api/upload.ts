import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from './config';
import { ApiError, reportSignedOut } from './http';

/**
 * Loads the document picker only when somebody actually picks something.
 *
 * Deliberately not a top-level import. `expo-document-picker` resolves its
 * native module at module scope — `requireNativeModule('ExpoDocumentPicker')`,
 * with no optional variant — so it throws on import if the native side is
 * missing from the build. This file is reached from ChannelView, which App.tsx
 * imports at startup, so that throw happened while the bundle was still
 * evaluating: React never mounted and the app rendered as a black screen with
 * no way to tell why.
 *
 * That is exactly what shipped in iOS build 2, because `expo prebuild` without
 * `--clean` did not link the newly added pod. The linking is fixed, and this
 * keeps the blast radius right regardless: choosing a file is one feature, and
 * failing to load it should cost that feature rather than the whole app.
 */
async function loadPicker(): Promise<typeof import('expo-document-picker')> {
  try {
    return await import('expo-document-picker');
  } catch {
    throw new ApiError(
      'Choosing a file is not available in this build of the app.',
      0
    );
  }
}

/**
 * What the caller learns while the bytes are moving, and how to stop them.
 *
 * Both are optional and both are about the same phase: the upload, not the
 * picking. The system's own file picker has a Cancel of its own, and until it
 * returns there is nothing to cancel or measure.
 */
export type UploadHooks = {
  /**
   * Called once, when the bytes start moving, with the way to stop them.
   * Cancelling resolves the upload as `{ cancelled: true }` rather than
   * throwing: a stopped upload is a decision, not a failure.
   */
  onStart?: (cancel: () => void) => void;
  /**
   * Whole percent, 0 to 100 — or `null` when the total is not known, which is
   * what a platform that does not report the expected size looks like. A
   * caller showing a number has to have something to show when there is none.
   */
  onProgress?: (percent: number | null) => void;
};

/**
 * Picks an audio file and gives it to the channel for both parties to hear.
 *
 * The legacy FileSystem entry point again, for the reason download.ts gives:
 * it reports the HTTP status, and the newer File API does not. A refusal here
 * — the wrong channel, or someone else holding the floor — has to reach the
 * user as itself rather than as a silent no-op.
 *
 * `createUploadTask` rather than `uploadAsync`, which is the same request with
 * the same defaults — `BACKGROUND` session, binary body — plus the two things
 * a hundred megabytes over a phone connection needs: a progress callback and
 * something to cancel. An upload that has stalled is indistinguishable from a
 * slow one without the first, and unescapable without the second, and both of
 * those have been met.
 *
 * The bytes go up raw rather than as multipart. There is one file and no
 * fields, so multipart would be ceremony on both ends; the name travels in the
 * query string, and the server asks the file itself how long it is.
 */

/** Kept in step with MAX_TRACK_BYTES on the server. */
export const MAX_TRACK_BYTES = 100 * 1024 * 1024;

export async function pickAndUploadTrack(
  token: string,
  channelId: string,
  hooks: UploadHooks = {}
): Promise<{ cancelled: boolean }> {
  if (!API_URL) throw new ApiError('No server configured.', 0);

  const DocumentPicker = await loadPicker();
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    // Copied into the cache first: the picked URI can point at a provider the
    // upload cannot read directly, which fails as an unhelpful IO error.
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return { cancelled: true };

  const asset = picked.assets[0];
  if (!asset) return { cancelled: true };

  // Checked here as well as on the server, because failing after pushing a
  // hundred megabytes over a phone connection is a poor way to find out.
  if (asset.size !== undefined && asset.size > MAX_TRACK_BYTES) {
    throw new ApiError(
      `That file is ${Math.round(asset.size / 1024 / 1024)} MB. The limit is ${
        MAX_TRACK_BYTES / 1024 / 1024
      } MB.`,
      413
    );
  }

  const url =
    `${API_URL}/channels/${channelId}/track` +
    `?name=${encodeURIComponent(asset.name ?? 'track')}`;

  // Set before anything can cancel, and read afterwards: a cancelled upload
  // ends as a rejection or as an empty result depending on the platform, and
  // neither of those says why on its own.
  let cancelled = false;

  const task = FileSystem.createUploadTask(
    url,
    asset.uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': asset.mimeType ?? 'application/octet-stream',
      },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (cancelled) return;
      hooks.onProgress?.(percentOf(totalBytesSent, totalBytesExpectedToSend));
    }
  );

  hooks.onStart?.(() => {
    cancelled = true;
    // Nothing waits on this and nothing can be done if it fails: the caller
    // has already decided, and the upload is abandoned either way.
    void task.cancelAsync().catch(() => {});
  });

  let result: FileSystem.FileSystemUploadResult | undefined | null;
  try {
    result = await task.uploadAsync();
  } catch {
    if (cancelled) return { cancelled: true };
    throw new ApiError(`Cannot reach the server at ${API_URL}.`, 0);
  }

  // A cancelled task resolves with nothing rather than with a status, so the
  // absent result is checked as well as the flag — one of the two is what a
  // given platform gives you.
  if (cancelled || !result) return { cancelled: true };

  if (result.status !== 200) {
    if (result.status === 401) reportSignedOut();
    let message = `The track could not be uploaded (${result.status}).`;
    try {
      const body = JSON.parse(result.body);
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // Not JSON; the status alone will have to do.
    }
    throw new ApiError(message, result.status);
  }

  return { cancelled: false };
}

/**
 * Whole percent, or `null` when the total is unknown.
 *
 * `totalBytesExpectedToSend` is `-1` when the platform cannot say how big the
 * body is, and it is momentarily 0 before the first chunk; neither divides
 * into anything useful. Rounded down so that 100% means finished rather than
 * nearly.
 */
export function percentOf(sent: number, expected: number): number | null {
  if (!(expected > 0)) return null;
  return Math.max(0, Math.min(100, Math.floor((sent / expected) * 100)));
}

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
 * Picks an audio file and gives it to the channel for both parties to hear.
 *
 * The legacy FileSystem entry point again, for the reason download.ts gives:
 * it reports the HTTP status, and the newer File API does not. A refusal here
 * — the wrong channel, or someone else holding the floor — has to reach the
 * user as itself rather than as a silent no-op.
 *
 * The bytes go up raw rather than as multipart. There is one file and no
 * fields, so multipart would be ceremony on both ends; the name travels in the
 * query string, and the server asks the file itself how long it is.
 */

/** Kept in step with MAX_TRACK_BYTES on the server. */
export const MAX_TRACK_BYTES = 100 * 1024 * 1024;

export async function pickAndUploadTrack(
  token: string,
  channelId: string
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

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(url, asset.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': asset.mimeType ?? 'application/octet-stream',
      },
    });
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_URL}.`, 0);
  }

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

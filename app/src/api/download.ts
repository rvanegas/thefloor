import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL } from './config';
import { ApiError, reportSignedOut } from './http';

/**
 * Fetches a finished recording and hands it to the system share sheet.
 *
 * The legacy FileSystem entry point is used deliberately: it reports the HTTP
 * status, and the newer File API does not. Without it a refusal — a recording
 * that is not yours, say — would be written to disk as a JSON error and offered
 * to the user as though it were audio.
 */
export async function exportRecording(
  token: string,
  recordingId: string,
  name: string,
  endedAt: number
): Promise<void> {
  if (!API_URL) throw new ApiError('No server configured.', 0);

  // Cache rather than documents: this is a copy, the server holds the original,
  // and it should not accumulate in a directory the user backs up.
  const directory = `${FileSystem.cacheDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  // A name alone is not unique: a named channel lends its name to every
  // recording made in it, so several files would collide in the share sheet
  // and in whatever folder they land in. When it ended is what tells them
  // apart, and it is the thing a person would look for anyway.
  const safeName = name.replace(/[^\w\- ]/g, '').trim() || 'channel';
  const target = `${directory}The Floor — ${safeName} — ${stamp(endedAt)}.ogg`;

  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(
      `${API_URL}/recordings/${recordingId}/export`,
      target,
      { headers: { authorization: `Bearer ${token}` } }
    );
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_URL}.`, 0);
  }

  if (result.status !== 200) {
    if (result.status === 401) reportSignedOut();
    // The body is the server's JSON error, which downloadAsync has already
    // written to disk. Read it back so the user sees the actual reason.
    let message = `Could not download the recording (${result.status}).`;
    let code: string | undefined;
    try {
      const body = JSON.parse(await FileSystem.readAsStringAsync(result.uri));
      if (typeof body?.error === 'string') message = body.error;
      if (typeof body?.code === 'string') code = body.code;
    } catch {
      // Not JSON; the status alone will have to do.
    }
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new ApiError(message, result.status, code);
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError('Sharing is not available on this device.', 0);
  }
  await Sharing.shareAsync(result.uri, {
    mimeType: 'audio/ogg',
    UTI: 'public.audio',
    dialogTitle: `Recording — ${name}`,
  });
}

/**
 * `2026-08-11 1437`, in the reader's own timezone.
 *
 * Local rather than UTC because this becomes a filename somebody reads, and
 * sorts lexicographically because the fields run largest to smallest. No
 * colon: it is legal on iOS but shows as a slash in Finder and is refused
 * outright on Windows, where an exported file may well end up.
 */
function stamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

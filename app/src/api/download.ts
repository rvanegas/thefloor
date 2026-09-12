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
export async function shareRecording(
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
 * Fetches a transcript as a file and hands it to the share sheet.
 *
 * The same shape as `shareRecording` above, and deliberately so — the legacy
 * FileSystem entry point for the same reason, since a refusal written to disk
 * and offered as though it were a transcript is the same failure with different
 * bytes.
 *
 * Three formats because they are read by three different things: prose to
 * paste into a message, WebVTT to sit alongside the exported audio in a player,
 * and JSON for anything else.
 */
export async function shareTranscript(
  token: string,
  recordingId: string,
  name: string,
  endedAt: number,
  format: 'txt' | 'vtt' | 'json'
): Promise<void> {
  if (!API_URL) throw new ApiError('No server configured.', 0);

  const directory = `${FileSystem.cacheDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const safeName = name.replace(/[^\w\- ]/g, '').trim() || 'channel';
  const target = `${directory}The Floor — ${safeName} — ${stamp(
    endedAt
  )}.${format}`;

  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(
      `${API_URL}/recordings/${recordingId}/transcript/export?format=${format}`,
      target,
      { headers: { authorization: `Bearer ${token}` } }
    );
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_URL}.`, 0);
  }

  if (result.status !== 200) {
    if (result.status === 401) reportSignedOut();
    let message = `Could not download the transcript (${result.status}).`;
    try {
      const body = JSON.parse(await FileSystem.readAsStringAsync(result.uri));
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // Not JSON; the status alone will have to do.
    }
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new ApiError(message, result.status);
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError('Sharing is not available on this device.', 0);
  }
  await Sharing.shareAsync(result.uri, {
    // Plain text for all three: a .vtt or .json handed over as its own type is
    // refused by most of the share sheet, and what a person does with these is
    // paste them or open them in something that reads text either way.
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
    dialogTitle: `Transcript — ${name}`,
  });
}

/**
 * Fetches the channel's current track and hands it to the share sheet.
 *
 * The third of these and the odd one out, because **the file is not ours**.
 * A recording and a transcript are artefacts this project produced, in formats
 * it chose; a track is whatever somebody picked on their phone, so the name
 * and the type both have to come back from the server rather than being known
 * here. That is why this downloads to a scratch name and renames afterwards:
 * the extension arrives in `content-disposition`, which is not readable until
 * the response is, and a file handed to the share sheet under the wrong
 * extension is offered to the wrong applications — or to none.
 *
 * No timestamp in the name, unlike the two above. A track has a title somebody
 * chose, which is already the filename they uploaded, and stamping it with the
 * moment it was fetched would rename their file for them.
 */
export async function shareTrack(
  token: string,
  channelId: string,
  title: string
): Promise<void> {
  if (!API_URL) throw new ApiError('No server configured.', 0);

  const directory = `${FileSystem.cacheDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  // Scratch, and overwritten by the next share: `downloadAsync` has to be told
  // where to put the bytes before anything about them is known.
  const scratch = `${directory}track.download`;

  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(
      `${API_URL}/channels/${channelId}/track`,
      scratch,
      { headers: { authorization: `Bearer ${token}` } }
    );
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_URL}.`, 0);
  }

  if (result.status !== 200) {
    if (result.status === 401) reportSignedOut();
    let message = `Could not download the track (${result.status}).`;
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

  const safeName = title.replace(/[^\w\- ]/g, '').trim() || 'track';
  const target = `${directory}${safeName}${extensionOf(result.headers)}`;
  // The previous share of the same track is still sitting there, since the
  // name is the track's rather than the moment's; moving onto it would fail.
  await FileSystem.deleteAsync(target, { idempotent: true });
  await FileSystem.moveAsync({ from: result.uri, to: target });

  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError('Sharing is not available on this device.', 0);
  }
  await Sharing.shareAsync(target, {
    mimeType: headerOf(result.headers, 'content-type') ?? 'audio/mpeg',
    UTI: 'public.audio',
    dialogTitle: title,
  });
}

/**
 * The extension the server filed the track under, from `content-disposition`.
 *
 * `.mp3` when the header says nothing useful, rather than no extension at all:
 * a file with none is offered to nothing on iOS, and the picker's own default
 * is overwhelmingly what this is. Anything unrecognised the server has already
 * typed as `application/octet-stream`, so a wrong guess here is a share sheet
 * with the wrong applications in it and never a corrupted file.
 */
function extensionOf(headers: Record<string, string>): string {
  const match = /filename="[^"]*(\.[A-Za-z0-9]+)"/.exec(
    headerOf(headers, 'content-disposition') ?? ''
  );
  return match ? match[1].toLowerCase() : '.mp3';
}

/**
 * One header, whatever case the platform handed it back in.
 *
 * Header names are case-insensitive on the wire and `downloadAsync` hands over
 * a plain object, so there is nothing doing the folding for us.
 */
function headerOf(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const key = Object.keys(headers ?? {}).find(
    (candidate) => candidate.toLowerCase() === name
  );
  return key === undefined ? undefined : headers[key];
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

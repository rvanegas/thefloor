import { API_URL } from './config';
import { ApiError, reportSignedOut } from './http';

/**
 * Exporting a recording or a transcript, from a browser.
 *
 * **It cannot be a link, and that is the whole reason this file exists.**
 * `GET /recordings/:id/export` needs the bearer token, and an `<a href>`
 * carries no headers — the token could only travel in the query string, which
 * is the one place `AGENTS.md` and the privacy policy both say credentials do
 * not go. So the bytes are fetched, held as a blob, and handed to a synthetic
 * anchor with an object URL.
 *
 * The cost is that the whole file is in memory for the moment it takes. At the
 * 100 MB ceiling that is acceptable and worth knowing; the native client
 * streams to disk instead, which a browser will not do without the File System
 * Access API and a permission prompt that is not worth it here.
 *
 * There is no share sheet on the web, so a download *is* the share: the file
 * lands wherever the browser puts downloads and the person does the rest.
 */

/**
 * Fetches with the token and gives the result a filename.
 *
 * Shared by both exports below, since the two differ only in the URL, the
 * extension and the sentence used when it fails.
 */
async function download(
  token: string,
  url: string,
  filename: string,
  whatFailed: string
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(
      `Cannot reach the server at ${API_URL || 'this origin'}.`,
      0
    );
  }

  if (!response.ok) {
    if (response.status === 401) reportSignedOut();
    // Read as the server's JSON error rather than saved. The native file has
    // to write the body to disk first and read it back; here it simply never
    // becomes a file, which is the one respect in which this is the easier
    // platform.
    let message = `${whatFailed} (${response.status}).`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: unknown;
        code?: unknown;
      };
      if (typeof body?.error === 'string') message = body.error;
      if (typeof body?.code === 'string') code = body.code;
    } catch {
      // Not JSON; the status alone will have to do.
    }
    throw new ApiError(message, response.status, code);
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    // In the document, because a detached anchor is not clickable in every
    // engine — the same reason the file input in upload.web.ts is appended.
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Not immediately: some engines have not started reading the blob when
    // `click` returns, and revoking under them cancels the download. A tick is
    // enough and the object is freed either way when the page goes.
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
}

export async function exportRecording(
  token: string,
  recordingId: string,
  name: string,
  endedAt: number
): Promise<void> {
  await download(
    token,
    `${API_URL}/recordings/${recordingId}/export`,
    `${fileStem(name, endedAt)}.ogg`,
    'Could not download the recording'
  );
}

export async function exportTranscript(
  token: string,
  recordingId: string,
  name: string,
  endedAt: number,
  format: 'txt' | 'vtt' | 'json'
): Promise<void> {
  await download(
    token,
    `${API_URL}/recordings/${recordingId}/transcript/export?format=${format}`,
    `${fileStem(name, endedAt)}.${format}`,
    'Could not download the transcript'
  );
}

/**
 * `The Floor — channel — 2026-08-11 1437`, matching the native client exactly.
 *
 * A name alone is not unique: a named channel lends its name to every recording
 * made in it, so several would collide in one downloads folder. When it ended
 * is what tells them apart and is what a person looks for anyway.
 */
function fileStem(name: string, endedAt: number): string {
  const safeName = name.replace(/[^\w\- ]/g, '').trim() || 'channel';
  return `The Floor — ${safeName} — ${stamp(endedAt)}`;
}

/**
 * Local rather than UTC because this becomes a filename somebody reads, and
 * sorts lexicographically because the fields run largest to smallest. No
 * colon: it shows as a slash in Finder and is refused outright on Windows,
 * which a browser download is far more likely to reach than a phone export is.
 */
function stamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

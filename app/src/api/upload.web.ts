import { API_URL } from './config';
import { ApiError, reportSignedOut } from './http';

/**
 * Picking an audio file and giving it to the channel, from a browser.
 *
 * **This is a reason to open the browser rather than a port for
 * completeness.** The web app is a secondary interface and the phone is the
 * referential install — planning/decisions/DECISIONS.md § *The web app is a
 * secondary interface* — but choosing a file is the one thing a laptop does
 * better than a phone, so this is among the things somebody opens a browser
 * *for*.
 *
 * Same wire as the native file: raw bytes rather than multipart, the name in
 * the query string, the server asking the file how long it is.
 */

export type UploadHooks = {
  onStart?: (cancel: () => void) => void;
  onProgress?: (percent: number | null) => void;
};

/** Kept in step with MAX_TRACK_BYTES on the server, as the native file is. */
export const MAX_TRACK_BYTES = 100 * 1024 * 1024;

export function percentOf(sent: number, expected: number): number | null {
  if (!(expected > 0)) return null;
  return Math.max(0, Math.min(100, Math.floor((sent / expected) * 100)));
}

/**
 * The file picker, which in a browser is an `<input>` and a click.
 *
 * There is no promise-shaped file picker on the web platform, and no reliable
 * event for "the dialog was dismissed" — `cancel` is well supported now but
 * not universally, and a dialog that is closed without it would leave this
 * pending for the life of the page. So the element is removed on either
 * outcome and the caller is told `cancelled` when nothing arrives.
 */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    let input: HTMLInputElement;
    try {
      input = document.createElement('input');
    } catch {
      resolve(null);
      return;
    }
    input.type = 'file';
    input.accept = 'audio/*';
    // Kept out of the layout but in the document: a detached input cannot be
    // clicked in every engine.
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    let done = false;
    const finish = (file: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}

/**
 * `XMLHttpRequest` rather than `fetch`, and this is the whole reason this file
 * is not four lines.
 *
 * **`fetch` reports no upload progress.** There is no callback and no stream
 * for the request body in any shipping browser, so a hundred megabytes over a
 * domestic upstream would be minutes of a screen saying nothing — which is
 * exactly the case the native file went to `createUploadTask` for, and the
 * same argument applies here. `XMLHttpRequest` has `upload.onprogress`, and
 * having it is worth using the older API.
 *
 * It also gives `abort()`, so an upload that has stalled can be escaped rather
 * than waited out.
 */
export async function pickAndUploadTrack(
  token: string,
  channelId: string,
  hooks: UploadHooks = {}
): Promise<{ cancelled: boolean }> {
  const file = await pickFile();
  if (!file) return { cancelled: true };

  // Checked here as well as on the server, because failing after pushing a
  // hundred megabytes is a poor way to find out.
  if (file.size > MAX_TRACK_BYTES) {
    throw new ApiError(
      `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${
        MAX_TRACK_BYTES / 1024 / 1024
      } MB.`,
      413
    );
  }

  const url =
    `${API_URL}/channels/${channelId}/track` +
    `?name=${encodeURIComponent(file.name || 'track')}`;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let cancelled = false;

    request.open('POST', url);
    request.setRequestHeader('authorization', `Bearer ${token}`);
    request.setRequestHeader(
      'content-type',
      file.type || 'application/octet-stream'
    );

    request.upload.onprogress = (event) => {
      if (cancelled) return;
      hooks.onProgress?.(
        percentOf(event.loaded, event.lengthComputable ? event.total : -1)
      );
    };

    hooks.onStart?.(() => {
      cancelled = true;
      // A stopped upload is a decision rather than a failure, so this resolves
      // rather than rejecting — the same contract the native file holds.
      try {
        request.abort();
      } catch {
        // Already finished. Nothing to stop and nothing to say.
      }
    });

    request.onabort = () => resolve({ cancelled: true });

    request.onerror = () => {
      if (cancelled) return resolve({ cancelled: true });
      reject(new ApiError(`Cannot reach the server at ${API_URL || 'this origin'}.`, 0));
    };

    request.onload = () => {
      if (cancelled) return resolve({ cancelled: true });
      if (request.status === 200) return resolve({ cancelled: false });
      if (request.status === 401) reportSignedOut();
      let message = `The track could not be uploaded (${request.status}).`;
      try {
        const body = JSON.parse(request.responseText);
        if (typeof body?.error === 'string') message = body.error;
      } catch {
        // Not JSON; the status alone will have to do.
      }
      reject(new ApiError(message, request.status));
    };

    request.send(file);
  });
}

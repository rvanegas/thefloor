/**
 * Transcribes one audio file through the server's own batch provider.
 *
 * Read by bin/transcribe, which is where the reasoning lives. This is only the
 * half that has to be TypeScript: it calls `AssemblyAiTranscription` rather
 * than the API, so a file transcribed here is asked exactly what a recording
 * is asked — the same pinned models, the same request, and the same lines made
 * from the same words by `intoLines`.
 *
 * In: the key as `ASSEMBLYAI_API_KEY`, the file and flags as arguments.
 * Out: on stdout, one line per utterance, or the utterances as JSON; progress
 * on stderr, so the output can be redirected whole.
 */
import { readFileSync } from 'fs';

import type { TranscriptionModel } from '../../core/types';
import { AssemblyAiTranscription, type Utterance } from '../src/transcription';

/** How often to ask whether the job has finished. */
const POLL_MS = 3_000;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name: string) => args.includes(`--${name}`);

const apiKey = process.env.ASSEMBLYAI_API_KEY;
if (!apiKey) {
  console.error('No ASSEMBLYAI_API_KEY');
  process.exit(1);
}
if (!file) {
  console.error('Which file?');
  process.exit(1);
}

const model: TranscriptionModel = flag('pro') ? 'pro' : 'standard';
const diarize = !flag('no-diarize');
const json = flag('json');
const keep = flag('keep');

/** `h:mm:ss`, or `m:ss` under an hour. */
function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function render(lines: Utterance[]): string {
  return lines
    .map((line) => {
      const who = line.speaker ? ` ${line.speaker}` : '';
      return `[${clock(line.startMs)}]${who}  ${line.text}`;
    })
    .join('\n');
}

async function main() {
  const provider = new AssemblyAiTranscription({ apiKey: apiKey! });
  const audio = readFileSync(file!);

  console.error(
    `Uploading ${file} (${(audio.length / 1e6).toFixed(1)} MB), ${model}${
      diarize ? ', separating voices' : ''
    }`
  );
  const id = await provider.submit(audio, {
    languageDetection: true,
    diarize,
    model,
  });
  console.error(`Job ${id}`);

  try {
    for (;;) {
      const polled = await provider.poll(id);
      if (polled.state === 'failed') {
        console.error(`Failed: ${polled.error}`);
        process.exitCode = 1;
        return;
      }
      if (polled.state === 'ready') {
        const speakers = new Set(polled.utterances.map((u) => u.speaker).filter(Boolean));
        console.error(
          `Done: ${polled.utterances.length} lines` +
            (diarize ? `, ${speakers.size} voices` : '') +
            `, language ${polled.languageCode ?? 'not detected'}` +
            (polled.billedMs != null ? `, ${clock(polled.billedMs)} billed` : '')
        );
        console.log(
          json ? JSON.stringify({ id, ...polled }, null, 2) : render(polled.utterances)
        );
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    // The server forgets every job once the text has landed, and so does
    // this, so a file transcribed by hand does not outlive one transcribed by
    // the server at the provider's end. `--keep` for when you mean it to.
    if (!keep) {
      await provider.forget(id).catch((e) => {
        console.error(`Could not ask the provider to forget ${id}: ${e.message}`);
      });
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

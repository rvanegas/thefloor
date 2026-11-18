/**
 * Speaks one text file through the server's own speech provider.
 *
 * Read by ts speak, which is where the reasoning lives. This is only the half
 * that has to be TypeScript: it calls `AssemblyAiSpeech` rather than the API,
 * so a file spoken here is asked exactly what Claude's replies are asked — the
 * same endpoint, the same encoding and the same sample rate.
 *
 * In: the key as `ASSEMBLYAI_API_KEY`, the file and flags as arguments.
 * Out: beside the text, same basename — `.wav`, 16-bit mono PCM at
 * `SAMPLE_RATE`. Progress on stderr; stdout is the path written.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parse, join } from 'path';

import { SPEECH_VOICES, speechLanguageOf } from '../../core/speech';
import { SAMPLE_RATE } from '../src/playback';
import { AssemblyAiSpeech, SPEECH_MAX_CHARACTERS } from '../src/speech';

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

const apiKey = process.env.ASSEMBLYAI_API_KEY;
if (!apiKey) {
  console.error('No ASSEMBLYAI_API_KEY');
  process.exit(1);
}
if (!file) {
  console.error('Which file?');
  process.exit(1);
}

// By catalogue name, as the picker shows it, or by slug.
const asked = (option('voice') ?? 'Sara').toLowerCase();
const voice = SPEECH_VOICES.find(
  (v) => v.name.toLowerCase() === asked || v.id === asked || v.id === `aai-${asked}`
);
if (!voice) {
  console.error(`No voice ${asked}; one of ${SPEECH_VOICES.map((v) => v.name).join(', ')}`);
  process.exit(1);
}
const languageArg = option('language');
const language = languageArg ? speechLanguageOf(languageArg) : voice.language;
if (!language) {
  console.error(`AssemblyAI speaks no ${languageArg}`);
  process.exit(1);
}

const { dir, name } = parse(file);
const out = join(dir, `${name}.wav`);
// Checked before the request rather than at the write, as ts transcribe does:
// audio already there is never lost, and a refused run spends nothing.
if (existsSync(out)) {
  console.error(`${out} already exists; move it aside first`);
  process.exit(1);
}

/**
 * The words alone. A line as ts transcribe writes it, `[1:02] A  text`, loses
 * its time and its voice, so a transcript is spoken back as what was said.
 */
function words(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\[\d+(?::\d{2}){1,2}\](?: [A-Z]+)?\s+/, '').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Pieces under the provider's limit, broken at a line where one fits, else at
 * a sentence, else at a space — never inside a word.
 */
function pieces(text: string): string[] {
  const result: string[] = [];
  let rest = text;
  while ([...rest].length > SPEECH_MAX_CHARACTERS) {
    // Code units overstate code points, so a cut by units is always under.
    const window = rest.slice(0, SPEECH_MAX_CHARACTERS);
    const cut = [/\n(?![\s\S]*\n)/, /[.!?…](?![\s\S]*[.!?…])/, / (?![\s\S]* )/]
      .map((pattern) => window.search(pattern))
      .find((at) => at > 0);
    const end = cut === undefined ? SPEECH_MAX_CHARACTERS : cut + 1;
    result.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) result.push(rest);
  return result;
}

/** A canonical 44-byte header over 16-bit mono PCM. */
function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** `m:ss`. */
function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function main() {
  const provider = new AssemblyAiSpeech({ apiKey: apiKey! });
  const text = words(readFileSync(file!, 'utf8'));
  if (!text) {
    console.error(`${file} has nothing to say`);
    process.exit(1);
  }
  const parts = pieces(text);
  console.error(
    `Speaking ${[...text].length} characters of ${file} as ${voice!.name}, in ${language}` +
      (parts.length > 1 ? `, in ${parts.length} requests` : '')
  );

  const audio: Buffer[] = [];
  let billed = 0;
  for (const part of parts) {
    const spoken = await provider.synthesize(
      { text: part, voice: voice!.id, language: language! },
      (pcm) => audio.push(pcm)
    );
    billed += spoken.billedCharacters;
  }

  const pcm = Buffer.concat(audio);
  writeFileSync(out, wav(pcm));
  console.error(`Done: ${clock((pcm.length / 2 / SAMPLE_RATE) * 1000)}, ${billed} characters billed`);
  console.log(out);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { CLAUDE_ID } from '../../../../core/constants';
import type { ChannelState } from '../../../../core/types';
import type { Voice } from '../../../modules/read-aloud';
import {
  bestVoice,
  readingVoice,
  replyLocale,
  speechLocale,
  useClaudeReadAloud,
  type ReadAloudControls,
} from '../readAloud';

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

/**
 * Claude's reply is read aloud as it lands, and nothing else is.
 *
 * The rules: **only a paste by Claude**, **only a new one** — a reply already
 * there when you step in was spoken to the people who were — and **leaving
 * the room stops it**.
 */

const joined = () => {
  const channel = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return reduce(
    reduce(channel, { type: 'ENTER', userId: ME }, NOW),
    { type: 'ENTER', userId: THEM },
    NOW
  );
};

const paste = (
  channel: ChannelState,
  { id = 'clip_1', authorId = CLAUDE_ID, text = 'A reply.' } = {}
) =>
  reduce(
    channel,
    {
      type: 'PASTE_CLIP',
      userId: ME,
      clip: { id, authorId, pastedAt: NOW + 1_000, kind: 'text', text },
    },
    NOW + 1_000
  );

function mount(channel: ChannelState | null, locale = 'en-US') {
  const say = jest.fn();
  const hush = jest.fn();
  // The native half's `onReading`, played by hand.
  let heard: (reply: string | null) => void = () => undefined;
  const follow = (listener: (reply: string | null) => void) => {
    heard = listener;
    return () => undefined;
  };
  let controls!: ReadAloudControls;
  function Probe({ state, tag }: { state: ChannelState | null; tag: string }) {
    controls = useClaudeReadAloud(state, tag, say, hush, undefined, follow);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe state={channel} tag={locale} />);
  });
  return {
    say,
    hush,
    get controls() {
      return controls;
    },
    hear(reply: string | null) {
      act(() => heard(reply));
    },
    press(which: 'restart' | 'stop') {
      act(() => controls[which]());
    },
    update(next: ChannelState | null, tag = locale) {
      act(() => {
        tree.update(<Probe state={next} tag={tag} />);
      });
    },
  };
}

describe('useClaudeReadAloud', () => {
  it('reads a reply from Claude as it lands', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(paste(channel, { text: 'Hello, room.' }));
    expect(probe.say.mock.calls).toEqual([
      ['Hello, room.', 'en-US', undefined, 'clip_1'],
    ]);
  });

  it('hands on the asker’s voices with the reply', () => {
    const channel = joined();
    const probe = mount(channel);
    const voices = { en: 'com.apple.voice.enhanced.en-US.Allison' };
    probe.update(
      reduce(
        channel,
        {
          type: 'PASTE_CLIP',
          userId: ME,
          clip: {
            id: 'clip_1',
            authorId: CLAUDE_ID,
            pastedAt: NOW + 1_000,
            kind: 'text',
            text: 'Hello, room.',
            voices,
          },
        },
        NOW + 1_000
      )
    );
    expect(probe.say.mock.calls).toEqual([
      ['Hello, room.', 'en-US', voices, 'clip_1'],
    ]);
  });

  it('says nothing for somebody else’s paste', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(paste(channel, { authorId: THEM }));
    expect(probe.say).not.toHaveBeenCalled();
  });

  it('does not read a reply that was already there on arrival', () => {
    const probe = mount(paste(joined()));
    expect(probe.say).not.toHaveBeenCalled();
  });

  it('reads each reply once, however many snapshots carry it', () => {
    const channel = joined();
    const probe = mount(channel);
    const replied = paste(channel);
    probe.update(replied);
    probe.update({ ...replied });
    probe.update(replied, 'es-MX');
    expect(probe.say).toHaveBeenCalledTimes(1);
    probe.update(paste(replied, { id: 'clip_2', text: 'Again.' }));
    expect(probe.say.mock.calls[1]).toEqual(['Again.', 'en-US', undefined, 'clip_2']);
  });

  it('stops speaking on leaving the room', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(paste(channel));
    probe.hear('clip_1');
    probe.update(null);
    expect(probe.hush).toHaveBeenCalled();
    expect(probe.controls.reading).toBe(false);
  });
});

/**
 * While a reply is being heard there are two controls, *Restart* and *Stop*,
 * and at no other time — which is the native half's to say, since only it
 * knows when the last sentence has played.
 */
describe('the controls while a reply is read', () => {
  const reading = () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(
      paste(paste(channel, { text: 'First.' }), { id: 'clip_2', text: 'Second.' })
    );
    return probe;
  };

  it('are there exactly while the reader says a reply is being heard', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(paste(channel));
    expect(probe.controls.reading).toBe(false);
    probe.hear('clip_1');
    expect(probe.controls.reading).toBe(true);
    probe.hear(null);
    expect(probe.controls.reading).toBe(false);
  });

  it('restart reads the reply being heard again, from the top', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(paste(channel, { text: 'First.' }));
    probe.update(paste(channel, { id: 'clip_2', text: 'Second.' }));
    // The first is still being heard while the second waits behind it.
    probe.hear('clip_1');
    probe.say.mockClear();
    probe.press('restart');
    expect(probe.hush).toHaveBeenCalledTimes(1);
    expect(probe.say.mock.calls).toEqual([['First.', 'en-US', undefined, 'clip_1']]);
  });

  it('restart does not take the bar away for the moment it stops', () => {
    const probe = reading();
    probe.hear('clip_2');
    probe.press('restart');
    probe.hear(null);
    expect(probe.controls.reading).toBe(true);
    probe.hear('clip_2');
    probe.hear(null);
    expect(probe.controls.reading).toBe(false);
  });

  it('stop silences the reader, and its quiet is believed even mid-restart', () => {
    const probe = reading();
    probe.hear('clip_2');
    probe.press('restart');
    probe.press('stop');
    expect(probe.hush).toHaveBeenCalledTimes(2);
    probe.hear(null);
    expect(probe.controls.reading).toBe(false);
  });

  it('restart does nothing when nothing is being heard', () => {
    const probe = reading();
    probe.say.mockClear();
    probe.press('restart');
    expect(probe.say).not.toHaveBeenCalled();
    expect(probe.hush).not.toHaveBeenCalled();
  });
});

const voice = (
  name: string,
  quality: Voice['quality'],
  language = 'en-US'
): Voice => ({ identifier: `${language}.${name}`, name, language, quality });

describe('bestVoice', () => {
  it('prefers quality, then the phone’s region, then the name', () => {
    expect(
      bestVoice(
        [
          voice('Samantha', 'default'),
          voice('Zoe', 'enhanced', 'en-GB'),
          voice('Ava', 'enhanced'),
        ],
        'en-US'
      )?.name
    ).toBe('Ava');
    expect(
      bestVoice([voice('Ava', 'enhanced'), voice('Zoe', 'premium', 'en-GB')], 'en-US')
        ?.name
    ).toBe('Zoe');
  });

  it('takes the voice chosen on this phone over a better one', () => {
    const voices = [
      voice('Aaron', 'enhanced'),
      voice('Allison', 'enhanced'),
      voice('Zoe', 'premium'),
    ];
    expect(bestVoice(voices, 'en-US', 'en-US.Allison')?.name).toBe('Allison');
  });

  it('forgets a chosen voice that is no longer installed', () => {
    expect(
      bestVoice([voice('Aaron', 'enhanced')], 'en-US', 'en-US.Allison')?.name
    ).toBe('Aaron');
  });

  it('is null with nothing installed', () => {
    expect(bestVoice([], 'en-US')).toBeNull();
  });
});

describe('replyLocale', () => {
  const sure = (language: string, confidence = 0.99) => () => ({
    language,
    confidence,
  });

  it('reads a reply in the language it is written in, whatever the app’s', () => {
    expect(replyLocale('Hola a todos.', 'en-US', sure('es'), 'en-US')).toBe('es');
    expect(replyLocale('Hola a todos.', 'en', sure('es'), 'es-MX')).toBe('es-MX');
  });

  it('falls back to the app’s language when the text will not say', () => {
    expect(replyLocale('https://x.y', 'en-US', sure('es', 0.3), 'en-US')).toBe(
      'en-US'
    );
    expect(replyLocale('42', 'es-MX', () => null, 'es-MX')).toBe('es-MX');
  });

  it('hands the hook’s reading to the voice', () => {
    const say = jest.fn();
    function Probe({ state }: { state: ChannelState }) {
      useClaudeReadAloud(state, 'en-US', say, () => undefined, sure('es'));
      return null;
    }
    const channel = joined();
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe state={channel} />);
    });
    act(() => {
      tree.update(<Probe state={paste(channel, { text: 'Hola a todos.' })} />);
    });
    expect(say.mock.calls[0][0]).toBe('Hola a todos.');
    expect(say.mock.calls[0][1]).toMatch(/^es/);
  });
});

describe('speechLocale', () => {
  it('keeps the phone’s region when the phone speaks the app’s language', () => {
    expect(speechLocale('es', 'es-MX')).toBe('es-MX');
    expect(speechLocale('system', 'es_MX')).toBe('es-MX');
  });

  it('is the bare language when the phone speaks another', () => {
    expect(speechLocale('es', 'en-US')).toBe('es');
    expect(speechLocale('system', 'fr-FR')).toBe('en');
  });
});

describe('readingVoice', () => {
  const voice = (identifier: string, quality: Voice['quality'] = 'enhanced'): Voice => ({
    identifier,
    name: identifier,
    language: 'en-US',
    quality,
  });
  const installed = [voice('Allison'), voice('Ava', 'premium'), voice('Aaron')];

  it('reads in the asker’s voice where this phone has it', () => {
    expect(readingVoice(installed, 'en-US', 'Allison', 'Aaron')?.identifier).toBe('Allison');
  });

  it('reads in this phone’s own choice where it has not', () => {
    expect(readingVoice(installed, 'en-US', 'Samantha', 'Aaron')?.identifier).toBe('Aaron');
    expect(readingVoice(installed, 'en-US', undefined, null)?.identifier).toBe('Ava');
  });
});

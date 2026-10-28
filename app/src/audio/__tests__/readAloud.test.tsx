import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { CLAUDE_ID } from '../../../../core/constants';
import type { ChannelState } from '../../../../core/types';
import type { Voice } from '../../../modules/read-aloud';
import {
  bestVoice,
  replyLocale,
  speechLocale,
  useClaudeReadAloud,
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
  function Probe({ state, tag }: { state: ChannelState | null; tag: string }) {
    useClaudeReadAloud(state, tag, say, hush);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe state={channel} tag={locale} />);
  });
  return {
    say,
    hush,
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
    expect(probe.say.mock.calls).toEqual([['Hello, room.', 'en-US']]);
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
    expect(probe.say.mock.calls[1]).toEqual(['Again.', 'en-US']);
  });

  it('stops speaking on leaving the room', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(paste(channel));
    probe.update(null);
    expect(probe.hush).toHaveBeenCalled();
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

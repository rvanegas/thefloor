import {
  SPEECH_VOICES,
  defaultSpeechVoice,
  isSpeechVoice,
  speechLanguageOf,
  speechVoiceFor,
} from '../speech';

describe('speech voices', () => {
  it('pins a default for English and Spanish, and English speaks for the rest', () => {
    expect(defaultSpeechVoice('en')).toBe('aai-kyla');
    expect(defaultSpeechVoice('es')).toBe('aai-antonioluis');
    expect(defaultSpeechVoice('de')).toBe('aai-kyla');
  });

  it('knows only the catalogue', () => {
    for (const voice of SPEECH_VOICES) expect(isSpeechVoice(voice.id)).toBe(true);
    expect(isSpeechVoice('kyla')).toBe(false);
    expect(isSpeechVoice(null)).toBe(false);
  });

  it('every default is in the catalogue', () => {
    expect(isSpeechVoice(defaultSpeechVoice('en'))).toBe(true);
    expect(isSpeechVoice(defaultSpeechVoice('es'))).toBe(true);
  });
});

describe('speechLanguageOf', () => {
  it('reads the tags detection and the phone spell', () => {
    expect(speechLanguageOf('es')).toBe('es');
    expect(speechLanguageOf('en_us')).toBe('en');
    expect(speechLanguageOf('pt-BR')).toBe('pt');
  });

  it('is null for a language AssemblyAI does not speak, or none', () => {
    expect(speechLanguageOf('ca')).toBeNull();
    expect(speechLanguageOf(null)).toBeNull();
    expect(speechLanguageOf('')).toBeNull();
  });
});

describe('speechVoiceFor', () => {
  it('is the language’s choice, else its default', () => {
    expect(speechVoiceFor({ en: 'aai-sara' }, 'en')).toBe('aai-sara');
    expect(speechVoiceFor({ en: 'aai-sara' }, 'es')).toBe('aai-antonioluis');
    expect(speechVoiceFor(undefined, 'en')).toBe('aai-kyla');
    expect(speechVoiceFor({ en: 'aai-nobody' }, 'en')).toBe('aai-kyla');
  });
});

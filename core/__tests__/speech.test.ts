import {
  SPEECH_VOICES,
  defaultSpeechVoice,
  isSpeechVoice,
  knownSpeechVoices,
  speechLanguageOf,
  speechVoiceFor,
  textLanguage,
  unspeakable,
  withSpeechVoice,
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

describe('textLanguage', () => {
  it('names the language a text is written in', () => {
    expect(textLanguage('La atención es una forma de la voluntad. Elige lo que está delante y también lo que no.')).toBe('es');
    expect(textLanguage('Attention is a kind of will, and it chooses what is in front of us and what is not.')).toBe('en');
    expect(textLanguage('A atenção não é uma coisa simples. Ele disse isso com você, e ela também.')).toBe('pt');
    expect(textLanguage('Die Aufmerksamkeit ist eine Art des Willens, und sie wählt, was nicht vor uns liegt.')).toBe('de');
    expect(textLanguage("L'attention est une forme de la volonté, et elle choisit ce qui est dans le monde pour nous.")).toBe('fr');
    expect(textLanguage("L'attenzione è una forma della volontà, che sceglie il mondo per noi, ma non sempre.")).toBe('it');
  });

  it('holds a Spanish text with an English quotation Spanish', () => {
    expect(
      textLanguage('Como dijo ella, "the medium is the message", y es por eso que la forma del texto es también su sentido.')
    ).toBe('es');
  });

  it('is null for too few words, or none clearly leading', () => {
    expect(textLanguage('Hola.')).toBeNull();
    expect(textLanguage('')).toBeNull();
    expect(textLanguage('the and of to is el los las del y')).toBeNull();
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

describe('withSpeechVoice', () => {
  it('fills the slot of the language each voice was recorded in, one per language', () => {
    const english = withSpeechVoice({}, 'aai-sara');
    const both = withSpeechVoice(english, 'aai-oriol');
    expect(both).toEqual({ en: 'aai-sara', es: 'aai-oriol' });
    expect(withSpeechVoice(both, 'aai-peter')).toEqual({ en: 'aai-peter', es: 'aai-oriol' });
  });

  it('leaves them as they are for a slug outside the catalogue, and clears them all on null', () => {
    const set = { en: 'aai-sara' };
    expect(withSpeechVoice(set, 'aai-nobody')).toBe(set);
    expect(withSpeechVoice(set, null)).toEqual({});
  });
});

describe('knownSpeechVoices', () => {
  it('keeps only catalogue voices, each under its own language', () => {
    expect(knownSpeechVoices({ en: 'aai-sara', es: 'aai-peter', fr: 'aai-nobody' })).toEqual({ en: 'aai-sara' });
    expect(knownSpeechVoices('aai-sara')).toEqual({});
    expect(knownSpeechVoices(null)).toEqual({});
  });
});

describe('unspeakable', () => {
  it('is a text mostly outside the Latin script the six are written in', () => {
    expect(unspeakable('会議の名前はランタンにしましょう。')).toBe(true);
    expect(unspeakable('Назовём проект «Фонарь».')).toBe(true);
    // A name in another script inside a reply in one of the six is not.
    expect(unspeakable('Call it Lantern — or 灯台, if you like.')).toBe(false);
    expect(unspeakable('Llamadlo Linterna.')).toBe(false);
    expect(unspeakable('42.')).toBe(false);
  });
});

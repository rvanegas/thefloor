/**
 * `@livekit/react-native`, as far as the browser is concerned: nothing.
 *
 * SPIKE. The real package reaches `@livekit/react-native-webrtc`, which calls
 * `requireNativeComponent` — an API react-native-web has removed, so the import
 * throws at module-evaluation time and takes the whole app with it before any
 * of our code runs. That is the failure this file exists to prevent, and it is
 * a bundler-level substitution (see `metro.config.js`) rather than seven
 * `.web.ts` siblings, because seven of our modules import this package and only
 * one of them is on any web code path.
 *
 * Everything here is inert on purpose. A browser owns its own audio session and
 * gives a page no say in it, so there is nothing for these to do — they exist
 * so that `diagnostics.ts` and its neighbours can be *imported* on web, not so
 * that they can work. Anything that would silently change behaviour if it were
 * called is a `no-op` rather than a plausible-looking value.
 */

/** The engine mute modes, by name. Values match the native enum's ordinals. */
export enum AudioEngineMuteMode {
  Unknown = 0,
  VoiceProcessing = 1,
  RestartEngine = 2,
  InputMixer = 3,
}

export interface AppleAudioConfiguration {
  audioCategory?: string;
  audioCategoryOptions?: string[];
  audioMode?: string;
}

export const AudioSession = {
  startAudioSession: async (): Promise<void> => {},
  stopAudioSession: async (): Promise<void> => {},
  configureAudio: async (): Promise<void> => {},
  setAppleAudioConfiguration: async (): Promise<void> => {},
  showAudioRoutePicker: async (): Promise<void> => {},
  getAudioDevices: async (): Promise<unknown[]> => [],
  selectAudioOutput: async (): Promise<void> => {},
};

export const AudioDeviceModule = {
  setAppleAudioConfiguration: async (): Promise<void> => {},
  isMuted: async (): Promise<boolean> => false,
  setMuted: async (): Promise<void> => {},
  getMuteMode: async (): Promise<AudioEngineMuteMode> =>
    AudioEngineMuteMode.Unknown,
  setMuteMode: async (): Promise<AudioEngineMuteMode> =>
    AudioEngineMuteMode.Unknown,
  setEngineAvailabilityObserver: (): void => {},
};

/**
 * The engine's own callbacks, which no browser will ever fire. `engineState.ts`
 * registers handlers on these behind a `Platform.OS === 'ios'` guard, so these
 * exist to keep the module importable rather than because anything calls them.
 */
export const audioDeviceModuleEvents = {
  setWillStartEngineHandler: (): void => {},
  setDidStopEngineHandler: (): void => {},
};

/**
 * What Android would be asked for, which is data rather than behaviour — and
 * so is copied verbatim from the real package rather than stubbed.
 *
 * **This is the export whose absence blanked the web build.** `session.ts`
 * reads `AndroidAudioTypePresets.media` at *module scope* to define
 * `ANDROID_IDLE`, so a shim without it does not degrade quietly: the module
 * throws `Cannot read properties of undefined (reading 'media')` while it
 * evaluates, which takes the whole page with it and names nothing that would
 * lead you here. A no-op object would be the wrong repair for the same reason
 * — what these are is a pair of constants that Android applies and a browser
 * never reads, so the honest stub is their actual values.
 *
 * **`tsc` cannot catch the next one of these.** TypeScript resolves
 * `@livekit/react-native` to the real package's types; only Metro substitutes
 * this file, and only for web. So a typecheck passes over an export this file
 * has never heard of, and the first evidence is a white screen in a browser.
 * Adding an import of the real package here is what would close that gap, and
 * cannot be done: importing it is the thing this file exists to avoid.
 */
export const AndroidAudioTypePresets = {
  communication: {
    manageAudioFocus: true,
    audioMode: 'inCommunication',
    audioFocusMode: 'gain',
    audioStreamType: 'voiceCall',
    audioAttributesUsageType: 'voiceCommunication',
    audioAttributesContentType: 'speech',
  },
  media: {
    manageAudioFocus: true,
    audioMode: 'normal',
    audioFocusMode: 'gain',
    audioStreamType: 'music',
    audioAttributesUsageType: 'media',
    audioAttributesContentType: 'unknown',
  },
} as const;

export function registerGlobals(): void {}

export function setupIOSAudioManagement(): void {}

export function useIOSAudioManagement(): void {}

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

export function registerGlobals(): void {}

export function setupIOSAudioManagement(): void {}

export function useIOSAudioManagement(): void {}

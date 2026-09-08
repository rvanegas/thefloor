// This import must come first and must stay first.
//
// @livekit/react-native installs a DOMException polyfill as an import side
// effect, and livekit-client references DOMException while its own module body
// evaluates. ES imports evaluate in declaration order, so if anything reaches
// livekit-client before this line the app dies at startup with
// "ReferenceError: Property 'DOMException' doesn't exist" — before any of our
// code runs, which makes it look like a bundler fault rather than an ordering
// one. Registering inside the audio hook is too late: that module imports
// livekit-client above its own registerGlobals() call.
import {
  registerGlobals,
  setupIOSAudioManagement,
} from '@livekit/react-native';

import { registerRootComponent } from 'expo';

import App from './App';
import { policyFor } from './src/audio/session';
import { configureMuteMode, WANTED_MUTE_MODE } from './src/audio/muteMode';

// Installs the WebRTC globals livekit-client expects (RTCPeerConnection and
// friends). Must happen before any Room is constructed.
registerGlobals();

// Replaces the automatic audio policy registerGlobals() just installed with the
// same one the app applies itself, so the two writers of this session cannot
// disagree.
//
// They did disagree, and it was visible: a tester watched the echo stop and the
// audio drop to the earpiece in the same instant, which is this observer firing
// on some later engine transition and handing the call its own configuration.
// Whichever writes last wins, and both write the same process-wide object.
//
// **It is the whole policy, not a starting one, since 2026-09-08.** `policyFor`
// takes no argument any more: the observer's three engine states are this app's
// three audio states, so the same answer is right at launch and at every edge
// afterwards. `useSessionAudio` re-pushes it anyway, because a push is a single
// atomic property assignment and re-stating it is how a superseded setup is
// superseded. Written as a call rather than a constant so the two can never
// drift apart in maintenance. See src/audio/session.ts.
setupIOSAudioManagement(true, policyFor());

// How the engine *mutes* is a third writer of this session, and it is set here
// for the same reason the policy above is: it is process-wide, it is read at a
// moment no JavaScript is on the stack, and the default is not what this app
// wants. `src/audio/muteMode.ts` carries the whole argument — including why the
// two earlier fixes for the same symptom could not have worked.
configureMuteMode()
  .then((previous) => {
    if (!__DEV__) return;
    // The previous value is observable exactly once, here. If a self-mute is
    // still audible after this, that number is where the next session starts.
    // eslint-disable-next-line no-console
    console.log(`[audio] muteMode was ${previous}, now ${WANTED_MUTE_MODE}`);
  })
  .catch((error: unknown) => {
    if (!__DEV__) return;
    // eslint-disable-next-line no-console
    console.log('[audio] muteMode could not be set', error);
  });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

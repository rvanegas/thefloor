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
import { CALL, PLAYBACK_ONLY } from './src/audio/session';

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
setupIOSAudioManagement(true, { recording: CALL, playout: PLAYBACK_ONLY });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// The web entry point, which is `index.ts` with all of it removed.
//
// Everything that file does before `registerRootComponent` is iOS audio
// session setup — `registerGlobals()` installing WebRTC globals a browser
// already has, `setupIOSAudioManagement`, `configureMuteMode` — and its
// import-order constraint exists for a DOMException polyfill that no browser
// needs. None of it has a meaning here, so none of it is here.
//
// Metro resolves `.web.ts` ahead of `.ts` when bundling for web, so this
// replaces `index.ts` wholesale rather than branching inside it.
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);

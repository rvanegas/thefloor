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
import { installThemeVariables } from './src/ui/cssVariables.web';
import { rememberTrain } from './src/ui/train.web';

// Before the app registers, so the first paint already has the palette.
// `theme.ts` resolves every colour to `var(--floor-…)` on web, and a
// stylesheet added after mount is a flash of unstyled colour — which here
// means an entire missing palette rather than a wrong shade.
installThemeVariables();

// Which bundle this browser actually uses, for the pages that have to send
// somebody into the app and cannot know. See src/ui/train.web.ts.
rememberTrain();

registerRootComponent(App);

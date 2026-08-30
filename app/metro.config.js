const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `core/` lives outside this project, so Metro will not watch or resolve it by
// default. Both the app and the server import it, which is the point — the
// floor rules have one implementation, not two.
config.watchFolders = [path.resolve(__dirname, '../core')];

// SPIKE: substitute the native audio packages on web.
//
// Seven modules under `src/audio/` import `@livekit/react-native`, which reaches
// `@livekit/react-native-webrtc`, which calls `requireNativeComponent` — an API
// react-native-web has removed. The import therefore throws while the module
// body evaluates, before any of our code runs, which reads as a bundler fault
// rather than the platform mismatch it is.
//
// Done here rather than as seven `.web.ts` siblings because only one of those
// seven is on a web code path at all; the rest are reached only as type imports
// or through `diagnostics.ts`. A single substitution keeps the native files
// untouched and leaves one place to look when the web build behaves oddly.
const stubs = {
  '@livekit/react-native': path.resolve(
    __dirname,
    'src/audio/livekitReactNative.web.ts'
  ),
};

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && stubs[moduleName]) {
    return { type: 'sourceFile', filePath: stubs[moduleName] };
  }
  return (upstreamResolve ?? context.resolveRequest)(
    context,
    moduleName,
    platform
  );
};

module.exports = config;

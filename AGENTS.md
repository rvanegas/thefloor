# Expo HAS CHANGED

This project is on **Expo SDK 54**. Read the exact versioned docs at
https://docs.expo.dev/versions/v54.0.0/ before writing any code.

It is on 54 rather than the latest because `@livekit/react-native-webrtc`'s
config plugin had no SDK 57 release. Check that before proposing an upgrade —
the media layer is what pins the version, not preference.

Confirm against `app/package.json` rather than trusting this line; a file
saying which version you are on is a file that can be wrong, and this one
already was.

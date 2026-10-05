# Electron desktop client

Wrap the existing web build in Electron, which gives one desktop client for
Linux, macOS and Windows. Raised 2026-10-04 by asking whether a native Linux app
was possible. The other routes are worse. React Native has no maintained Linux
target, Expo has none and `@livekit/react-native` covers only iOS and Android,
so a truly native client would be a second client written from scratch with
only `server/` and `core/` carried over. Tauri renders with WebKitGTK on Linux,
where WebRTC support depends on the distro. Electron ships its own Chromium, so
the media behaves as it already does in Chrome, and most of the work is
packaging: `app/` already builds for the web through `react-native-web` and
`livekit-client`.

What the shell adds over a browser tab:
- **No timer parking.** `backgroundThrottling: false` removes the cause in
  `decision/2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md`.
  Whether a hidden window should then still follow
  `decision/2026-09-16-a-hidden-tab-is-a-backgrounded-app.md` or behave as a
  foregrounded phone is a choice to make deliberately, not by accident.
- **A tray icon.**
- **Desktop notifications.** Push is APNs only, so they come either from the
  socket held open in the tray or from adding Web Push to the server.
- **A global talk key.** Electron's `globalShortcut` reports only key presses,
  never releases, so it can toggle but cannot hold-to-talk. Hold-to-talk needs a
  native hook such as `uiohook-napi`. macOS gates that behind Input Monitoring
  or Accessibility permission. Wayland blocks global key capture outright
  except through the GlobalShortcuts desktop portal, whose support in Electron
  and across desktop environments is unverified.

What it costs:
- **Signing.** macOS needs signing, notarization, a microphone usage string and
  `systemPreferences.askForMediaAccess`. Windows needs a paid code-signing
  certificate, or SmartScreen warns on every download.
- **Packaging and updates.** Linux needs a choice of package format (AppImage,
  Flatpak, `.deb`), and every platform needs its own updater.
- **One more population.** Desktop installs are another set the wire format
  stays compatible with. Like the web client, they go through no App Review,
  so a client-side check against `MIN_SUPPORTED_BUILD` is all that would keep
  them current.

**Check the Mac first.** Apple Silicon Macs can run the iPhone build unchanged
if App Store Connect allows it, which may cover macOS for nothing and leave this
task as Linux and Windows only.

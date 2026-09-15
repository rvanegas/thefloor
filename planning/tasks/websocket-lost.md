# Websocket Lost

**What is left of this entry is the phone call, and nothing has measured it.**
A phone that is stepped in holds the audio system outright and exclusively —
`playAndRecord` when there is a microphone to open, `playback` when there is
not — and an incoming cellular call takes it away as an ordinary interruption,
handled entirely by `RTCAudioSession` inside the WebRTC layer.
Answering backgrounds the app, and the `audio` background mode does not save it:
that entitlement keeps a process alive while it is *producing audio*, which an
interrupted one is not. The app is then suspended, and the whole
websocket-drop timeline runs against a phone whose owner believes they are
still in the room. See STATES.md § *Audio Connected* and § *Claimed Floor* for
the states involved, and § *Audio Session Configuration* for who configures what.

**There is no `AVAudioSession.interruptionNotification` observer anywhere in the
app**, and no CallKit integration. The only observer is a route-change one, in
`modules/audio-route/ios/AudioRouteModule.swift`. So nothing notices the
interruption begin, and nothing restores the session when it ends — an observer
that did the latter is the obvious next move, and is unmeasured.

**Measure the cellular call first.** It has still never been tried; the only
recorded sighting is a *Telegram* VoIP call, whose specific hole was fixed, and
a fix built on one sighting of a different kind of call is a guess. This is the
same order `the-foreground-interruption` asks for and for the same reasons.

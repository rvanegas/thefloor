# The drift readout shows every screen

The readout under the transport drew one player's drift: the reader's own. But
the question it exists to settle is whether the *room* is in step, and a
device's drift can only be known by that device.

So every screen now reports what its follower is steering on, as
`watch.drift`, about once a second (`DRIFT_REPORT_MS`), and a null when it
stops. The server takes a reading only from the device that is that account's
screen for the channel. It relays it only to sessions of a `debug` account
watching the channel, and withdraws it when the socket closes. The readout
keeps its full block for this device, then adds one line per other screen:
name, drift, player state, seeks, and buffering while there is any. A line
nobody withdrew lapses after three missed reports.

**Relayed only to `debug`, never put in the snapshot.** How somebody's player
behaves is a diagnostic, on the same terms as the audio panel. A snapshot field
would also re-send every channel view to everybody once a second per screen.

**Every account reports, whoever is reading.** A gate that told screens when a
debug account was listening would need its own fan-out each time a debug session
started or stopped watching. One small message a second per screen costs less
than that machinery.

**Wire order: deploy before upload.** A server that predates this answers
`watch.drift` with *Unknown message type*, which the app shows as an error. A
build that sends it must not reach a server that cannot take it. The reverse is
harmless, since an old build ignores a server message it does not know.

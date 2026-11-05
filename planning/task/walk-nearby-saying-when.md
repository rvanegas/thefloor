# Walk nearby saying when

Built 2026-11-04 and not yet on a phone —
`decision/2026-11-04-nearby-says-when.md` is the design. The suite covers the
reducer, the server's hold and answer, the APNs payload and the chooser; what
only hardware can settle is below. Two phones, A and B, contacts in one
channel, both on a build that has it, against a box that has been deployed
first (SHIMS.md § *No gate — `nearbyWhen` optionality*: an older box answers
the chooser and the buttons with 404). `APNS_ENV` is the usual trap for
anything about a push.

1. **The buttons.** A steps in and pings B. Force-quit B. Long-press the ping
   on B's lock screen: three buttons, *A few minutes*, *In 20 minutes*, *In
   the flow*. Tap *In 20 minutes*. B's app opens on the channel; B's card
   reads *Nearby · free in 20 minutes*; A gets *B: free in 20 min.* once.
2. **No replay.** Force-quit B and open it from the icon. Nothing is answered
   again — A gets nothing.
3. **The hold.** Leave B's phone down. At minute sixteen B is still nearby on
   A's roster; at thirty-five, *Stepped out*.
4. **The reminder.** At minute twenty B's phone says *You said you'd be
   free*.
5. **The chooser.** On B, nearby, *When can you come in?* under the roster;
   *In the flow* changes A's card at once and sends A nothing.
6. **Spanish**, once: the buttons and the chooser in Spanish after switching
   language, without reinstalling.

Fold what it finds into the decision and delete this.

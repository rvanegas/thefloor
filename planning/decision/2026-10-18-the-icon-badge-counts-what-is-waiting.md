# The icon badge counts what is waiting

The number on the app's icon is contact requests you can answer, plus
invitations, plus live rooms you can step into. `badgeCount` in
`core/badge.ts`; `BadgeKeeper` in `server/src/badges.ts`.

**Counting notifications sent since the app was last opened was asked for
first and withdrawn** before any of it was written. A tally like that falls
only when something marks it seen, and opening the app is a poor proxy: it
clears a number whose causes are all still sitting on Home. Everything counted
here already leaves Home by itself, so the number needs no reset at all.

**The server sends it, and only when it changes.** Home pushes go out on every
channel change — a mute is one — so the trigger is far more frequent than the
number moves; the keeper recomputes on each, coalesces two seconds, and sends
only a count that differs from the last one it sent that person. What was sent
is in memory, so a restart costs one redundant push per person, which is not
worth a column.

**A push carrying nothing but `aps.badge`**, collapsed onto one key so the
newest replaces any still in flight, at priority 5. The app's foreground
handler now passes `shouldSetBadge: true`, without which one landing while the
app is open was discarded. **Resent on every `POST /devices`**, which is every
launch, as the correction for a fresh install or a number left over from one.

**Not the room you are standing in** — it would sit at 1 in a pocket for as
long as somebody talks — and **not a room someone is merely nearby**, though
Home calls that *Live*: nobody is in it.

**iOS only, and only with push on.** Android launchers keep their own count.
Switching notifications off in Floor Settings sends 0 once and then nothing;
switching them on resends the current count.

**Mostly server-side.** An installed app should already apply a badge push
while backgrounded — `requestPermissionsAsync` is called with no arguments,
and expo-notifications' iOS default asks for badges — but that was not checked
on a device. The foreground case waits for the next upload either way.

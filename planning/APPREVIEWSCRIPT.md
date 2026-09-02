# The App Review walkthrough, as a script to follow

**Standing, and about the walk rather than the video.** A file of this name
existed for 1.0.0, when Apple's 2.1 rejection had to be answered with a
recording, and was deleted on approval. This one is back on a narrower premise:
**Apple does not require a demo video, and 1.2.0 was submitted without one** —
a recording of the previous release would have misrepresented this one, and
re-shooting per release is a burden worth refusing until something asks for it.

What is not worth refusing is the walk. RELEASING.md § *What one build costs*
calls it the highest-yield item on the whole list: making the 1.0.0 recording
meant walking the app in the order a stranger would, and it found **eight
defects in two weeks of daily use by the person who wrote it**, including a
recording feature that silently discarded what people had just recorded. Using
it found none of those. Walking it did.

So: follow this before a submission whether or not anything is being filmed.
Film it when Apple asks, when a rejection has to be answered, or when a release
adds something a reviewer would not find on their own — and then the setup
notes below matter. Otherwise treat the recording steps as optional and the
order as the point.

---

## Before you start, and before you press record if you are filming

- **A separate test account, not the review account.** The walk ends in account
  deletion, and deleting the review account takes Sam Rivera with it and leaves
  the next reviewer with an app that appears to do nothing. DEMO-ACCOUNT.md § *The
  one way a reviewer can break this*. Make a throwaway account, pair it with a
  second throwaway, and delete *that* on camera.
- **Two accounts, because one cannot make a channel.** `create` refuses an
  invitee who is not already an accepted contact, so a lone account has nothing
  to demonstrate.
- **A physical iPhone**, portrait, current iOS. Not the simulator: the
  microphone prompt, the audio route and the notification prompt are the parts
  worth showing and the simulator has none of them honestly.
- **A browser on a second device** for the guest section — a laptop is easiest
  to film beside the phone. Not an in-app browser: an iOS `WKWebView` can be
  granted the microphone and still publish silence, which is a real limitation
  the guest page detects and warns about, and it is not what you want to be
  demonstrating.
- **Check the build.** Settings → the build number should be the one you are
  submitting. A recording of the wrong build is worse than none, because the
  notes claim it is the right one. **And the build worth recording is usually
  the one after the walk**, not the one you walked: if this finds anything, the
  fix means a new build, and the recording has to be of that. Budget for
  shooting it twice, or shoot properly only once the walk has come up clean.
  RELEASING.md § *App Store Connect* has what to do when the version record is
  already holding the older build.
- Silence other notifications, and turn the ringer *on* — a ping is meant to be
  audible and this release changed which notifications are.

## The order, which is the order a stranger meets it in

Roughly twenty minutes. Narrate briefly or not at all; Apple watches for
whether the thing works, not for a pitch.

1. **Cold launch** from a device that has never run it — delete and reinstall
   first so the first screen is the real first screen.
2. **Sign in.** Enter the address, show the emailed six-digit code arriving,
   enter it. Sign-up and sign-in are one screen, so this covers both.
3. **Home, empty.** Say out loud that there is nothing to browse and nobody to
   find: this is the Guideline 1.2 claim, shown rather than asserted.
4. **Add a contact.** The Contacts half of the switch under Home's title. Enter
   the second account's address and send. Then accept it on the other device,
   switch back to Channels, and show that the channel appeared by itself —
   becoming somebody's contact produces the place you would talk to them in.
5. **Open the channel and step in.** The microphone prompt fires here. Grant it.
6. **The floor.** With both accounts present, claim it, and show the other
   phone's microphone going quiet and saying so. This is the app's one mechanic
   and the least self-explanatory thing in it.
7. **The clipboard.** Paste something; show it appearing on the other device;
   copy it there. One piece of text per channel, replaced rather than
   accumulated.
8. **Record.** Start, talk on both devices, stop. Show the recording row
   appearing, then **wait** — Play and Export are greyed for a few seconds while
   the mix is made, which the notes call out as looking like a bug. Then Play,
   Rename, Export (into Files or Mail is enough), and Delete.
9. **Play something together.** An audio file from the phone into the room, and
   the other device hearing it.
10. **The guest.** Share a guest link from the foot of the channel screen, open
    it in the laptop browser, type a name, knock. Show the knock arriving on the
    phone, admit it, and let the guest speak. Then show the three withdrawals in
    order: take the guest's microphone away, remove the guest, and revoke the
    link in the channel's Settings — and show that reloading the revoked link
    no longer gets in.
11. **Notifications.** Channel Settings → Notifications. Show the three levels
    and say what each does. Then background the app and have the other device
    ping you: show the notification arriving and the phone making a sound for
    it. Optionally set the channel to Quiet and show the next one arriving
    without one.
12. **Leave and rejoin** the channel, showing it survives and keeps its name and
    recordings.
13. **The donation link.** Support → Chip in, showing it opens Ko-fi in the
    browser and unlocks nothing. US storefront only, which is worth saying.
14. **Privacy policy**, from Settings, opening in the browser.
15. **Sign out**, then back in, to show nothing was lost.
16. **Delete the account. Last.** Settings → Delete account, confirm, and show
    the app returning to the sign-in screen. Sign in again with the same address
    to show a fresh empty account rather than the old one — the deletion is
    real, which is the thing 5.1.1(v) is asking about.

## After

- **If the walk found defects, they matter more than anything else here.** Fix
  them, and walk again on the build that has the fixes.
- **Re-read the first paragraph of the notes and make it true.** If you filmed,
  it says what the recording shows and which build it is of; if you did not, it
  says that none is attached and why. That paragraph claimed build 51 for
  months after build 51 stopped being what was submitted, and claimed an
  attachment that a new version record did not carry over — attachments belong
  to a version, and a fresh version starts with none.
- If you filmed: trim the dead air, keep it under about fifteen minutes, and
  upload it to the version's App Review Information as the attachment.

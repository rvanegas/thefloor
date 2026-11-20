# A guest does not hear Claude read aloud

Found by Rodrigo 2026-11-16, in the guest view: Claude's reply to *Ask
Claude*, which is *read aloud* as it lands, was not heard, though its text
showed as a paste.

**In a *Pro channel* that was a bug, fixed 2026-11-19.** The room reader did
speak those replies (`speech_usage` has a row for each from the guest's
arrival on), but `withholdVoice` silenced it for every listener whose room
credential had not said it hears it, and a guest's (`guestMediaToken`) never
said anything — so every guest was kept off it as a native build that reads
replies itself. Autoplay was not it: a browser's is unlocked for the whole room
at once, and the guest heard the people in it.

**What is left is the *Standard* channel**, where each iPhone reads a reply in
its own voice and the room reader says nothing. A guest page has no voice of
its own (`modules/read-aloud` is iOS's alone) and, since `guests-have-no-paste`
landed, no reply text to read either — so a guest there hears nothing. The two
ways in are the server speaking into the room whenever a guest is present,
which bills AssemblyAI in a channel nobody pays for, or the page reading a
reply with the browser's own `speechSynthesis`, which needs the reply's text
sent to a seat for that purpose alone. Rodrigo's call which, if either.

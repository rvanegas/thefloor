# Room means one LiveKit room

Rodrigo, 2026-10-09, reviewing the word after the *Record* tab was laid out in
rooms. "Room" had five senses: the sitting he had just introduced, the
people present now (guests included), their sound, *has the room*, and the
media plane's LiveKit room. He introduced the sitting **intending it to match
the LiveKit room**, and retired the other three.

**The sitting already was the LiveKit room's lifetime, nearly.** Being present
is holding a connection to it, and LiveKit creates a room on the first
connection — so first step in is its creation. At the other end LiveKit keeps
an emptied room for its `departure_timeout`, 20 seconds by default and unset
by `bin/provision-livekit`, so a sitting now carries on through a step back in
inside that window (`ROOM_DEPARTURE_MS`). Nothing reads LiveKit's own
room events; the server has no webhook from it, and presence is the same fact
seen from this side.

**The retired senses and their replacements**, chosen from proposals:

- The people present → **here**. *Present* was the alternative and was not
  chosen: in code `present` is members only, and this sense includes guests.
  *In*, the rung, read awkwardly in sentences.
- Their sound → **everyone**: *Mute everyone*, Spanish *Silenciar a todos*.
  *The conversation* was the alternative.
- *Has the room* → **present or empty**, `presentOrEmpty`, which says the rule
  rather than what it permits.

Identifiers, interface copy in both languages, and the standing documents
were changed together; nothing renamed travels on the wire, so no shim. Prose
in code comments and older GLOSSARY paragraphs still says "the room" for the
people present, and GLOSSARY.md § *Room* says to read it as *here*.

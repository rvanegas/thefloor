# Somebody who asks you may be read, and is answered on the accept route

Reported 2026-10-02 as *Contact request fails in detail view, while it works in
sidebar.* It was an incoming request being accepted.

## What was wrong

*A waiting bar that names one thing goes to it* (2026-09-27) made Home's bar
for a single incoming request open that person's profile, on the grounds that
*Accept their request* already lived there. Until then, a profile showing an
incoming request could be reached only from a channel roster, so the two
people always shared a channel. Somebody who asked by address usually shares
none, and two routes refused that pair:

- `GET /profiles/:id` admitted yourself, a contact, or `shareAChannel`. A
  pending requester was none of those, so the screen opened refused, showing
  only the name.
- *Accept their request* called `ask()` → `connectWith` →
  `POST /contacts/:id/request`. That route has the same channel gate and
  answered 404 *No such person.*

The list's *Accept* is `acceptContact` → `POST /contacts/:id/accept`, which
needs only the pending request, and it worked. A view test asserted that the
profile's button called `connectWith`, so the faulty path was pinned rather
than caught.

## What was built

- **The profile accepts on the accept route**, as `RequestRow` does, and then
  goes to the channel the acceptance makes, as that row has done since
  2026-09-24. The channel gate on asking by id is unchanged: it is what keeps
  account ids from being a way to pester people, and accepting needs none of
  it.
- **`GET /profiles/:id` admits somebody who has asked *you***. Their request
  is an act of theirs, aimed at you, and they said who they are in making it.
  The direction is the point: your own outgoing request admits nothing, or
  asking would be a way to read anybody. They are read the way a channel
  member is — name, username, invited count, the filtered *invited by* — with
  no whereabouts, handles or address, which stay a contact's.

## Considered and not done

Loosening the by-id request gate to admit a pending requester as well. It
would have fixed the button, but by making the wrong route work: an accept
would then succeed only because asking back happens to count as accepting.

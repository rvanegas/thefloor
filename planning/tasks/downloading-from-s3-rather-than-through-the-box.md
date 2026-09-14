# Downloading From S3 Rather Than Through The Box

DESIGNED, not built — the trigger is measurable load, and it has not arrived

`GET /recordings/:id/export` mixes the stems with ffmpeg, reads the whole
result into a Buffer and sends it, so every byte crosses this process — and
the mix is recomputed for every download. `bin/usage bytes` shows 28
`mix-read` against 11 `mix-write`, which is the same recording being remade
for people who have already been given it once.

**The replacement is a presigned S3 URL, and it is not a tunnel.** The server
signs a time-limited URL for one object and the client fetches it directly:
nothing crosses the box, so there is no Buffer, no egress and no memory
ceiling. A tunnel or a proxy would move every byte through a 2GB instance
again, which is the thing being removed rather than a way of removing it.

**The mix is not on S3 and cannot simply come from egress.** Only the stems are
stored; the mix is *computed*. `buildStemGraph` applies a per-identity volume
envelope from the floor timeline, so a silenced remark is gated out of the
artefact — "the last thing standing between a silenced remark and a user's
ears", in `export.ts`'s own words. A room-composite recording from egress would
know nothing about who held the floor, so that is not the shortcut it looks
like.

So the shape is **mix once, store the mix, presign thereafter**. The first
export pays the CPU and every later download is free and direct, which also
turns the mix from a per-download cost into a per-recording one. That is the
larger win, and the `mix-read` figure above is the evidence for it.

**It needs a credential change.** `thefloor-server` already holds `GetObject`
on recordings, which is enough to *sign* a download URL — that half works
today. Storing a mix needs `PutObject`, which it has not got, and
`thefloor-egress` is deliberately PutObject-only. So one policy widens, scoped
to a `mixes/` prefix. Read CREDENTIALS.md first: the separation of those
credentials is deliberate and this is the first thing to blur it.

Two things that will otherwise cost an afternoon:

- **`<a download>` is ignored cross-origin.** A link straight at S3 saves the
  file under its object key and discards the filename. Sign the URL with
  `response-content-disposition=attachment; filename="…"` so S3 sends the
  header itself.
- **A presigned URL is a bearer credential in a URL**, which is the one thing
  this project otherwise refuses — see the guest link's reasoning, and the
  privacy policy's account of who can reach a recording. It is defensible with
  a short TTL, one object, and issue only after an authenticated request, but
  it wants a decision entry rather than passing unremarked.

**The trigger is not here yet, and this entry exists so it is recognised when
it is.** The largest export so far is 43.7MB against 1,232MB available on the
box, and thirty days of egress from this server is 1.13GB against a 3TB
allowance — 0.04%. What to watch is a single export past ~150MB, or
`mix-read` climbing against `mix-write`. The second is the cheaper signal and
is already visible.

Note that the mix now runs at `PRIORITY_LOW` on one core, so a long one is slow
rather than a hazard to live audio. That was the urgent half and it is done;
what is left pushes on storage and repetition, not on calls being interrupted.

Pairs with § *Review S3*, which is what would say what the stems actually cost.
`bin/usage` cannot see them at all — the egress jobs write to the bucket on
their own credential and never through this process, so the largest category of
bytes is missing from every number it reports.

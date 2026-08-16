# Credentials

The seven credentials this project holds, where each one lives, what it can do
and what losing it costs. Split out of AGENTS.md on 2026-08-15, verbatim, when
that file reached its 650-line limit again — the same seam as RELEASING.md and
for the same reason: it is loaded into every session before anybody types
anything, and none of this is needed by somebody working on the server, the
reducer or the app's behaviour, which is most work.

**Read this before touching any credential, `bin/provision`,
`bin/provision-livekit`, or `server/.env`.**

Two of the traps here bite people who never open this file, so they stayed in
AGENTS.md: `APNS_ENV`, and the three artifacts that disagree about entitlements.
The `rtc.use_external_ip` trap stayed with the infrastructure inventory under
`### What is where`, which it should not be separated from.

---

## The seven

Deliberately separate, so no single leak is worse than it has to be:

- **LiveKit** — media. Since 2026-08-13 this is a **self-issued** API key and
  secret rather than one granted by LiveKit Cloud, generated once with
  `livekit-server generate-keys`. Being self-issued is what makes it easy to
  treat casually, and it should not be: it mints join tokens for any room.

  It lives in exactly three places, all mode 600 and all outside the synced
  tree — `server/.env` and `/etc/livekit/{livekit,egress}.yaml` on the box, and
  `~/.config/thefloor/livekit.env` on the development machine, which is what
  `bin/provision-livekit` reads. That script refuses to run without it rather
  than generating a pair of its own, on `bin/provision`'s principle that a
  script which invents credentials is one whose every invocation can leave a
  different pair behind and a server pointed at the one before it.

  Losing it is recoverable in a way the APNs key is not: generate another and
  write it to all three, at the cost of invalidating every issued join token at
  once.

- **`thefloor-egress`** — PutObject only. **It no longer leaves the box, and it
  should stay exactly this narrow anyway.** Since 2026-08-16 it is also what
  the server writes a finished mix with — `RecordingStore.put`, a second client
  beside the read one — which is the same permission it already needed for the
  playback stem and widens nothing. The original reason was that it
  travelled to LiveKit, a third party, so a leak of a key somebody else held
  could not read anyone's conversations back. Self-hosted, that reason is gone
  and the scoping is still right: an S3 key that can only add is a smaller
  blast radius than one that can read or delete, whoever holds it. Widening it
  would be trading a real property for no gain.
- **`thefloor-server`** — `ses:SendEmail` on the rvanegas.co identity and
  `s3:GetObject` on the recordings bucket. Nothing else. Created for this
  deployment because Lightsail instances get no IAM role, so the default
  credential chain has nothing to find.

  **It was nearly widened on 2026-08-16 for no reason.** Storing the mix looked
  like it needed a write here, when the server has held a PutObject key all
  along — the one above, which `media.ts` already stores the playback stem
  with. Anything that seems to need this credential widened is worth checking
  against that one first. The sweep's `DeleteObject` is a live question of the
  same kind, and is in BACKLOG.md.

  It also needs the **configuration set** in its resource list, not only the
  identity. The rvanegas.co identity has `my-first-configuration-set` attached
  as its default, so SES applies it to every send and checks permission on it —
  which failed with a message naming a resource nothing in this codebase asks
  for. Worth knowing before scoping an SES policy anywhere else.

- **APNs auth key** — a `.p8`, team-scoped, valid for both the sandbox and
  production environments, held by the server so it can sign its own provider
  JWTs. Apple offers the download **exactly once**; there is no recovery, only
  revoking the key and creating another.

  It lives at `~/.config/thefloor/AuthKey_<KEYID>.p8`, mode 600, on the box and
  on the development machine alike — a credential rather than data, which is
  what separates it from the database in `thefloor-data`.

  What matters more than the convention is that it is **outside the synced
  tree**: `bin/deploy` rsyncs with `--delete`, so a key inside the tree is one
  a later deploy removes. `*.p8` is in `.gitignore` and in the deploy excludes,
  both deliberately.

- **App Store Connect API key** — a second `.p8`, used by `bin/release-ios` to
  sign and upload without an Apple ID being signed in to Xcode.

  It exists because that dependency broke a release. Build 21 archived cleanly
  and failed at the upload with `Failed to Use Accounts`: Xcode's account list
  had emptied overnight, with nobody having signed out and no keychain reset —
  the certificate and the provisioning profiles were untouched, so only the
  Apple ID session had gone. A key belongs to the team rather than to a person,
  is not a session, and does not expire.

  Named `thefloor-release`, after what it does, as `thefloor-egress` and
  `thefloor-server` are. **Its role must be Admin.** App Manager can upload a
  build and cannot touch signing assets, so it authenticates and then fails
  with `Cloud signing permission error` / `No signing certificate "iOS
  Distribution" found` — this project has no distribution certificate locally,
  Apple holds it, and fetching it is a signing-asset operation. A key's role is
  fixed at creation, so getting this wrong means revoking and starting again.

  It lives in **its own directory**, `~/.config/thefloor/asc/`, holding
  `AuthKey_<KEYID>.p8` and a plain-text `issuer-id`. The directory is the point:
  the APNs key is an `AuthKey_*.p8` under `~/.config/thefloor` as well, and a
  glob there matches it first — alphabetically, silently, and with no way to
  tell the two apart by content, both being ES256 private keys. The script now
  refuses outright if that directory ever holds more than one key.

  The key id is read from the filename; the issuer id is per-team, so it
  survives replacing the key. `THEFLOOR_ASC_DIR` and
  `APP_STORE_CONNECT_ISSUER_ID` override both.

  Generated in App Store Connect under Users and Access → Integrations, and
  offered for download **once**, like the APNs key. Same reasons for the
  location: `*.p8` is gitignored and excluded from the deploy, and `bin/deploy`
  rsyncs with `--delete`, so a key inside the tree is one a later deploy
  removes.

  Without it the script says so and falls back to the interactive path, which
  still works whenever somebody is signed in.

- **Ko-fi webhook verification token** — `KOFI_VERIFICATION_TOKEN`, from More →
  API → Webhooks → Advanced on Ko-fi, matching the webhook URL
  `https://thefloor.rvanegas.co/donations/kofi`.

  **That URL lives in Ko-fi's dashboard and nowhere in this repository**, so
  renaming the route means editing it there in the same breath. Nothing retries
  a 404 into the right place, and Ko-fi has no read API to recover a delivery
  from — a donation posted at the old path while the dashboard still says
  `/support/kofi` is simply lost.

  Unlike every other credential here it is a **shared secret sent inside the
  request body** rather than a signature over it, so it is only safe because
  Caddy terminates TLS in front of the endpoint. Anyone holding it can write
  fabricated donations into the database. It is compared with
  `timingSafeEqual`, never logged, and — since 2026-08-14 — **stripped from the
  payload before the payload is stored**, because the first implementation kept
  the request body verbatim and put the secret on every row. See
  DECISIONS.md.

  Rotating it is cheap and non-destructive: regenerate on Ko-fi, replace the
  line in `server/.env`, restart. Nothing already recorded depends on it, which
  is the opposite of the APNs key and worth knowing when deciding how nervous to
  be.

  It lives at `~/.config/thefloor/kofi-verification-token.txt` on the
  development machine, mode 600 — outside the synced tree, on the same reasoning
  as the `.p8` keys.

`server/.env` on the box holds all of it, mode 600, and is excluded from the
sync so a deploy cannot overwrite it. `KOFI_URL`, `CONTACT_EMAIL` and the
`REVIEW_*` pair live there too and are settings rather than secrets —
`server/.env.example` documents every one of them.

# Credentials

The nine credentials this project holds, where each one lives, what it can do
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

## The nine

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

- **App Store Connect API key** — a second `.p8`, used by `bin/upload-ios` to
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

- **Android upload key** — a 4096-bit RSA keypair in a PKCS12 store, generated
  2026-09-01 when Android first needed to reach Google Play. `bin/android --aab`
  signs the App Bundle with it.

  **It is the *upload* key and not the app signing key**, and the distinction
  is the whole risk profile. Play App Signing means Google holds the key that
  actually signs what users install; we sign the upload, Google verifies it,
  re-signs, and distributes. So losing this one is a support ticket asking for
  an upload-key reset — slow and annoying — where losing an app signing key
  under the old scheme meant the listing could never be updated again by
  anybody. Letting Google hold it is the point rather than a concession.

  It lives in `~/.config/thefloor/upload.keystore`, with its password in
  `upload-keystore.txt` beside it, both mode 600. Same location and same
  reasoning as the two `.p8` keys: `bin/deploy` rsyncs with `--delete`, so a
  credential inside the tree is one a later deploy removes. `*.keystore` is
  gitignored as a second line of defence.

  **The signing is injected on the gradle command line rather than written into
  `android/app/build.gradle`**, and that is forced rather than preferred: that
  file is generated by `expo prebuild` and regenerated by `bin/android
  --prebuild`, so a signingConfig edited into it vanishes without a word. What
  it leaves behind is a bundle signed with the Android *debug* key, which looks
  like a successful build and is refused at upload. The cost of the
  command-line form is that the password is visible in `ps` for the duration of
  the build, which is accepted on a single-user machine and would not be on a
  shared one.

  Unlike every other credential here, this one is **not** issued by anybody and
  cannot be re-downloaded: it was generated locally and exists only in that
  directory. Back it up with the rest of `~/.config/thefloor`.

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
  decisions/DECISIONS.md.

  Rotating it is cheap and non-destructive: regenerate on Ko-fi, replace the
  line in `server/.env`, restart. Nothing already recorded depends on it, which
  is the opposite of the APNs key and worth knowing when deciding how nervous to
  be.

  It lives at `~/.config/thefloor/kofi-verification-token.txt` on the
  development machine, mode 600 — outside the synced tree, on the same reasoning
  as the `.p8` keys.

- **AssemblyAI** — `ASSEMBLYAI_API_KEY`, from
  [assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys).
  The eighth, added 2026-08-24 with the first phase of TRANSCRIPTS.md.

  **It is the only credential here that spends money per use**, which makes it
  the only one whose leak has a running cost rather than a one-off one: $0.15
  per audio-hour per speaker, on an account with a balance and no per-key cap.
  Somebody holding it can spend that balance and can read back any transcript
  we have not yet deleted — which, if the deletion sweep is doing its job, is
  only the ones in flight.

  **Setting it is a public act, and that is deliberate.** The `/privacy` page's
  transcription section is conditional on this key being present: with it, the
  page names AssemblyAI as a processor, says what leaves and what is deleted;
  without it, the page says nothing about any of it, because there is nothing
  to say. So do not set it to "have it ready" — set it the day transcription
  can actually be asked for. A page naming a company the server never contacts
  is as wrong as one that stays silent while it does.

  For the same reason it is marked `# env-push: optional` in
  `server/.env.example`: absent is the correct state on the box until then, and
  a warning that fires every push is a warning nobody reads.

  Rotating it is cheap and non-destructive, like the Ko-fi token: generate
  another in their dashboard, replace the line, restart. Nothing already stored
  depends on it — the transcripts are here, not there.

`server/.env` on the box holds all of it, mode 600, and is excluded from the
sync so a deploy cannot overwrite it — which also means nothing ever brought it
back. **`bin/env-pull` and `bin/env-push`** keep `~/.config/thefloor/server.env`
level with it, so the box stops being the only copy; edit in either place and
run the matching direction afterwards. Neither script prints a value: what
changed is reported by key name alone. `env-push` also names anything
`.env.example` documents and the local file lacks entirely, which is how
`MAIL_FROM` went unset once — and unset means one-time codes print to a console
nobody is reading rather than reaching anybody. `KOFI_URL`, `CONTACT_EMAIL` and the
`REVIEW_*` pair live there too and are settings rather than secrets —
`server/.env.example` documents every one of them.

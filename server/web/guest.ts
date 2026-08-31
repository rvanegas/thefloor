import {
  createLocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteTrack,
} from 'livekit-client';
import { HEARTBEAT_INTERVAL_MS } from '../../core/constants';
import type {
  GuestAction,
  GuestClientMessage,
  GuestServerMessage,
  GuestView,
} from '../../core/protocol';

/**
 * The guest page: one channel, no account, and as little of its own judgement
 * as could be managed.
 *
 * **Nothing in this repository can test this file.** There is no browser in
 * the suite and no plan to add one, so every decision that could be made on
 * the server was made there — what a guest may do, what they are called, what
 * they are shown, and when their microphone may open. What is left here is
 * rendering a `GuestView` and doing what the two `speech` messages say.
 *
 * The rules of the place it is written under, since a reader arriving from the
 * app will expect Expo and find none of it:
 *
 * - No framework and no build-time templating. `guest.html` is the shell and
 *   this is the whole of the behaviour; the bundle is esbuild's only job.
 * - Every piece of text a person reads is in `render` or in the shell, so
 *   there is one place to look when the wording is wrong.
 * - The socket is the authority. This holds no state that the server also
 *   holds — the last view received is what is on screen, and an action is a
 *   message rather than a local change hoping to be confirmed.
 */

const params = new URLSearchParams(location.search);
/** The link token, which `GET /g/:token` puts in the page. */
const linkToken =
  document.body.dataset.link ?? params.get('link') ?? '';

/**
 * The channel, when the page was reached from Home rather than from a link.
 *
 * `GET /g/c/:channelId` puts it here and puts no link token in at all, there
 * being none to put: a seat outlives the link that made it. Nothing is handed
 * out with it — what gets anybody back into the room is the seat below, which
 * is still in this tab's `sessionStorage` because the walk to `/app` and back
 * never left the tab or the origin.
 */
const pageChannelId = document.body.dataset.channel ?? '';

/**
 * Whether there is a web app on this box at all.
 *
 * *Which* one is `/open`'s question and not this page's — a channel belongs to
 * neither train, so nothing here could answer it — but whether to offer the
 * door remains this page's. `/open` on a box with no web app is a page saying
 * there is none, which is honest and is not a link worth drawing.
 *
 * Stamped by the route, and asked per request there because a page can sit
 * open across a `bin/deploy-web`.
 */
const hasWebApp = !!document.body.dataset.app;

/**
 * Where a seat is kept between reloads.
 *
 * `sessionStorage` rather than `localStorage`, deliberately: a seat belongs to
 * a visit. A tab reopened tomorrow on a link somebody shared should knock like
 * anybody else, and a secret left in a browser for a week is a credential
 * nobody remembers holding.
 */
const SEAT_KEY = 'thefloor.seat';

/**
 * Where the app keeps its session, and therefore where this page finds one.
 *
 * `localStorage` is scoped to the origin rather than the path, and one server
 * serves `/g/…` and `/app` alike — the same property `landing.ts` reads this
 * key on. Repeated here rather than imported, because nothing in the server
 * may import from `app/` and a comment is the only link the two ends can have.
 *
 * **Presence, not validity.** What is here is offered at the door and may be
 * stale; the server resolves it or does not, and nothing is lost either way.
 */
const TOKEN_KEY = 'thefloor.token';

function storedToken(): string | null {
  try {
    // Safari with storage blocked throws rather than answering null.
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function keepToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The acceptance still stands; only the next visit has to sign in again.
  }
}

interface Seat {
  channelLink: string;
  /** So the seat can be found again from an address with no link in it. */
  channelId: string;
  guestId: string;
  secret: string;
}

function storedSeat(): Seat | null {
  try {
    const raw = sessionStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const seat = JSON.parse(raw) as Seat;
    // Two addresses reach the same seat: the link it was got through, and the
    // channel it is in. A seat from some other visit matches neither.
    const mine = pageChannelId
      ? seat.channelId === pageChannelId
      : seat.channelLink === linkToken;
    return mine ? seat : null;
  } catch {
    return null;
  }
}

function keepSeat(seat: Seat | null): void {
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    // A browser refusing storage costs a reconnection, not the visit.
  }
}

const $ = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element: ${id}`);
  return element;
};

const socketUrl = (query: string): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/gws?${query}`;

let socket: WebSocket | null = null;
let view: GuestView | null = null;
let room: Room | null = null;
let microphone: LocalAudioTrack | null = null;
/** Backoff for reconnection, as the app does it: 500ms doubling to ten seconds. */
let attempt = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function send(message: GuestClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

const act = (action: GuestAction): void => send({ type: 'action', action });

// --- The room --------------------------------------------------------------

/**
 * Joins the audio room, and puts what it carries into the page.
 *
 * **Subscribing is not hearing, and this is the whole of the difference.**
 * `livekit-client` subscribes to remote tracks by itself and then hands each
 * one to the application — `attach()` builds an `<audio>` element, and until
 * something appends it to the document nothing plays. Nothing about that is
 * visible from the other end: the member's app publishes, the SFU forwards,
 * the guest's `RoomEvent.TrackSubscribed` fires, and the guest sits in silence
 * while everybody else can hear them perfectly. Which is exactly how it was
 * found, on 2026-08-22, by somebody testing the first real link.
 *
 * The native app has no equivalent step, so there was nowhere to notice this
 * by analogy. It is a browser fact.
 */
async function joinAudio(url: string, token: string): Promise<void> {
  if (room) return;
  const sink = $('audio-sink');
  room = new Room();

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    const element = track.attach();
    // Muted elements are exempt from the autoplay policy and silent, which is
    // the wrong half of that trade. `startAudio` below is how the policy is
    // actually satisfied.
    element.autoplay = true;
    sink.append(element);
  });

  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    for (const element of track.detach()) element.remove();
  });

  room.on(RoomEvent.Disconnected, () => {
    sink.textContent = '';
    stopWatching();
    room = null;
    microphone = null;
  });

  // The browser's own opinion about whether this page may make noise, which it
  // can change at any time — a tab restored from the background, a policy that
  // did not apply when the page loaded. Asked as an event rather than once, so
  // the button below appears whenever the answer becomes no.
  room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
    $('unmute-page').hidden = room?.canPlaybackAudio !== false;
  });

  await room.connect(url, token);
  await allowPlayback();
}

/**
 * Asks the browser to let this page play sound.
 *
 * Safari and Chrome both want a gesture, and the one that got us here — the
 * knock — is several seconds and one round trip ago, which may or may not
 * still count. So this is attempted immediately and offered as a button when
 * it fails, rather than assumed either way.
 */
async function allowPlayback(): Promise<void> {
  if (!room) return;
  try {
    await room.startAudio();
  } catch {
    // Refused: the button is the second chance, and it is a real gesture.
  }
  $('unmute-page').hidden = room.canPlaybackAudio;
}

/**
 * Opens or closes the microphone, following the server's word for it.
 *
 * The grant lives in the token, so publishing without one fails — this is not
 * the thing that keeps a guest silent, and must not be written as though it
 * were. What it is is the device half: asking the browser for a microphone,
 * which is a permission prompt and a decision by a person.
 */
async function setMicrophone(open: boolean): Promise<void> {
  if (!room) return;
  if (open && !microphone) {
    try {
      microphone = await createLocalAudioTrack();
      await room.localParticipant.publishTrack(microphone);
      watchCapture(microphone);
    } catch (error) {
      microphone = null;
      say(
        'Your browser would not give this page a microphone. Check its permissions and ask again.'
      );
      return;
    }
  }
  if (!open && microphone) {
    stopWatching();
    $('mic-trouble').hidden = true;
    await room.localParticipant.unpublishTrack(microphone, true);
    microphone.stop();
    microphone = null;
  }
}

/** Mutes or unmutes what is already published, which is not the same thing. */
async function setMuted(muted: boolean): Promise<void> {
  if (!microphone) return;
  if (muted) await microphone.mute();
  else await microphone.unmute();
}

// --- Is anything actually coming out of the microphone ---------------------

/**
 * Whether this page is inside an app's own browser rather than a browser.
 *
 * It matters because **a microphone that is granted is not a microphone that
 * works**. On iOS every in-app browser is a `WKWebView` owned by the host app,
 * and the host app owns the audio session with it: Telegram, Instagram and the
 * rest prompt for the microphone, grant it, hand this page a live track, and
 * deliver silence down it. Nothing in the WebRTC API reports that — the track
 * is live and unmuted, the SFU forwards the packets, and the channel hears
 * nothing. Found on 2026-08-22 by somebody following a link inside Telegram;
 * the same link in Chrome on the same phone was fine. Apple's forums carry the
 * same shape of report against several host apps and several iOS versions, and
 * every fix in them is a change to the *embedding app*, which is not us.
 *
 * The test is by exclusion, because in-app browsers are not obliged to
 * identify themselves and the interesting one does not. A real iOS browser
 * always announces itself — Safari with `Version/… Safari`, everything else
 * with its own token — so a WebKit page on iOS carrying neither is inside
 * something. The named checks in front are for the platforms where the host
 * app does say, and cost nothing.
 */
function embeddedBrowser(): boolean {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Telegram/i.test(ua)) return true;
  if ('TelegramWebviewProxy' in window) return true;

  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // Added to the home screen is not embedded, and has no Safari token either.
  if ((navigator as { standalone?: boolean }).standalone) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Version\/[\d.]+.*Safari/.test(ua);
}

/**
 * Watches what the published track is carrying, and says so when it is
 * nothing.
 *
 * The point is the failure above: there is no event for a microphone that
 * yields silence, so the only way to know is to listen to it. The analyser is
 * connected to nothing downstream — connecting it to the destination is how
 * you build an echo — and the samples never leave this function.
 *
 * It is deliberately a question and not a verdict. Somebody in a quiet room
 * with noise suppression on can read as silent too, so the notice says what
 * was observed and offers the two things that might help, rather than
 * announcing that their microphone is broken.
 */
const SILENCE = 0.002;
/** Eight seconds of samples that were actually being taken. */
const PATIENCE = 32;

let meter: { context: AudioContext; timer: ReturnType<typeof setInterval> } | null = null;

function watchCapture(track: LocalAudioTrack): void {
  stopWatching();
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  const context = new Ctor();
  void context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context
    .createMediaStreamSource(new MediaStream([track.mediaStreamTrack]))
    .connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let silent = 0;
  const timer = setInterval(() => {
    // A suspended context and a muted track are both silence that means
    // nothing, so they are not counted rather than being counted as quiet.
    if (context.state !== 'running' || track.isMuted) return;
    analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    if (peak > SILENCE) {
      // Heard something, so the question is settled for this microphone.
      $('mic-trouble').hidden = true;
      stopWatching();
      return;
    }
    silent += 1;
    if (silent >= PATIENCE) {
      $('mic-trouble').hidden = false;
      stopWatching();
    }
  }, 250);

  meter = { context, timer };
}

function stopWatching(): void {
  if (!meter) return;
  clearInterval(meter.timer);
  void meter.context.close();
  meter = null;
}

// --- The socket ------------------------------------------------------------

function connect(): void {
  const seat = storedSeat();
  // Reached from Home with no seat in this browser: there is no link here to
  // knock with, so say so rather than opening a socket that can only be
  // refused. The link somebody was sent is the way in.
  if (!seat && !linkToken) {
    $('refused-reason').textContent =
      'This browser is not holding a seat in that channel. Open the link you were sent.';
    show('refused');
    return;
  }
  socket = new WebSocket(
    seat
      ? socketUrl(
          `guest=${encodeURIComponent(seat.guestId)}&secret=${encodeURIComponent(seat.secret)}`
        )
      : socketUrl(`link=${encodeURIComponent(linkToken)}`)
  );

  socket.onopen = () => {
    attempt = 0;
    // The same cadence the app uses, read from the same constant rather than
    // written again here — this page is judged by the same sweep, and a number
    // repeated is a number that drifts. It did: this said 5_000 while the
    // constant moved to 2_000, which would have had the sweep terminating
    // every guest a moment after it let them in.
    heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_INTERVAL_MS);
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as GuestServerMessage;
    void handle(message);
  };

  socket.onclose = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    socket = null;
    // Only while there is a seat to come back to. A page that was refused has
    // nothing to retry, and hammering the door is worse than saying so.
    if (!storedSeat()) return;
    attempt += 1;
    const delay = Math.min(500 * 2 ** (attempt - 1), 10_000);
    show('reconnecting');
    setTimeout(connect, delay);
  };
}

async function handle(message: GuestServerMessage): Promise<void> {
  switch (message.type) {
    case 'door':
      $('channel-name').textContent = message.channelName;
      $('knock-button').toggleAttribute('disabled', !message.occupied);
      $('door-note').textContent = message.occupied
        ? 'Somebody inside has to let you in.'
        : 'Nobody is in this channel right now, so nobody can let you in. Try again later.';
      show('door');
      return;

    case 'knocking':
      show('knocking');
      return;

    case 'admitted':
      // Somebody answered the door, which is the one moment on this page worth
      // feeling rather than reading — a person who knocked has been looking at
      // another tab for however long it took. Android and desktop Chrome have
      // this; **iOS Safari does not implement `navigator.vibrate` at all**, so
      // for the phones most likely to open a link like this the cue is the
      // screen changing and nothing else. There is no second way to do it from
      // a browser.
      navigator.vibrate?.([40, 60, 40]);
      keepSeat({
        channelLink: linkToken,
        channelId: message.channelId,
        guestId: message.guestId,
        secret: message.secret,
      });
      show('room');
      if (message.media) {
        try {
          await joinAudio(message.media.url, message.media.token);
        } catch {
          say('The audio would not connect. Reload the page to try again.');
        }
      }
      return;

    case 'speech':
      await setMicrophone(message.maySpeak);
      return;

    case 'guest':
      view = message.view;
      render(message.view);
      if (view.you.mic === 'muted' || view.you.mic === 'open') {
        await setMuted(view.you.mic === 'muted');
      }
      return;

    case 'refused':
      // Whatever ended it — a refusal at the door, an ejection, the last
      // member leaving — the seat is over. Forgetting it here is what stops
      // the reconnection loop retrying a door that has closed.
      keepSeat(null);
      $('refused-reason').textContent = message.reason;
      show('refused');
      void room?.disconnect();
      return;

    case 'error':
      say(message.message);
      return;

    default:
      return;
  }
}

// --- Rendering -------------------------------------------------------------

type Screen = 'door' | 'knocking' | 'room' | 'refused' | 'reconnecting';

function show(screen: Screen): void {
  for (const name of ['door', 'knocking', 'room', 'refused', 'reconnecting']) {
    $(name).hidden = name !== screen;
  }
}

/** A transient line for anything the server said that is not a state. */
function say(text: string): void {
  const note = $('notice');
  note.textContent = text;
  note.hidden = false;
  setTimeout(() => {
    if (note.textContent === text) note.hidden = true;
  }, 6_000);
}

const MIC_WORDS: Record<GuestView['you']['mic'], string> = {
  listening: 'You are listening. Nobody can hear you.',
  asking: 'You have asked to speak. Waiting for somebody to answer.',
  refused: 'Somebody said no to the microphone for now.',
  open: 'Your microphone is on and the channel can hear you.',
  muted: 'Your microphone is on, and you have muted yourself.',
};

function render(next: GuestView): void {
  $('room-name').textContent = next.channelName;
  $('your-name').textContent = next.you.name;
  $('mic-state').textContent = MIC_WORDS[next.you.mic];

  const others = $('others');
  others.textContent = '';
  if (next.others.length === 0) {
    const line = document.createElement('li');
    line.textContent = 'Nobody else is here.';
    others.append(line);
  }
  for (const other of next.others) {
    const line = document.createElement('li');
    line.textContent = other.name;
    if (other.kind === 'guest') line.append(' · guest');
    if (other.speaking) line.append(' · has the floor');
    others.append(line);
  }

  // The recording line is the one thing on this page that is a promise about
  // the world rather than about the interface, so it says what is happening in
  // words rather than with a dot.
  $('recording').hidden = !next.recording;

  const asking = $('ask-button') as HTMLButtonElement;
  asking.hidden = next.you.mic !== 'listening' && next.you.mic !== 'refused';

  const mute = $('mute-button') as HTMLButtonElement;
  mute.hidden = next.you.mic !== 'open' && next.you.mic !== 'muted';
  mute.textContent = next.you.mic === 'muted' ? 'Unmute' : 'Mute';

  $('silenced').hidden = !next.you.silenced;

  // Two conditions, and both are about not offering a door that opens onto
  // nothing: a seat with no account behind it would be sent to a sign-in it
  // did not ask for, and a box with no web app has nowhere to send anybody.
  $('home-link').hidden = !next.you.accountId || !hasWebApp;

  // Seeded rather than bound: retyping over somebody mid-edit is the one way
  // a field like this can be annoying, and a snapshot arrives on every change
  // anybody makes.
  const rename = $('rename-field') as HTMLInputElement;
  if (document.activeElement !== rename) rename.value = next.you.name;

  renderAsks(next);

  const clip = $('clip');
  clip.textContent = next.clip ? next.clip.text : 'Nothing on the clipboard.';
}

/**
 * The asks, and the one control that is not addressed to the room.
 *
 * Everything else on this page is a message to the channel. This is a message
 * to an account — accepting makes somebody a contact and a member — so it goes
 * over HTTP with a token, and the seat's own secret goes with it so the server
 * can bind the two.
 */
let signingInFor: string | null = null;
let codeSentTo: string | null = null;

function renderAsks(next: GuestView): void {
  const asks = $('asks');
  asks.hidden = next.asks.length === 0;
  if (next.asks.length === 0) {
    closeSignIn();
    return;
  }

  const list = $('ask-list');
  list.textContent = '';
  for (const ask of next.asks) {
    const line = document.createElement('li');
    const said = document.createElement('p');
    said.textContent = `${ask.from} would like to add you as a contact.`;
    line.append(said);

    const accept = document.createElement('button');
    // The whole difference the account makes, said in the label: one tap for
    // somebody already signed in, and an address and a code for anybody else.
    accept.textContent = next.you.accountId
      ? 'Accept'
      : 'Accept — sign in here';
    accept.addEventListener('click', () => {
      if (next.you.accountId) void acceptAsk(ask.askerId);
      else openSignIn(ask.askerId, ask.from);
    });

    const decline = document.createElement('button');
    decline.textContent = 'No thanks';
    decline.addEventListener('click', () => {
      act({ type: 'REFUSE_CONTACT', askerId: ask.askerId });
    });

    line.append(accept, decline);
    list.append(line);
  }
}

function openSignIn(askerId: string, from: string): void {
  signingInFor = askerId;
  codeSentTo = null;
  $('sign-in').hidden = false;
  $('sign-in-address').hidden = false;
  $('sign-in-code').hidden = true;
  $('sign-in-error').hidden = true;
  ($('sign-in-button') as HTMLButtonElement).textContent = 'Send me a code';
  // Said plainly, because signing in is a bigger thing than the tap that led
  // here and nobody should discover afterwards what they have made.
  $('sign-in-note').textContent =
    `Accepting makes you and ${from} contacts, which needs an account. ` +
    'You stay in this conversation the whole time.';
}

function closeSignIn(): void {
  signingInFor = null;
  codeSentTo = null;
  $('sign-in').hidden = true;
}

function signInTrouble(text: string): void {
  const error = $('sign-in-error');
  error.textContent = text;
  error.hidden = false;
}

/**
 * Sends the acceptance, and hands the tab over to the app.
 *
 * The seat is the second half of the credential, so this cannot be replayed
 * from anywhere but the page holding it. **No `STEP_OUT` on the way out**: the
 * server has already taken the seat out of the room by the time this answers,
 * so sending one would be a guest action from somebody who is no longer a
 * guest — refused, and drawn as an error across a page that is leaving.
 */
async function acceptAsk(askerId: string): Promise<void> {
  const seat = storedSeat();
  const token = storedToken();
  if (!seat || !token) {
    signInTrouble('This page has lost its seat. Reload and try again.');
    return;
  }
  let answer: { channelId?: string | null; url?: string | null; error?: string };
  try {
    const response = await fetch('/contacts/guest-ask/accept', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        guestId: seat.guestId,
        secret: seat.secret,
        askerId,
      }),
    });
    answer = (await response.json()) as {
      channelId?: string | null;
      url?: string | null;
      error?: string;
    };
    if (!response.ok) {
      signInTrouble(answer.error ?? 'That would not go through.');
      return;
    }
  } catch {
    signInTrouble('The network would not carry that. Try again.');
    return;
  }

  keepSeat(null);
  void room?.disconnect();

  // **Where the app is, is the server's answer and not this page's guess.**
  // The two trains ship separately and a box quite normally serves one and
  // 503s the other — so a hardcoded `/app` handed somebody a JSON error body,
  // which a phone browser offers to save as a file. Whoever tapped Accept had
  // become a contact and a member and was shown a download.
  //
  // Null when there is no web app on this box at all. Said rather than
  // navigated into: the seat is closed by now, so there is no room to stay in
  // and nothing to do but tell them what happened and where they already are.
  if (answer.url) {
    location.assign(answer.url);
    return;
  }
  $('refused-reason').textContent =
    'You are contacts now, and a member of this channel. Open The Floor on your phone to join it.';
  show('refused');
}

// --- Wiring ----------------------------------------------------------------

$('knock-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $('name-field') as HTMLInputElement;
  send({
    type: 'knock',
    name: field.value,
    ...(storedToken() ? { token: storedToken()! } : {}),
  });
});

// Nobody is asked for a name they have already given. A token that turns out
// to be stale resolves to nobody and the seat is numbered instead, which is
// what the rename in the room is for.
if (storedToken()) {
  $('knock-name').hidden = true;
  $('knock-as').hidden = false;
  $('knock-as').textContent = 'You are signed in, so they will see your name.';
}

$('rename-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $('rename-field') as HTMLInputElement;
  const name = field.value.trim();
  if (!name) return;
  act({ type: 'SET_GUEST_NAME', name });
});

$('sign-in-cancel').addEventListener('click', () => {
  closeSignIn();
});

/**
 * The address, then the code — the same two routes `AuthView` uses, and the
 * same ones that make the account when the address is new.
 *
 * Written out here rather than shared, there being no way to import a React
 * Native screen into a page with no framework. What is *not* duplicated is any
 * judgement: the throttle, the code's validity, and the one answer for every
 * way of failing all stay on the server.
 */
$('sign-in').addEventListener('submit', async (event) => {
  event.preventDefault();
  const askerId = signingInFor;
  if (!askerId) return;
  const button = $('sign-in-button') as HTMLButtonElement;
  const address = ($('email-field') as HTMLInputElement).value.trim();
  const code = ($('code-field') as HTMLInputElement).value.trim();
  $('sign-in-error').hidden = true;
  button.disabled = true;

  try {
    if (!codeSentTo) {
      const response = await fetch('/auth/request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: address }),
      });
      const answer = (await response.json()) as { error?: string };
      if (!response.ok) {
        signInTrouble(answer.error ?? 'That address would not go through.');
        return;
      }
      codeSentTo = address;
      $('sign-in-address').hidden = true;
      $('sign-in-code').hidden = false;
      button.textContent = 'Sign in and accept';
      $('sign-in-note').textContent = `We sent a code to ${address}.`;
      return;
    }

    const response = await fetch('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: codeSentTo,
        code,
        // The name they are using here, so an account made at this door is not
        // born nameless. Ignored by the server for an account that exists.
        displayName: view?.you.name,
      }),
    });
    const answer = (await response.json()) as { token?: string; error?: string };
    if (!response.ok || !answer.token) {
      signInTrouble(answer.error ?? 'That code did not work.');
      return;
    }
    keepToken(answer.token);
    await acceptAsk(askerId);
  } catch {
    signInTrouble('The network would not carry that. Try again.');
  } finally {
    button.disabled = false;
  }
});

$('unmute-page').addEventListener('click', () => {
  void allowPlayback();
});

$('copy-link-button').addEventListener('click', () => {
  void navigator.clipboard
    .writeText(location.href)
    .then(() => say('Link copied. Paste it into Safari or Chrome.'))
    .catch(() => say('This browser would not let the page copy the link.'));
});

/**
 * A second attempt at the microphone, from a tap.
 *
 * Which is the other thing it might be: a page that asked for a microphone
 * without a gesture behind it. The server's `speech` message arrives on a
 * socket, seconds after anybody touched anything, and a browser is entitled to
 * treat that as untrusted. So the retry is worth having even where the host
 * app is not at fault, and it costs a tap.
 */
$('mic-retry-button').addEventListener('click', () => {
  $('mic-trouble').hidden = true;
  void (async () => {
    await setMicrophone(false);
    await setMicrophone(true);
    if (view?.you.mic === 'muted') await setMuted(true);
  })();
});

$('ask-button').addEventListener('click', () => act({ type: 'REQUEST_SPEECH' }));

$('mute-button').addEventListener('click', () => {
  act({ type: 'SET_SELF_MUTE', muted: view?.you.mic !== 'muted' });
});

$('leave-button').addEventListener('click', () => {
  act({ type: 'STEP_OUT' });
  keepSeat(null);
  $('refused-reason').textContent = 'You have left the channel.';
  show('refused');
  void room?.disconnect();
});

$('copy-button').addEventListener('click', () => {
  if (view?.clip) void navigator.clipboard.writeText(view.clip.text);
});

$('paste-button').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) act({ type: 'PASTE_CLIP', text });
  } catch {
    say('Your browser would not let this page read the clipboard.');
  }
});

$('embedded').hidden = !embeddedBrowser();

connect();

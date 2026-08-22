import {
  createLocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteTrack,
} from 'livekit-client';
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
 * Where a seat is kept between reloads.
 *
 * `sessionStorage` rather than `localStorage`, deliberately: a seat belongs to
 * a visit. A tab reopened tomorrow on a link somebody shared should knock like
 * anybody else, and a secret left in a browser for a week is a credential
 * nobody remembers holding.
 */
const SEAT_KEY = 'thefloor.seat';

interface Seat {
  channelLink: string;
  guestId: string;
  secret: string;
}

function storedSeat(): Seat | null {
  try {
    const raw = sessionStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const seat = JSON.parse(raw) as Seat;
    return seat.channelLink === linkToken ? seat : null;
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
    } catch (error) {
      microphone = null;
      say(
        'Your browser would not give this page a microphone. Check its permissions and ask again.'
      );
      return;
    }
  }
  if (!open && microphone) {
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

// --- The socket ------------------------------------------------------------

function connect(): void {
  const seat = storedSeat();
  socket = new WebSocket(
    seat
      ? socketUrl(
          `guest=${encodeURIComponent(seat.guestId)}&secret=${encodeURIComponent(seat.secret)}`
        )
      : socketUrl(`link=${encodeURIComponent(linkToken)}`)
  );

  socket.onopen = () => {
    attempt = 0;
    heartbeat = setInterval(() => send({ type: 'ping' }), 5_000);
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

  const floor = $('floor-button') as HTMLButtonElement;
  floor.textContent = next.you.holdingFloor ? 'Give up the floor' : 'Take the floor';
  floor.disabled = !next.you.holdingFloor && !next.you.canClaimFloor;

  $('silenced').hidden = !next.you.silenced;

  const clip = $('clip');
  clip.textContent = next.clip ? next.clip.text : 'Nothing on the clipboard.';
}

// --- Wiring ----------------------------------------------------------------

$('knock-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $('name-field') as HTMLInputElement;
  send({ type: 'knock', name: field.value });
});

$('unmute-page').addEventListener('click', () => {
  void allowPlayback();
});

$('ask-button').addEventListener('click', () => act({ type: 'REQUEST_SPEECH' }));

$('mute-button').addEventListener('click', () => {
  act({ type: 'SET_SELF_MUTE', muted: view?.you.mic !== 'muted' });
});

$('floor-button').addEventListener('click', () => {
  act(view?.you.holdingFloor ? { type: 'RELEASE_FLOOR' } : { type: 'CLAIM_FLOOR' });
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

connect();

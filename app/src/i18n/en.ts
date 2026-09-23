/**
 * What the app says, in English — the source of truth for what messages exist.
 *
 * **One function per message, grouped by the screen that says it.** The group
 * is the file, near enough, so a view opens one group and a reader looking for
 * a string knows where it lives without a search. A message said by two
 * screens goes in `shared`.
 *
 * **Interpolation happens inside the function, not at the call site.** The
 * point of the shape is that Spanish may build the sentence in a different
 * order, or choose a different word depending on the number, and no call site
 * has to know that.
 *
 * `index.ts` derives the `Strings` type from this object, so adding a message
 * here is what makes it required of every other language.
 *
 * **The two developer screens are deliberately absent.** `AudioLabView` and
 * `AudioDebugPanel` are instruments, read by whoever is holding the phone and
 * the source at once, and translating them would cost sixty messages to make
 * a diagnostic harder to correlate with the code it is diagnosing. The guard
 * test in `__tests__/extracted.test.ts` exempts them by name, so this is a
 * decision rather than an oversight.
 */
export const en = {
  updateRequired: {
    title: () => 'Time to update',
    tooOld: () =>
      'This version of The Floor is too old for the server it talks to, so it has stopped rather than showing you something it cannot promise is true.',
    everythingKept: () =>
      'Update from the App Store and everything — your channels, your contacts, your recordings — will be where you left it.',
    openAppStore: () => 'Open the App Store',
  },
  /**
   * Words more than one screen says, and says for the same reason.
   *
   * **A label goes here only when the two uses are the same act.** `Close` on
   * a detail pane and `Close` on a settings sheet both dismiss something with
   * nothing behind it, so they are one message; a word that happens to be
   * spelled the same in two unrelated places is two messages, because the two
   * can need different Spanish.
   */
  shared: {
    close: () => 'Close',
    /**
     * A control's name and the mark on it, for a screen reader. Here rather
     * than composed at the call site because the comma is a choice and a
     * language may make a different one.
     */
    labelWithBadge: (label: string, badge: string) => `${label}, ${badge}`,
  },
  offline: {
    partlyConnected: () => 'Partly connected',
    notConnected: () => 'Not connected',
    roomStillAudible: () =>
      'You can still hear the room, and if you had the floor you can still be heard — the conversation travels on its own connection. Everything that manages it is down: the microphone, the floor, and every other screen.',
    cannotReach: () =>
      'The Floor cannot reach the server, so nothing here can be changed and nothing shown would be current.',
    queueDropped: () =>
      'Anything you did in the last few seconds did not go through. It is not waiting to be sent, so do it again once this clears.',
    whoWasInTheRoom: () => 'Who was in the room',
    asOfLastUpdate: () =>
      'As of the last update that arrived. Nobody is being added or removed here until the connection is back.',
    tryingAgain: () => 'Trying again…',
  },
  support: {
    title: () => 'Support',
    whatItCosts: () =>
      'The Floor runs on a server that costs money every month — the box it lives on, the audio that carries a conversation, and the storage your recordings sit in.',
    unlocksNothing: () =>
      'Giving is entirely optional and unlocks nothing. Every part of the app works the same whether you do or not, and nobody is told who has and who has not.',
    /** `giving` is already a phrase — see `describeGiving` in money.ts. */
    thankYou: (giving: string) => `You have given ${giving}. Thank you — genuinely.`,
    chipIn: () => 'Chip in',
    useThisAddress: (identifier: string) =>
      `Opens in your browser. Use ${identifier} there and it will show up here; pay with anything else and it arrives without a name on it.`,
    noWayToGive: () => 'There is no way to give from here at the moment.',
  },
  /**
   * The three phrases `core/naming.ts` assembles a channel's description
   * from. The shape — two names then a count — is core's and is not repeated
   * here; only the words are.
   */
  naming: {
    justYou: () => 'Just you',
    pair: (first: string, second: string) => `${first} and ${second}`,
    andOthers: (shown: string, rest: number) =>
      `${shown} and ${rest} other${rest === 1 ? '' : 's'}`,
  },
  /**
   * What each notification level promises, in the words a person reading the
   * setting needs. Was `describeLevel` in core until the app learned a second
   * language; see the note left in `core/notifications.ts`.
   *
   * Phrased as what *arrives*, not as what is suppressed. Somebody choosing
   * `low` is not asking for less software, they are asking to be left alone
   * about this channel — and the sentence has to make clear that the messages
   * still exist and can be gone and read, or the setting reads as an off
   * switch and gets avoided by people who wanted exactly it.
   */
  notificationLevel: {
    low: () => ({
      label: 'Quiet',
      detail: 'Nothing makes a sound or lights the screen, pings included.',
    }),
    medium: () => ({
      label: 'Pings only',
      detail: 'A ping makes a sound. Nothing else does.',
    }),
    high: () => ({
      label: 'Everything',
      detail: 'Arrivals and invitations make a sound, as pings do.',
    }),
  },
  /** The line under the username field; the fault is decided in core. */
  usernameFault: {
    tooLong: (max: number) => `A username can be at most ${max} characters.`,
    tooShort: (min: number) => `A username needs at least ${min} characters.`,
    charset: () =>
      'Letters, digits and underscores only — no spaces, dots or dashes.',
  },
  leaderboard: {
    title: () => 'Invitations',
    whatTheNumberMeans: () =>
      'Everybody who signed up from that person\u2019s invitation, plus everybody those people went on to invite, all the way down.',
    nobodyYet: () => 'Nobody has brought anybody here yet.',
  },
  podcasts: {
    noServer: () => 'No server is configured, so there is nothing to list.',
  },
  notifications: {
    title: () => 'Being reachable',
    cohortOffer: () =>
      'You arrived without anybody here. Turn these on and we will put you in a channel with a few other people who joined around the same time, and one of us, so there is somebody to talk to.',
    cohortOnce: () =>
      'It is one channel, it happens once, and you can leave it whenever you like. Nobody in it becomes a contact.',
    peopleNotMessages: () =>
      'The Floor is people talking, not messages waiting. Somebody walks into a channel, or pings you from one, and the whole of it happens while they are there.',
    otherwiseUnreachable: () =>
      'Without notifications this phone can only be reached while you happen to be looking at it. Everyone else sees you as somebody who never answers.',
    whatWeWillSend: () => 'What we will send',
    onlyAPerson: () =>
      'Only a person. Somebody invited you, somebody pinged you, or somebody walked into a channel you belong to. That is all three kinds there are.',
    nothingOnOurBehalf: () =>
      'Nothing to bring you back, nothing about what you have missed, and nothing the app decided to send on its own behalf. There is no version of this that is good for us and bad for you.',
    howLoudPerChannel: () => 'How loud, per channel',
    setPerChannel: () =>
      'Each channel is set on its own, in its settings, whenever you like. New ones start at Pings only.',
    asking: () => 'Asking\u2026',
    turnOn: () => 'Turn on notifications',
    alreadyAnswered: () =>
      'You have already answered this once, and iOS only asks the once. Turning it on now happens in Settings, under Notifications.',
    openSettings: () => 'Open Settings',
    notNow: () => 'Not now',
  },
  help: {
    title: () => 'Help',
    whatThisIs: () =>
      'Ask anything about The Floor — how something works, or what went wrong. A person reads these and writes back, and the answer appears here under your question.',
    placeholder: () => 'What would you like to know?',
    sending: () => 'Sending\u2026',
    ask: () => 'Ask',
    yourQuestions: () => 'Your questions',
    answer: () => 'Answer',
    /** `since` is already a phrase — see `relativeTime.ago`. */
    askedNotAnswered: (since: string) => `Asked ${since} \u00b7 not answered yet`,
  },
  auth: {
    /**
     * Not translated, and not a message anybody should be tempted to
     * translate: `The Floor` is `CFBundleDisplayName`, the name under the icon
     * and the name registered with Apple. It is here so that the sign-in
     * screen reads it from the same place as everything else rather than
     * carrying a literal that looks extractable.
     */
    brand: () => 'The Floor',
    tagline: () =>
      'Audio channels where either party can claim uninterrupted time.',
    notConfigured: () => 'Not configured',
    enterEmail: () => 'Enter your email address.',
    enterCode: () => 'Enter the code from your email.',
    emailPlaceholder: () => 'Email address',
    sending: () => 'Sending\u2026',
    sendCode: () => 'Send code',
    emailedCodeTo: (address: string) =>
      `We emailed a six-digit code to ${address}`,
    codePlaceholder: () => 'Six-digit code',
    displayNamePlaceholder: () => 'Display name (blank keeps your current one)',
    marketingConsent: () =>
      'Email me occasionally about The Floor — how to use it, and what is new.',
    checking: () => 'Checking\u2026',
    signIn: () => 'Sign in',
    useDifferentAddress: () => 'Use a different address',
    serverHint: (url: string) => `Server: ${url}`,
    /**
     * **Returned in pieces because two of them are italic.** A sentence with
     * emphasis inside it is several `Text` nodes, and the alternative — a
     * message per fragment — would let a language put them in an order its
     * own grammar refuses. One function still owns the whole sentence; the
     * view only knows which slots exist, and Spanish decides what goes in
     * each and how they read together.
     */
    embeddedLead: () => 'You are in an app\u2019s built-in browser.',
    embeddedWhy: () =>
      ' On iOS these browsers often hand a page a microphone that produces silence — everyone hears nothing and nothing says so.',
    embeddedAdvice: () => ({
      before:
        'Open this link in Safari or Chrome instead: the menu at the top or bottom of this window has ',
      firstMenuItem: 'Open in Safari',
      between: ' or ',
      secondMenuItem: 'Open in browser',
      after:
        '. If you cannot find it, copy the link and paste it into a browser yourself.',
    }),
    linkCopied: () => 'Link copied',
    copyTheLink: () => 'Copy the link',
  },
  panes: {
    brand: () => 'The Floor',
    pickAConversation: () => 'Pick a conversation on the left, or start one.',
  },
  watch: {
    openTheWatchTab: () => 'Open the watch tab',
    exitFullScreen: () => 'Exit full screen',
    seek: () => 'Seek',
    back15: () => '\u221215s',
    forward15: () => '+15s',
    pause: () => 'Pause',
    play: () => 'Play',
    /**
     * What a refusal means, in the words of somebody watching rather than
     * YouTube's. The codes that survive the origin being right are the
     * owner's; 152 and 153 are the app's own fault and say so, because the
     * next person to see one needs to be sent here and not to the video's
     * owner.
     */
    refusedOutsideYouTube: () =>
      'The owner of this video does not allow it to play outside YouTube.',
    videoGone: () => 'This video is gone — deleted, or private.',
    notAVideo: () => 'That link is not a video YouTube knows.',
    playerRefused: (code: number) =>
      `YouTube refused this player (${code}) — the app is at fault, not the video.`,
    couldNotPlay: (code: number) =>
      `YouTube could not play this video (${code}).`,
  },
  /**
   * The three sentences `ui/availability.ts` chooses between, and why there
   * are three rather than one reused: each is about a different subject —
   * a person anywhere in the app, a room, a person in one room — and reading
   * one as another is exactly the mistake the words exist to prevent.
   */
  availability: {
    inTheAppNow: () => 'In the app now',
    /** `since` is already a phrase — see `relativeTime.agoOrNull`. */
    lastSeen: (since: string) => `Last seen ${since}`,
    notUsedYet: () => 'not used yet',
    nobodyElseYet: () => 'nobody else yet',
    hereNow: () => 'Here now',
    neverBeenHere: () => 'Never been here',
    lastHere: (since: string) => `Last here ${since}`,
  },
  /**
   * The two words in `ui/money.ts`. **The numeral is not here and is not
   * translated**, deliberately: `formatAmount` prints Ko-fi's payout
   * currencies with a symbol table chosen for them, and moving to
   * `Intl.NumberFormat` would be a different decision — whether a reader in
   * Spain should see `5,00 €` for a gift they made in dollars — with a
   * different person to make it. What is here is only the prose around it.
   */
  money: {
    nothingYet: () => 'nothing yet',
    andLast: (rest: string, last: string) => `${rest} and ${last}`,
  },
  contacts: {
    requests: () => 'Requests',
    you: () => 'You',
    /** What a screen reader says about your own row. */
    openYourProfile: (name: string) => `${name}. You. Open your profile.`,
    /**
     * And about somebody else's. `availability` is the line already on the
     * row, or null when there is none — the sentence is assembled here rather
     * than at the call site so that a language may put the two in the other
     * order.
     */
    openTheirProfile: (name: string, availability: string | null) =>
      `${name}.${availability ? ` ${availability}.` : ''} Open their profile.`,
    yourContacts: () => 'Your contacts',
    nobodyYet: () =>
      'Nobody yet. Add somebody by the address they signed up with, and they decide.',
    wantsToBeAContact: () => 'Wants to be a contact',
    pending: () => 'Pending',
    accept: () => 'Accept',
    decline: () => 'Decline',
    sent: () => 'Sent',
    withdraw: () => 'Withdraw',
    couldNotWithdraw: () => 'Could not withdraw',
    addAContact: () => 'Add a contact',
    alreadyAsked: () => 'They had already asked — you are now contacts.',
    requestSent: () => 'Request sent — awaiting their acceptance.',
    searchByEmail: () => 'Search by email address',
    cancel: () => 'Cancel',
    sending: () => 'Sending\u2026',
    sendRequest: () => 'Send request',
    or: () => 'or',
    toGenerateAnInviteLink: () => 'To generate an invite link,',
    chooseAUsername: () => 'Choose a Username',
    makingALink: () => 'Making a link\u2026',
    shareInviteLink: () => 'Share Invite Link',
    copyInviteLink: () => 'Copy Invite Link',
    linkCopied: () =>
      'Link copied. It works once, for the first person who opens it.',
    clipboardRefused: () => 'The clipboard refused. Try again.',
  },
  channels: {
    declineTitle: () => 'Decline this invitation?',
    /**
     * `from` is who invited you, or null when the server did not say. The
     * clause changes and not only the noun, which is why the whole sentence
     * is built here.
     */
    declineBody: (from: string | null) =>
      `It disappears from your home screen and you will need a fresh invitation to ${
        from ? `join ${from}` : 'come back'
      }.`,
    cancel: () => 'Cancel',
    decline: () => 'Decline',
    couldNotStartChannel: () => 'Could not start channel',
    thatDidNotWork: () => 'That did not work.',
    reconnecting: () => 'Reconnecting\u2026',
    notConnected: () => 'Not connected — invites and channels will not update.',
    startAChannel: () => 'Start a channel',
    declineInvite: () => 'Decline invite',
    /** What an unnamed channel is called on a seat's card. */
    aChannel: () => 'A channel',
    askedYouInAsGuest: (from: string) => `${from} asked you in as a guest`,
    askedYouIn: (from: string) => `${from} asked you in`,
    waiting: (asked: string) => `${asked} · waiting`,
    askedAnd: (asked: string, quiet: string | null) =>
      `${asked}${quiet ? ` · ${quiet}` : ''}`,
    youAreAGuestHere: (present: number | null) =>
      `You are a guest here${present !== null ? ` · ${present} present` : ''}`,
    present: (count: number) => `${count} present`,
    nearby: (count: number) => `${count} nearby`,
    /**
     * The whole of what a screen reader says about one row: the name, the
     * status line if there is one, whether this reader has been in and out,
     * and what a tap does.
     *
     * **"in and out" rather than "in"**, and the extra two words are not
     * padding: the action at the end of the same label is *Step in*, and
     * "Stepped in. Step in." is what the shorter version read as.
     */
    rowLabel: (
      title: string,
      line: string | null,
      steppedIn: boolean,
      asGuest: boolean
    ) =>
      `${title}. ${line ? `${line}. ` : ''}${
        steppedIn ? 'Stepped in and out. ' : ''
      }${asGuest ? 'Open as a guest.' : 'Open.'}`,
  },
  home: {
    settings: () => 'Settings',
    /** The pinned bar for the room you are standing in, for a screen reader. */
    liveBarLabel: (title: string, muted: boolean) =>
      `${title}, ${
        muted ? 'your microphone is muted' : 'you are here'
      }. Tap to return.`,
    nobodyElseHereYet: () => 'Nobody else is here yet',
    present: (count: number) => `${count} present`,
    tapToGoBack: () => ' · tap to go back',
    filmElsewhere: (title: string) =>
      `${title}: the film is on another of your devices. Tap to watch it here instead.`,
    nearbyBarLabel: (title: string, present: number) =>
      `${title}, you are nearby. ${
        present === 0 ? 'Nobody is there.' : `${present} present.`
      } Tap to open.`,
    /**
     * *Nearby* first, because the state is the point of the bar and the count
     * is what to do about it. Nought is not said as a number: a nought beside
     * a word like *present* reads as a failure to load.
     */
    nearbySub: (present: number) =>
      present === 0 ? 'Nearby · nobody there' : `Nearby · ${present} present`,
    help: () => 'Help',
    /**
     * The mark on the Support tab and on the Help card. The word is
     * *answered* because what is waiting is the reading of it — a screen
     * reader hears "Help, answered".
     */
    answered: () => 'answered',
    askUsSomething: () =>
      'Ask us something, or say what is broken. A person reads it and writes back, and the answer waits here under your question.',
    chipIn: () => 'Chip in',
    whatItCosts: () =>
      'The box this runs on, the audio that carries a conversation and the storage your recordings sit in all cost money every month.',
    leaderboard: () => 'Leaderboard',
    leaderboardWhy: () =>
      'Who has brought the most people to The Floor. It is here because it was turned on for your account.',
    audioLab: () => 'Audio lab',
    audioLabWhy: () =>
      'A bench for the iOS audio session. Run a trial outside any channel, or what it measures is three writers arguing.',
    putItOnYourPhone: () => 'Put The Floor on your phone',
    browserCannotNotify: () =>
      'A browser cannot notify you, so nobody can reach you here unless you are looking. The app can.',
    notNow: () => 'Not now',
    getTheApp: () => 'Get the app',
    nobodyCanReachYou: () => 'Nobody can reach you',
    notificationsAreOff: () =>
      'Notifications are off for The Floor, so an invitation or a ping arrives only if you happen to be looking.',
    tellMeMore: () => 'Tell me more',
    contacts: () => 'Contacts',
    /**
     * Plural unconditionally. A screen reader hearing "requests waiting" and
     * finding one is told nothing untrue, and the alternative is the tier
     * knowing how to count for the sake of a case it cannot see.
     */
    requestsWaiting: () => 'requests waiting',
    channels: () => 'Channels',
    podcasts: () => 'Podcasts',
    support: () => 'Support',
  },
};

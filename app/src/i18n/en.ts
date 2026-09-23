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
};

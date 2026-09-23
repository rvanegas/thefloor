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
  channelCards: {
    guestSuffix: () => ' · guest',
    notReceivingYou: () => 'Not receiving you',
    listeningAsking: () => 'Listening · asking to speak',
    listeningRefused: () => 'Listening · was told no',
    listening: () => 'Listening',
    hasTheFloor: () => 'Has the floor',
    canSpeakMuted: () => 'Can speak · muted themselves',
    speaking: () => 'Speaking',
    canSpeak: () => 'Can speak',
    turnTheirMicrophoneOff: () => 'Turn their microphone off',
    letThemSpeak: () => 'Let them speak',
    turnTheirMicrophoneOn: () => 'Turn their microphone on',
    asked: () => 'Asked',
    theySaidNo: () => 'They said no',
    contact: () => 'Contact',
    addContact: () => 'Add contact',
    askThemToJoin: () => 'Ask them to join',
    addToChannel: () => 'Add to channel',
    remove: () => 'Remove',
    stepInToAnswerForAGuest: () => 'Step in to answer for what a guest may do.',
    theyCanHearYouCannot: () =>
      'They can hear the channel. Nobody can hear them.',
    nearby: () => 'Nearby',
    presentNotReceivingYou: () => 'Present · not receiving you',
    present: () => 'Present',
    /** `since` is already a phrase — see `relativeTime.duration`. */
    nearbyFor: (since: string) => `Nearby ${since}`,
    steppedOut: () => 'Stepped out',
    steppedOutAgo: (since: string) => `Stepped out ${since}`,
    /**
     * A member who has never come into the channel.
     *
     * **This is the second of the three *invitado* collisions**, and the one
     * `decisions/2026-09-22-the-members-tab-is-the-people-tab.md` left to the
     * extraction. In English *Invited* sits a word away from *Guest* and from
     * the *Invitations* group, and in Spanish all three want the same word —
     * which would make a member read as a guest, the one distinction this
     * roster cannot afford to blur. Settled by naming the absence instead of
     * the invitation: see `es.ts`, where this is *Sin entrar*.
     */
    invited: () => 'Invited',
    you: (name: string) => `${name} (you)`,
    muted: () => ' · muted',
    hasTheFloorSuffix: () => ' · has the floor',
    watching: () => ' · watching',
    /** `seconds` is already formatted — see `formatSeconds`. */
    waitFor: (seconds: string) => `wait ${seconds}`,
    pinging: () => 'Pinging\u2026',
    pinged: () => 'Pinged',
    ping: () => 'Ping',
    /**
     * The whole of what a screen reader says about one roster card. No
     * seconds in it, deliberately: the clock beside the name ticks once a
     * second and a label carrying it would announce the card afresh each
     * time.
     */
    participantLabel: (
      name: string,
      self: boolean,
      status: string,
      holdsFloor: boolean,
      watching: boolean,
      speaking: boolean,
      openable: boolean
    ) =>
      `${name}${self ? ', you' : ''}. ${status}.${
        holdsFloor ? ' Has the floor.' : ''
      }${watching ? ' Watching.' : ''}${speaking ? ' Speaking.' : ''}${
        openable ? ' View profile.' : ''
      }`,
    stepInToAskAnybodyIn: () =>
      'Step in to ask anybody in. An invitation lands in whatever is being said, so it belongs to whoever is saying it.',
    memberOrGuestFull: (cap: number) =>
      `A member joins the channel and stays; it holds ${cap}, and is full. A guest is here for this conversation only, and the seat ends when the room does.`,
    memberOrGuest: () =>
      'A member joins the channel and stays. A guest is here for this conversation only — they see names and nothing else, and the seat ends when the room does.',
    guestOnlyFull: (cap: number) =>
      `A guest is here for this conversation only, and the seat ends when the room does. Membership is not on offer: the channel holds ${cap} and is full.`,
    guestOnly: () =>
      'A guest is here for this conversation only, and the seat ends when the room does.',
    invite: (name: string) => `Invite ${name}`,
    guest: () => 'Guest',
    member: () => 'Member',
    audioNotConnected: () => 'Audio not connected.',
    connectingAudio: () => 'Connecting audio\u2026',
    audioDropped: () => 'Audio dropped — reconnecting\u2026',
    audioMovedToOtherDevice: () => 'Audio moved to your other device.',
    microphoneRefused: () => 'Microphone access refused.',
    audioNotConfigured: () => 'Audio is not configured on the server.',
    audioFailed: (message: string | null) =>
      `Audio failed: ${message ?? 'unknown error'}`,
    playbackBlockedLead: () => 'This browser will not play sound yet.',
    playbackBlockedRest: () =>
      ' It waits to be asked, so nothing said in this channel is reaching you.',
    playTheChannel: () => 'Play the channel',
    microphoneSilentLead: () => 'Nothing is coming from your microphone.',
    microphoneSilentRest: () =>
      ' If you have been talking, nobody is hearing it — which is what an app\u2019s built-in browser usually does on iOS. Open this in Safari or Chrome instead; stepping out and back in takes the reading again.',
  },
  seat: {
    /**
     * **The guest page's five sentences verbatim.** They are the same five
     * states of the same seat, and two wordings for one fact is how a person
     * comes to believe the phone and the laptop are telling them different
     * things. See `MIC_WORDS` in `server/web/guest.ts`; a change belongs in
     * both or in neither.
     *
     * **The Spanish has no counterpart on that page yet**, the server still
     * rendering the guest page in English. So a Spanish-speaking guest reads
     * these on the phone and the English on a laptop — which is a gap, not a
     * drift: the fact each sentence states is the same one, and the page
     * catches up when the server learns a language.
     */
    micListening: () => 'You are listening. Nobody can hear you.',
    micAsking: () =>
      'You have asked to speak. Waiting for somebody to answer.',
    micRefused: () => 'Somebody said no to the microphone for now.',
    micOpen: () => 'Your microphone is on and the channel can hear you.',
    micMuted: () => 'Your microphone is on, and you have muted yourself.',
    unmute: () => 'Unmute',
    mute: () => 'Mute',
    stepOut: () => 'Step out',
    beingRecorded: () => 'This conversation is being recorded.',
    you: () => 'You',
    silenced: () =>
      'Somebody has the floor, so the room cannot hear you just now.',
    askToSpeak: () => 'Ask to speak',
    twoGuestsAlready: () =>
      'Two guests have the microphone already, which is as many as a room takes.',
    whoIsHere: () => 'Who is here',
    nobodyElseIsHere: () => 'Nobody else is here.',
    guest: () => 'Guest',
    askedOfYou: () => 'Asked of you',
    wouldLikeToAddYou: (from: string) =>
      `${from} would like to add you as a contact.`,
    accepting: () => 'Accepting\u2026',
    accept: () => 'Accept',
    thatDidNotWork: () => 'That did not work.',
    noThanks: () => 'No thanks',
    clipboard: () => 'Clipboard',
    nothingOnTheClipboard: () => 'Nothing on the clipboard.',
    pasteMine: () => 'Paste mine',
    clear: () => 'Clear',
    yourNameHere: () => 'Your name here',
    whatTheRoomCallsYou: () =>
      'What the room calls you while you are in it. It is this conversation only, and nothing about your account.',
    yourName: () => 'Your name',
    backToHome: () => 'Back to Home',
  },
  transcript: {
    title: () => 'Transcript',
    nameTheVoices: () => 'Name the voices',
    preparing: () => 'Preparing\u2026',
    share: () => 'Share',
    shareTranscript: () => 'Share transcript',
    whichFormat: () => 'Which format?',
    cancel: () => 'Cancel',
    text: () => 'Text',
    subtitles: () => 'Subtitles',
    data: () => 'Data',
    deleteTranscript: () => 'Delete transcript',
    deleteThisTranscript: () => 'Delete this transcript?',
    deleteCost: () =>
      'The recording is kept. Transcribing it again costs the same as the first time.',
    deleteConfirm: () => 'Delete',
    couldNotDelete: () => 'Could not delete',
    beingTranscribed: () =>
      'Being transcribed. This takes a few minutes; you can leave this screen.',
    transcribingFailedWith: (reason: string) =>
      `Transcribing failed — ${reason}`,
    transcribingFailed: () => 'Transcribing failed.',
    loading: () => 'Loading\u2026',
    couldNotSave: () => 'Could not save',
    missing: (count: number) =>
      count === 1
        ? 'One person could not be transcribed and is missing from this.'
        : `${count} people could not be transcribed and are missing from this.`,
    manyVoices: () =>
      'A letter beside a name means more than one voice was heard on that microphone. Who the others were is not known.',
    findAWord: () => 'Find a word',
    searchSeekable: () =>
      'Searching is yours alone. Tapping a line moves playback for everybody.',
    searchOnly: () =>
      'Searching is yours alone. Play this recording to jump to a line.',
    nothingMatches: () => 'Nothing matches.',
    nothingWasTranscribed: () => 'Nothing was transcribed.',
    couldNotShare: () => 'Could not share',
    voices: () => 'Voices',
    voicesExplanation: () =>
      'The service heard these voices. It labels each microphone on its own, so the letters are its guess — name them, give two the same name to make them one, or remove one that was never a person. The transcript itself is not changed and this can be redone at any time.',
    saving: () => 'Saving\u2026',
    save: () => 'Save',
    clearAll: () => 'Clear all',
    someone: () => 'Someone',
    lines: (count: number) => (count === 1 ? '1 line' : `${count} lines`),
    nameThisVoice: () => 'Name this voice',
    bringBack: () => 'Removed — bring back',
    removeFromTranscript: () => 'Remove from transcript',
    /** `at` is already formatted — see `formatDuration`. */
    jumpTo: (at: string, name: string, text: string) =>
      `Jump to ${at}, ${name}: ${text}`,
  },
  /**
   * The checklist on Home: seven rungs, each a label, an instruction and a
   * note. **Every instruction names the tab or the slot** rather than the
   * feature — these sit on Home and are done two screens away, and the whole
   * failure mode they exist to fix is somebody never finding a control.
   */
  introduction: {
    somebodyLabel: () => 'Get somebody here',
    somebodyInstruction: () =>
      'On Contacts, send an invite link — or add somebody by the address they sign in with.',
    somebodyNote: () =>
      'A link works while you are asleep, and nobody can reach you until one of you does this.',
    stepInLabel: () => 'Step in with somebody',
    stepInInstruction: () =>
      'On Channels, start one and step in, and stay there until somebody else steps in too. Anybody you invite arrives in that channel.',
    stepInNote: () =>
      'Two of you in a channel at once is the moment people can hear you, and it is what all of this is for.',
    floorLabel: () => 'Claim the floor',
    floorInstruction: () =>
      'In a channel, tap Claim in the bar along the bottom. Everybody else is muted until you release it.',
    floorNote: () =>
      'It is the thing the app is named after: one person speaking, and nobody able to talk over them.',
    nearbyLabel: () => 'Say you are nearby',
    nearbyInstruction: () =>
      'In a channel, tap Nearby. It notifies everybody who is not there that you are within reach for the next quarter of an hour.',
    nearbyNote: () =>
      'It is how a conversation starts without anybody having to arrange one: you are reachable without being in it.',
    guestLabel: () => 'Bring in a guest',
    guestInstruction: () =>
      "On a channel's Invite tab, share a guest link. Whoever opens it is in the channel in a browser, with no account and nothing to install.",
    guestNote: () =>
      'Stay in the channel while they open it — a guest link stops working the moment no member is there.',
    playerLabel: () => 'Play something together',
    playerInstruction: () =>
      "On a channel's Listen tab, add audio. Everybody in the room hears it at the same moment, and you can still talk over it.",
    playerNote: () =>
      'It is the one thing here that is not somebody talking, and the room stays a room while it plays.',
    installLabel: () => 'Put The Floor on your home screen',
    installNote: () =>
      'It gets an icon of its own and opens without a browser around it, which is how you find your way back here.',
    seeLess: () => 'See less',
    seeMore: () => 'See more',
    openChannels: () => 'Open Channels',
    openContacts: () => 'Open Contacts',
    install: () => 'Install',
    openTheChannel: () => 'Open the channel',
    openInvite: () => 'Open Invite',
    openListen: () => 'Open Listen',
    doneBrief: (label: string) => `Done: ${label}.`,
    rowLabel: (
      done: boolean,
      label: string,
      instruction: string,
      note: string
    ) => `${done ? 'Done' : 'Not done'}: ${label}. ${instruction} ${note}`,
    dismiss: (label: string) => `Dismiss ${label}`,
  },
  /** How to install, in each browser's own words — see `state/install.ts`. */
  install: {
    fromHere: () =>
      'Install it from here, or from the install icon in the address bar.',
    /**
     * Named in Safari's words rather than described: the share sheet is a
     * square with an arrow, and somebody who has not found it is looking for
     * a menu. **The two control names are Apple's and are localised by iOS**,
     * so the Spanish uses Apple's Spanish for them rather than a translation
     * of the English.
     */
    safari: () => 'Tap Share in Safari, then Add to Home Screen.',
    menu: () =>
      'Open your browser\u2019s menu and choose Install, or Add to Home Screen.',
  },
  homeSettings: {
    /**
     * *Floor Settings* rather than *Settings*: there are two settings screens
     * reached by identical gears, and a screen called only *Settings* leaves
     * which of the two you are on to be inferred from what is on it.
     */
    title: () => 'Floor Settings',
    noServerConfigured: () =>
      'No server configured, so there is no policy to show.',
    couldNotOpenPrivacy: () => 'Could not open the privacy policy',
    nothingElseSignedIn: () => 'Nothing else was signed in',
    otherDevicesSignedOut: () => 'Other devices signed out',
    signedOutBody: (sessions: number) =>
      sessions === 0
        ? 'This is the only device signed in to your account.'
        : sessions === 1
          ? 'One other device was signed out. It will need a fresh code by email.'
          : `${sessions} other devices were signed out. They will need a fresh code by email.`,
    gettingStarted: () => 'Getting started',
    showTheChecklistAgain: () => 'Show the checklist again',
    showing: () => 'Showing\u2026',
    showTheChecklistAgainAsk: () => 'Show the checklist again?',
    showTheChecklistAgainBody: () =>
      'Getting started comes back on Home with every rung to do again — stepping in, the four things to try in a channel, and anything you put away with the cross beside it.\n\nNothing else changes: you stay signed in, and your channels, contacts, recordings and settings are untouched.\n\nStep out of any channel first. Being in one with somebody ticks the first rung straight away, so the list would come back with it already done.',
    cancel: () => 'Cancel',
    showIt: () => 'Show it',
    checklistNote: () =>
      'The list above your channels on Home. It goes for good once every rung is done — the conversation, and the four things to try in a channel — or once every rung has been put away with the cross beside it, and this is the way to get it back.',
    audioOutput: () => 'Audio output',
    chooseWhereSoundComesOut: () => 'Choose where sound comes out',
    chooseWhereSoundComesOutSub: () => 'Headphones, AirPlay, or anything paired',
    labs: () => 'Labs',
    showExperimental: () => 'Show experimental features',
    on: () => 'On',
    off: () => 'Off',
    labsWhat: () =>
      'Off, which is where everybody starts. On, one unfinished thing appears: transcripts of your recordings. It can change or go away.',
    labsWhose: () =>
      'It follows your account rather than this phone, and it is only about you — turning it on shows these to you, not to anybody else in your channels.',
    diagnostics: () => 'Diagnostics',
    forgetThisPhone: () => 'Forget this phone',
    forgetting: () => 'Forgetting\u2026',
    forgetThisPhoneAsk: () => 'Forget this phone?',
    forgetThisPhoneBody: () =>
      'This device forgets everything it has stored — the session, your appearance and tap settings, and that it has been asked about notifications. Your account, channels and recordings are untouched.\n\nDelete the app afterwards and install it again for a genuinely new install: the notification permission is the system\u2019s and only deleting the app clears it.',
    forget: () => 'Forget',
    forgetNote: () =>
      'For seeing what somebody arriving new sees. Signing out does not do this, and neither does deleting the app.',
    showEveryDab: () => 'Show every dab',
    stopShowingEveryDab: () => 'Stop showing every dab',
    dabsNote: () =>
      'Puts a mark on both Home tabs that can wear one, and on the Help card behind Support, whether or not anything is waiting, so the mark itself can be looked at. It changes nothing else, and it is off again the next time the app starts.',
    appearance: () => 'Appearance',
    light: () => 'Light',
    dark: () => 'Dark',
    system: () => 'System',
    appearanceNote: () =>
      'System follows the phone, and changes with it — including on a schedule, if you have one set.',
    email: () => 'Email',
    occasionalEmail: () => 'Occasional email about The Floor',
    emailNote: () =>
      'Off, which is where everybody starts unless they said otherwise when they signed up. On, we may write to you about how to use The Floor and what has changed in it.',
    codesArriveEitherWay: () =>
      'Your sign-in codes arrive either way: those are how you get in, not something we send you.',
    privacy: () => 'Privacy',
    privacyPolicy: () => 'Privacy policy',
    privacyNote: () =>
      'What is stored, why, and for how long. It opens in your browser.',
    account: () => 'Account',
    signOut: () => 'Sign out',
    signOutAsk: () => 'Sign out?',
    signOutBody: () =>
      'You will need a fresh code by email to sign back in. Your channels and recordings are kept.',
    signOutNote: () =>
      'Only this device. Anywhere else you are signed in stays signed in.',
    signingOut: () => 'Signing out\u2026',
    signOutOtherDevices: () => 'Sign out other devices',
    signOutOtherDevicesAsk: () => 'Sign out other devices?',
    signOutOtherDevicesBody: () =>
      'Every other phone, tablet or computer signed in to your account is signed out. This device stays signed in. Your channels and recordings are kept.',
    signOutOthers: () => 'Sign out others',
    signOutOthersNote: () =>
      'For a phone you have lost. It is the only way to end a session from a device you no longer have.',
    deleting: () => 'Deleting\u2026',
    deleteAccount: () => 'Delete account',
    deleteAccountAsk: () => 'Delete your account?',
    /**
     * The work is in what this says. *This cannot be undone* is true of
     * everything destructive and tells nobody anything; what is not obvious is
     * that channels are not yours to take with you.
     */
    deleteAccountBody: () =>
      'Your address, your name, what you wrote about yourself and your contacts are removed immediately.\n\nChannels you share with other people carry on without you, and so do the recordings made in them — they belong to the channel. Channels you are the only member of are deleted with everything in them.\n\nThis cannot be undone.',
    deleteConfirm: () => 'Delete',
  },
  channelSettings: {
    title: () => 'Channel Settings',
    leaveAsk: () => 'Leave this channel?',
    /** `recordings` is already a phrase — see `countOf`. */
    leaveBody: (recordings: string | null, one: boolean) =>
      `It disappears from your home screen and you will need a fresh invitation to come back. Everyone else keeps it${
        recordings === null
          ? '.'
          : `, and ${recordings} with it — you will not be able to reach ${
              one ? 'it' : 'them'
            } again.`
      }`,
    cancel: () => 'Cancel',
    leave: () => 'Leave',
    deleteAsk: () => 'Delete this channel?',
    deleteBody: (recordings: string | null) =>
      recordings === null
        ? 'You are its last member, so this is the end of it. It cannot be undone.'
        : `You are its last member, so this deletes the channel and ${recordings} made in it. Share anything you want to keep first — this cannot be undone.`,
    continueLabel: () => 'Continue',
    deleteForGood: (recordings: string | null) =>
      recordings === null ? 'Delete for good?' : `Delete ${recordings} for good?`,
    deleteForGoodBody: (days: number) =>
      `Everything goes, permanently, after ${days} days. There is no undo in the app.`,
    deleteConfirm: () => 'Delete',
    channelName: () => 'Channel name',
    renameStepIn: () =>
      'Step in to rename this channel. Somebody is in there, and the name is what they are calling the place they are in.',
    renamePublic: () =>
      'Everyone in the channel sees this name, and anyone in the room can change it. It cannot be emptied while this channel has a public page — the page is found by its name, and an unnamed channel is listed by who is in it.',
    renamePrivate: () =>
      'Everyone in the channel sees this name, and anyone in the room can change it. Leave it empty to go back to listing who is here.',
    recording: () => 'Recording',
    recordAutomatically: () => 'Record automatically',
    on: () => 'On',
    off: () => 'Off',
    autoRecordNote: () =>
      'Off, which is where every channel starts: a recording begins when somebody presses Record. On, one begins by itself as soon as there are two of you in the room, and everyone sees it running.',
    autoRecordHow: () =>
      'Pause and Stop work the same either way, and stopping is final — nothing starts a second recording until everybody has left the channel and come back.',
    autoRecordStepIn: () =>
      'Step in to change this. What is kept from a conversation is for whoever is in it.',
    notifications: () => 'Notifications',
    publicPage: () => 'Public page',
    guestLinks: () => 'Guest links',
    deleting: () => 'Deleting',
    leaving: () => 'Leaving',
    deleteChannel: () => 'Delete channel',
    leaveChannel: () => 'Leave channel',
    lastMemberNoRecordings: () =>
      'You are its last member — this destroys it for good',
    lastMemberWithRecordings: (recordings: string) =>
      `This destroys it and ${recordings}, for good`,
    removesFromHome: () => 'Removes it from your home screen',
    removesFromHomeWith: (recordings: string) =>
      `Removes it from your home screen, ${recordings} included`,
    steppingOutInstead: () =>
      'Stepping out is on the channel screen and is probably what you want: it keeps your place here.',
    couldNotChange: () => 'Could not change that just now.',
    thatDidNotWork: () => 'That did not work.',
    hasAPublicPage: () => 'This channel has a public page',
    publishAsk: () => 'Give this channel a public page?',
    publishBody: () =>
      'The page shows the channel\u2019s name and description to anyone, and the channel is listed publicly where it can be found by people you have never met. Members are not named.\n\nNo recording appears on it until everybody who was in that recording has agreed to publish it, one at a time, from its card on the channel screen.',
    notNow: () => 'Not now',
    createThePage: () => 'Create the page',
    unpublishAsk: () => 'Take this page down?',
    unpublishBody: () =>
      'The page and the feed stop answering at once, and the channel leaves the public list. Anybody who subscribed in a podcast app stops receiving it, and copies already downloaded are not reached.\n\nNobody\u2019s agreement is taken back, so turning it on again puts the same recordings at the same address.',
    keepThePage: () => 'Keep the page',
    takeItDown: () => 'Take it down',
    saving: () => 'Saving\u2026',
    pageNote: () =>
      'Nothing is on the page until everybody in a recording agrees to publish it. Each recording is asked about separately, on its own card. The channel itself is listed publicly as soon as this is on.',
    directoryNeedsThese: () =>
      'To be listed in a podcast directory, a feed also needs these.',
    publicOffNote: () =>
      'Off, which is how every channel starts. There is no page and no feed, and nothing here is reachable by anybody outside it.',
    nameItFirst: () =>
      'Name this channel first, at the top of this screen. A public page is found by its name, and this channel has none — it is listed by who is in it, and a public page never names a member.',
    coverSetAt: (width: number, height: number) =>
      `Cover set — ${width}×${height}.`,
    coverSet: () => 'Cover set.',
    uploading: () => 'Uploading\u2026',
    replaceCoverArt: () => 'Replace cover art',
    addCoverArt: () => 'Add cover art',
    coverRulesShort: () => 'Square, 1400–3000 pixels, no transparency',
    coverRules: () => 'Square JPEG or PNG, 1400–3000 pixels, no transparency',
    /**
     * The language tag itself is not translated — it is a BCP 47 tag going
     * into an RSS feed, and `en` is `en` in every language. The sentence
     * around it is.
     */
    languagePlaceholder: () => 'en',
    languageNote: () =>
      'The language these conversations are in, as a tag like \u201cen\u201d or \u201cpt-BR\u201d. Left empty, the feed says English.',
    explicit: () => 'These conversations are explicit',
    done: () => 'Done',
    /**
     * **The categories themselves are Apple's and stay in English.** They are
     * `ITUNES_CATEGORIES` in `core/publication.ts`, they go into the feed
     * verbatim, and a directory matches them as written — a translated
     * *True Crime* is a feed Apple will not file.
     */
    category: () => 'Category',
    categoryUnset: () => 'Not set — a directory needs one',
    couldNotReadLinks: () => 'Could not read the links.',
    reading: () => 'Reading\u2026',
    noGuestLinksYet: () =>
      'No guest links yet. The channel screen makes one and hands it to the share sheet.',
    linkOpen: () => 'Open — anybody with it can knock',
    linkClosedWhenEmptied: () => 'Closed when the channel emptied',
    linkRevoked: () => 'Revoked',
    revoke: () => 'Revoke',
    revokeNote: () =>
      'Revoking stops new people knocking. Anybody already in the channel stays until they leave or somebody removes them.',
    revokeStepIn: () =>
      'Step in to revoke a link. Shutting a door onto a conversation is for whoever is in it.',
    countOf: (n: number) => (n === 1 ? 'its one recording' : `its ${n} recordings`),
  },
  profile: {
    telegramProblem: () =>
      'A Telegram username, five characters or more — letters, digits and underscores.',
    phoneProblem: () =>
      'A phone number with its country code, like +1 555 123 4567.',
    you: () => 'You',
    contact: () => 'Contact',
    contactRequested: () => 'Contact requested',
    channelMember: () => 'Channel member',
    removeAsk: (name: string) => `Remove ${name}?`,
    removeBody: () =>
      "You will each stop being the other's contact, and you will leave the channels that hold only the two of you. Channels with other people in them are not affected.",
    cancel: () => 'Cancel',
    remove: () => 'Remove',
    /** `service` is a brand name — see `IM_SERVICE_NAMES`, which is not translated. */
    couldNotOpen: (service: string) => `Could not open ${service}`,
    saving: () => 'Saving\u2026',
    done: () => 'Done',
    edit: () => 'Edit',
    name: () => 'Name',
    namePlaceholder: () => 'What people should call you',
    nameCannotBeEmpty: () =>
      'A name cannot be empty — it is how everyone else finds you, so this one is kept until you type another.',
    username: () => 'Username',
    usernameOptional: () => 'optional',
    usernameHint: (min: number, max: number) =>
      `Yours alone, and shown on your profile — ${min} to ${max} characters. It does nothing else yet; leave it empty to have none.`,
    /** How many people are here because of them, all the way down. */
    invitedCount: (count: number) => `Invited ${count}`,
    invitedBy: (name: string) => `Invited by ${name}`,
    muteThem: () => 'Mute them',
    theyAreMuted: () =>
      'Muted. Opening it again is theirs to do, from their own footer — nobody else can.',
    /** `wait` is already a phrase — see `relativeTime.duration`. */
    justUnmuted: (wait: string) =>
      `They have just unmuted themselves. You can mute them again in ${wait}.`,
    theyHaveTheFloor: () =>
      'They have the floor, so their microphone stays open until they release it.',
    mutingIsSilent: () =>
      'Closing it does not tell them why — say so out loud as well. They can open it again whenever they like.',
    ping: () => 'Ping',
    sent: () => 'Sent.',
    pinged: () => 'Pinged.',
    pingAgainIn: (wait: string) => ` You can ping them again in ${wait}.`,
    notPingedAgain: () => ' They will not be pinged again for a few minutes.',
    said: (who: string) => `${who} said:`,
    pingPlaceholder: () => 'Anything you want to say (optional)',
    charactersLeft: (left: number) => `${left} left`,
    theyWillGetANotification: () => 'They will get a notification.',
    sending: () => 'Sending\u2026',
    sendPing: () => 'Send ping',
    channelsWithThem: () => 'Channels with them',
    present: (count: number) => `${count} present`,
    hereLabel: (title: string, line: string, muted: boolean) =>
      `${title}. ${line}. You are here${
        muted ? ', your microphone is muted' : ''
      }. Tap to go back.`,
    stepInLabel: (title: string, line: string) => `${title}. ${line}. Step in.`,
    email: () => 'Email',
    copied: () => '\u2713 copied',
    copyFailed: () => '\u2717 copy failed',
    copy: () => 'Copy',
    howYouSignIn: () =>
      'How you sign in. Nobody else sees it unless you show it to them, which is done one contact at a time, from their profile.',
    differentAddress: () => 'A different address',
    codeOnItsWay: (address: string) =>
      `A code is on its way to ${address}. It signs you in there, which is what makes it yours.`,
    sixDigits: () => 'Six digits',
    changing: () => 'Changing\u2026',
    changeMyAddress: () => 'Change my address',
    sendACode: () => 'Send a code',
    notShowingTheirEmail: () => 'They are not showing you their email.',
    theyCanSeeYourEmail: () => 'They can see your email.',
    hiding: () => 'Hiding\u2026',
    stopShowingMyEmail: () => 'Stop showing my email',
    stoppingIsNotRecall: () =>
      'They will not be able to see it again — though they may already have it written down somewhere.',
    showing: () => 'Showing\u2026',
    showMyEmail: () => 'Show my email',
    showMyEmailNote: () => 'Show my email to this contact.',
    messaging: () => 'Messaging',
    open: () => 'Open',
    contactsSeeThese: () => 'Your contacts see these on your profile.',
    noProfileHere: () => 'There is no profile here to show you.',
    messagingFieldsNote: () =>
      'Shown to your contacts, who can tap one to open the conversation there. Leave a field empty to take it off your profile.',
    alreadyAContact: () => 'Already one of your contacts.',
    removing: () => 'Removing\u2026',
    removeContact: () => 'Remove contact',
    requestSent: () => 'Request sent — waiting for them to accept.',
    accepting: () => 'Accepting\u2026',
    acceptTheirRequest: () => 'Accept their request',
    theyAskedYouFirst: () => 'They asked you first.',
    asking: () => 'Asking\u2026',
    addContact: () => 'Add contact',
    theyWillDecide: () =>
      'They will see a request on their home screen and decide.',
  },
  channel: {
    uploading: () => 'Uploading\u2026',
    uploadingPercent: (percent: number) => `Uploading\u2026 ${percent}%`,
    channelGone: () => 'Channel gone',
    channelGoneBody: () =>
      'This channel is no longer there. It may have ended a while ago, or you may no longer be part of it.',
    loadingChannel: () => 'Loading channel\u2026',
    reconnecting: () => 'Reconnecting\u2026',
    backToHome: () => 'Back to home',
    /** Whoever the roster has no name for — see `nameOf`. */
    someone: () => 'Someone',
    channelEnded: () => 'Channel ended',
    channelEndedBody: () =>
      'Everyone left this channel, so it no longer exists. Start a new one to talk again.',
    nothingOnClipboard: () => 'There is nothing on your clipboard to paste.',
    notAYouTubeLink: () =>
      'That is not a YouTube link. Copy one from YouTube, then press this again.',
    aFilmNobodyNamed: () => 'A film nobody named',
    tabPeople: () => 'People',
    tabNotepad: () => 'Notepad',
    tabInvite: () => 'Invite',
    tabListen: () => 'Listen',
    tabRecordings: () => 'Recordings',
    tabWatch: () => 'Watch',
    aBrowser: () => 'A browser',
    anotherPhone: () => 'Another phone',
    copied: () => '\u2713 copied',
    copyFailed: () => '\u2717 copy failed',
    copy: () => 'Copy',
    clipTooLong: (max: number) =>
      `That is too long to share. The channel clipboard holds ${max} characters.`,
    couldNotShare: () => 'Could not share',
    recordingPaused: () => 'Recording paused',
    recording: () => 'Recording',
    paused: () => 'Paused',
    settings: () => 'Settings',
    home: () => 'Home',
    /**
     * The three rungs. **Short forms, deliberately** — the long forms are
     * acts, and these name states at 11pt in a fifth of a phone.
     */
    rungIn: () => 'In',
    rungInHintPresent: () => 'You are in this channel',
    rungInHint: () => 'Step in to the conversation',
    rungNearby: () => 'Nearby',
    rungNearbyHintOn: () => 'You are nearby. Tap to restart the wait',
    rungNearbyHint: () => 'Be reachable without joining the conversation',
    rungOut: () => 'Out',
    rungOutHintPresent: () => 'Leave the conversation',
    rungOutHintNearby: () => 'Stop being reachable here',
    rungOutHint: () => 'You are not in this channel',
    unmute: () => 'Unmute',
    mute: () => 'Mute',
    noMicrophone: () => 'This device has no microphone',
    microphoneMuted: () => 'Your microphone is muted',
    microphoneOpen: () => 'Your microphone is open',
    release: () => 'Release',
    claim: () => 'Claim',
    youHaveTheFloor: () => 'You have the floor',
    claimTheFloor: () => 'Claim the floor',
    fullScreen: () => 'Full screen',
    watchOnAnotherDevice: () => 'Watch on another device',
    handBackSublabel: () => 'Moves the film back to the device you stepped in on',
    filmIsOnThisDevice: () =>
      'The film is on this device. Everything else about the channel — who is here, the floor, your microphone — is on the device you stepped in on.',
    gotIt: () => 'Got it',
    cohortTitle: () => 'Your getting-started channel',
    cohortWhy: () =>
      'The Floor is for talking with people you already know, and it is no use at all on the first day, when nobody you know is here yet. So you have been introduced to a few people who joined around the same time as you, and to somebody who runs The Floor.',
    cohortWho: () =>
      'Nobody here is one of your contacts, and nobody can see your email address. Step in and say something, or leave whenever you like — Channel Settings, at the top, has Leave this channel.',
    publicNoticeTitle: () => 'This channel has a public page',
    publicNoticeWhat: () =>
      'Somebody in this channel has given it a page on the web, showing its name and its notepad to anybody, and it is listed publicly where it can be found by people you have never met. No member is named on it, ever.',
    publicNoticeRecordings: () =>
      'No recording of yours goes on it unless you agree to that recording yourself, on its own card under Recordings, and everybody else in it agrees too. Any one of you can take that back afterwards.',
    elsewhereTaken: () =>
      'You are in this channel on another device. Stepping in here brings the conversation to this one and closes the microphone there.',
    elsewhere: () =>
      'You are in this channel, but not on this device. Stepping in here brings the conversation to this one.',
    /** `who` is already a phrase — see `describeChannel`. */
    justSteppedIn: (who: string) => `${who} just stepped in.`,
    atTheDoor: () => 'At the door',
    knockLead: (name: string) => name,
    knockRest: () => ' is at the door with a link to this channel.',
    knockWhatTheyGet: () =>
      'They will be able to listen, and to speak only if somebody turns their microphone on. They cannot record, and they cannot reach anything else of yours.',
    letThemIn: () => 'Let them in',
    no: () => 'No',
    guests: () => 'Guests',
    invitations: () => 'Invitations',
    takeBack: () => 'Take back',
    youAskedThemIn: () => 'You asked them in as a guest. They have not been in yet.',
    theyAskedThemIn: (who: string) =>
      `${who} asked them in as a guest. They have not been in yet.`,
    reconnectingIsLeaving: () =>
      'Reconnecting — a dropped connection counts as leaving.',
    open: () => 'Open',
    clear: () => 'Clear',
    nothingOnTheChannelClipboard: () => 'Nothing on the channel clipboard.',
    replaceWithMyClipboard: () => 'Replace with my clipboard',
    pasteMyClipboard: () => 'Paste my clipboard',
    oneClipboard: () =>
      'One clipboard for the channel — pasting replaces what is on it, and anyone here can copy it.',
    stepInToPaste: () => 'Step in to put something on the channel clipboard.',
    notepadPlaceholder: () => 'Links, a reading list, what this is for…',
    done: () => 'Done',
    notepadEmptyWritable: () => 'Nothing on the notepad. Write on it.',
    notepadEmpty: () => 'Nothing on the notepad. Step in to write on it.',
    edit: () => 'Edit',
    stepInToWrite: () =>
      'Step in to write on this. It is what the channel is for, and that is for whoever is in it to say.',
    back15: () => '\u221215s',
    pause: () => 'Pause',
    play: () => 'Play',
    forward15: () => '+15s',
    quieter: () => 'Quieter',
    louder: () => 'Louder',
    change: () => 'Change',
    preparing: () => 'Preparing\u2026',
    share: () => 'Share',
    remove: () => 'Remove',
    playSomethingTogether: () => 'Play something together',
    anAudioFile: () => 'An audio file from this phone',
    cancelUpload: () => 'Cancel upload',
    filmIsPlaying: () => 'The film is playing. Pause it to put something on here.',
    theyDecideWhatPlays: (holder: string) =>
      `${holder} has the floor, so they decide what plays.`,
    youDecideWhatPlays: () => 'You have the floor — only you can change what plays.',
    stepInToPlay: () =>
      'Step in to put something on. What everybody is listening to is for whoever is listening.',
    everyoneHearsThis: () => 'Everyone hears this, and anyone present can change it.',
    everyoneHearsAndItIsKept: () =>
      'Whatever you play, everyone hears — and it is kept in the recording.',
    resumeRecording: () => 'Resume recording',
    record: () => 'Record',
    resume: () => 'Resume',
    pauseRecording: () => 'Pause recording',
    stopRecording: () => 'Stop recording',
    stop: () => 'Stop',
    floorDecidesWhatPlays: () => 'the floor decides what plays',
    stepInToPlayShort: () => 'step in to play',
    unmuteTheRoom: () => 'Unmute the room',
    muteTheRoom: () => 'Mute the room',
    unmuteTheRoomSub: () => 'Everyone can speak again; your own mute is unchanged',
    muteTheRoomSub: () => 'Quiet while the video plays; pause to talk',
    watchThisInstead: () => 'Watch this instead',
    watchThisInsteadSub: () => 'Plays the YouTube link on your clipboard',
    cancel: () => 'Cancel',
    orPutOneOfTheseBackOn: () => 'Or put one of these back on.',
    changeVideo: () => 'Change video',
    filmIsOnAnotherDevice: () => 'The film is on another device.',
    watchOnThisDevice: () => 'Watch on this device',
    stepInToWatch: () =>
      'Step in to watch — a film does not play for somebody who is nearby or stepped out.',
    alreadyShowingSomething: () => 'Already showing something',
    noOtherDeviceLead: () => 'No other device is signed in.',
    noOtherDeviceRest: () =>
      ' Open The Floor on a laptop or tablet and sign in there, and it will show up here as somewhere to watch.',
    copyVideoLink: () => 'Copy video link',
    watchSomethingTogether: () => 'Watch something together',
    watchSomethingTogetherSub: () => 'A YouTube link on your clipboard',
    hideWhatWeHaveWatched: () => 'Hide what we have watched',
    watchedBefore: (count: number) => `Watched before (${count})`,
    watchedBeforeSub: () => 'Puts one of them back on, without a link',
    roomIsMutedLead: () => 'The room is muted.',
    roomIsMutedRest: () =>
      ' No microphone is open, so nothing leaks in from anybody\u2019s screen. Pause the video to talk.',
    roomStaysMuted: () =>
      ' Somebody is watching on the device they are in the room on, so it stays muted until the video is paused.',
    pausedSoYouCanTalkLead: () => 'Paused, so you can talk.',
    pausedSoYouCanTalkRest: () =>
      ' The room goes quiet again when the video resumes.',
    roomIsUnmutedLead: () => 'The room is unmuted.',
    roomIsUnmutedRest: () =>
      ' Everybody can be heard, including whatever their own screen is playing.',
    somethingOnListen: () =>
      'Something is playing on Listen. Pause it to watch together.',
    stepInToDriveTheFilm: () =>
      'Step in to drive the film. What everybody is watching is for whoever is here.',
    stepInToStartAParty: () =>
      'Step in to start a watch party. What everybody is watching is for whoever is here.',
    stopTheRecordingFirst: () =>
      'Stop the recording first — a watch party is not recorded.',
    notAvailableJustNow: () => 'Putting something on is not available just now.',
    everyoneWatchesInStep: () =>
      'Everyone watches on their own screen, in step. Nothing about it is recorded.',
    everybodyWatchesInTheApp: () =>
      'Everybody watches in the app, in step — here, or on another device you are signed in on. Recording is off while a party is on.',
    contacts: () => 'Contacts',
    thatDidNotWork: () => 'That did not work.',
    guestLink: () => 'Guest link',
    guestLinkWhat: () =>
      'A link anybody can open in a browser. They knock, and whoever is in the channel decides. Manage the links this channel has in Settings.',
    makingALink: () => 'Making a link\u2026',
    shareAGuestLink: () => 'Share a guest link',
    copyAGuestLink: () => 'Copy a guest link',
    linkCopied: () => 'Link copied. Paste it wherever you like.',
    linkWouldNotCopy: () => 'The link would not copy. Try again.',
    stepInToMakeALink: () =>
      'Step in to make a link. Who can get into a conversation is for the people having it.',
  },
  recordings: {
    rowLabel: (name: string, length: string, open: boolean) =>
      `${name}, ${length}. ${open ? 'Hide actions' : 'Show actions'}.`,
    rename: () => 'Rename',
    stillBeingPrepared: () =>
      'Still being prepared — playing and sharing will be available in a moment.',
    playUnavailable: (reason: string) => `Play is unavailable — ${reason}.`,
    stepInToRenameOrDelete: () =>
      "Step in to rename or delete. The name is everybody's, and deleting takes it out of their lists too.",
    couldNotRename: () => 'Could not rename',
    namePlaceholder: () => 'What was this conversation?',
    everyoneSeesTheName: () => 'Everyone in this channel sees the new name.',
    renaming: () => 'Renaming\u2026',
    save: () => 'Save',
    cancel: () => 'Cancel',
    couldNotDelete: () => 'Could not delete',
    deleting: () => 'Deleting\u2026',
    delete: () => 'Delete',
    deleteAsk: (name: string) => `Delete ${name}?`,
    deleteBody: () =>
      'Everyone in this channel loses it. The audio is removed a week from now, and nothing in the app can bring it back.',
    keep: () => 'Keep',
    publishedPreparing: () => 'Published — the audio is still being prepared.',
    published: () => 'Published. Anybody with the address can listen.',
    everybodyAgreed: () => 'Everybody has agreed — this is going up now.',
    waitingOn: (names: string) =>
      `Waiting on ${names}. It goes up when everybody has agreed.`,
    notYourVoice: (status: string) =>
      `None of your voice is in this one, so it does not need your agreement. ${status}`,
    couldNotChangeThat: () => 'Could not change that',
    saving: () => 'Saving\u2026',
    iAgreeThisCanBePublished: () => 'I agree this can be published',
    publishAsk: () => 'Publish this conversation?',
    publishBody: () =>
      'It goes on this channel\u2019s public page, where anyone with the address can listen — and into its feed, where podcast apps can subscribe. It goes up once everybody in it has agreed.\n\nYou can take your agreement back at any time, and that removes it from the page and the feed. It cannot reach a copy somebody has already downloaded.',
    notNow: () => 'Not now',
    iAgree: () => 'I agree',
    loading: () => 'Loading\u2026',
    play: () => 'Play',
    couldNotPlay: () => 'Could not play',
    searchWhatWasSaid: () => 'Search what was said',
    searching: () => 'Searching\u2026',
    nothingMatches: () => 'Nothing matches.',
    aRecording: () => 'A recording',
    someone: () => 'Someone',
    transcribingNow: () => 'Transcribing\u2026',
    transcriptFailed: () => 'Transcript failed',
    transcript: () => 'Transcript',
    transcribe: () => 'Transcribe',
    starting: () => 'Starting\u2026',
    spendFreeAsk: () => 'Use your one free transcript?',
    transcribeAsk: () => 'Transcribe this recording?',
    /** `provider` is a service's own name and is not translated. */
    transcribeBody: (provider: string, spends: boolean) =>
      `The audio is sent to ${provider} to be turned into text, and everybody in the channel will see the result. It costs a little, and it can only be done once per recording.` +
      (spends
        ? '\n\nThis is the one free transcript your account gets. Once it is used no other recording can be transcribed, and deleting this transcript does not give it back.'
        : ''),
    useIt: () => 'Use it',
    couldNotTranscribe: () => 'Could not transcribe',
    preparing: () => 'Preparing\u2026',
    share: () => 'Share',
    couldNotShare: () => 'Could not share',
  },
  links: {
    couldNotOpenLink: () => 'Could not open link',
  },
  podcastsWeb: {
    frameTitle: () => 'Published conversations',
  },
};

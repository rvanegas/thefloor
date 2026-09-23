import type { Strings } from './index';

/**
 * What the app says, in Spanish.
 *
 * **Typed as `Strings`, so this file cannot fall behind `en.ts`.** A message
 * added there and not here is a typecheck failure; there is no runtime
 * fallback that would let it ship as English inside a Spanish build.
 *
 * Two rules the whole file is written under, both settled in
 * `planning/GLOSSARY.md` rather than here:
 *
 * **Nothing agrees with a person's gender.** The app does not know anybody's,
 * and Spanish adjectives about people do. So the copy is built from
 * constructions that take none — *Sin entrar* rather than *Invitado*, a noun
 * rather than a participle — and falls back to the masculine generic only
 * where nothing else reads naturally.
 *
 * **The vocabulary was settled against the glossary before any of this was
 * written**, term by term, not string by string. The one collision that
 * needed a new answer is *invitado*, which is both *guest* and *invited*:
 * *Invitado* is the guest, *Invitaciones* the pending seats
 * (`decisions/2026-09-22-the-members-tab-is-the-people-tab.md`), and a member
 * who has never come in is *Sin entrar*, which names the absence instead and
 * so collides with neither.
 */
export const es: Strings = {
  updateRequired: {
    title: () => 'Toca actualizar',
    tooOld: () =>
      'Esta versión de The Floor es demasiado antigua para el servidor con el que habla, así que se ha detenido en lugar de mostrarte algo que no puede prometer que sea cierto.',
    everythingKept: () =>
      'Actualiza desde el App Store y todo — tus canales, tus contactos, tus grabaciones — seguirá donde lo dejaste.',
    openAppStore: () => 'Abrir el App Store',
  },
  shared: {
    close: () => 'Cerrar',
    labelWithBadge: (label: string, badge: string) => `${label}, ${badge}`,
  },
  offline: {
    partlyConnected: () => 'Conexión parcial',
    notConnected: () => 'Sin conexión',
    roomStillAudible: () =>
      'Todavía puedes oír la sala, y si tenías la palabra todavía se te puede oír — la conversación viaja por su propia conexión. Todo lo que la gestiona está caído: el micrófono, la palabra y las demás pantallas.',
    cannotReach: () =>
      'The Floor no llega al servidor, así que aquí no se puede cambiar nada y nada de lo que se muestre estaría al día.',
    queueDropped: () =>
      'Lo que hiciste en los últimos segundos no llegó a enviarse. No está esperando en cola, así que vuelve a hacerlo cuando esto se resuelva.',
    whoWasInTheRoom: () => 'Quién estaba en la sala',
    asOfLastUpdate: () =>
      'Según la última actualización que llegó. Aquí no se añade ni se quita a nadie hasta que vuelva la conexión.',
    tryingAgain: () => 'Reintentando…',
  },
  support: {
    title: () => 'Apoyo',
    whatItCosts: () =>
      'The Floor funciona en un servidor que cuesta dinero cada mes: la máquina en la que vive, el audio que lleva una conversación y el almacenamiento donde están tus grabaciones.',
    unlocksNothing: () =>
      'Contribuir es totalmente opcional y no desbloquea nada. Todo en la app funciona igual lo hagas o no, y a nadie se le dice quién ha contribuido y quién no.',
    thankYou: (giving: string) => `Has dado ${giving}. Gracias, de verdad.`,
    chipIn: () => 'Contribuir',
    useThisAddress: (identifier: string) =>
      `Se abre en tu navegador. Usa ${identifier} allí y aparecerá aquí; paga con cualquier otra cosa y llega sin nombre.`,
    noWayToGive: () => 'Ahora mismo no hay forma de contribuir desde aquí.',
  },
  naming: {
    justYou: () => 'Solo t\u00fa',
    pair: (first: string, second: string) => `${first} y ${second}`,
    andOthers: (shown: string, rest: number) =>
      `${shown} y ${rest} persona${rest === 1 ? '' : 's'} m\u00e1s`,
  },
  notificationLevel: {
    low: () => ({
      label: 'En silencio',
      detail: 'Nada suena ni enciende la pantalla, ni siquiera un toque.',
    }),
    medium: () => ({
      label: 'Solo toques',
      detail: 'Un toque suena. Nada m\u00e1s.',
    }),
    high: () => ({
      label: 'Todo',
      detail: 'Las llegadas y las invitaciones suenan, igual que los toques.',
    }),
  },
  usernameFault: {
    tooLong: (max: number) =>
      `Un nombre de usuario puede tener ${max} caracteres como m\u00e1ximo.`,
    tooShort: (min: number) =>
      `Un nombre de usuario necesita al menos ${min} caracteres.`,
    charset: () =>
      'Solo letras, d\u00edgitos y guiones bajos: ni espacios, ni puntos, ni guiones.',
  },
  leaderboard: {
    title: () => 'Invitaciones',
    whatTheNumberMeans: () =>
      'Todas las personas que se registraron con la invitaci\u00f3n de esa persona, m\u00e1s todas las que ellas invitaron despu\u00e9s, hasta el final.',
    nobodyYet: () => 'Todav\u00eda nadie ha tra\u00eddo a nadie aqu\u00ed.',
  },
  podcasts: {
    noServer: () => 'No hay ning\u00fan servidor configurado, as\u00ed que no hay nada que listar.',
  },
  notifications: {
    title: () => 'Estar localizable',
    cohortOffer: () =>
      'Llegaste sin nadie aqu\u00ed. Activa esto y te pondremos en un canal con algunas personas que se unieron por las mismas fechas, y alguien de nuestro equipo, para que haya con quien hablar.',
    cohortOnce: () =>
      'Es un solo canal, ocurre una vez y puedes salir cuando quieras. Nadie de ah\u00ed pasa a ser un contacto.',
    peopleNotMessages: () =>
      'The Floor es gente hablando, no mensajes esperando. Alguien entra en un canal, o te da un toque desde uno, y todo ocurre mientras est\u00e1 ah\u00ed.',
    otherwiseUnreachable: () =>
      'Sin notificaciones solo se puede llegar a este tel\u00e9fono mientras lo est\u00e9s mirando. Para los dem\u00e1s eres alguien que nunca contesta.',
    whatWeWillSend: () => 'Qu\u00e9 vamos a enviar',
    onlyAPerson: () =>
      'Solo a una persona. Alguien te invit\u00f3, alguien te dio un toque o alguien entr\u00f3 en un canal al que perteneces. No hay m\u00e1s tipos que esos tres.',
    nothingOnOurBehalf: () =>
      'Nada para hacerte volver, nada sobre lo que te has perdido y nada que la app decida enviar por su cuenta. No hay ninguna versi\u00f3n de esto que sea buena para nosotros y mala para ti.',
    howLoudPerChannel: () => 'Cu\u00e1nto suena, por canal',
    setPerChannel: () =>
      'Cada canal se ajusta por separado, en sus ajustes, cuando quieras. Los nuevos empiezan en Solo toques.',
    asking: () => 'Preguntando\u2026',
    turnOn: () => 'Activar las notificaciones',
    alreadyAnswered: () =>
      'Ya respondiste una vez, y iOS solo pregunta una vez. Activarlo ahora se hace en Ajustes, en Notificaciones.',
    openSettings: () => 'Abrir Ajustes',
    notNow: () => 'Ahora no',
  },
  help: {
    title: () => 'Ayuda',
    whatThisIs: () =>
      'Pregunta lo que quieras sobre The Floor: c\u00f3mo funciona algo, o qu\u00e9 ha fallado. Una persona lo lee y responde, y la respuesta aparece aqu\u00ed debajo de tu pregunta.',
    placeholder: () => '\u00bfQu\u00e9 te gustar\u00eda saber?',
    sending: () => 'Enviando\u2026',
    ask: () => 'Preguntar',
    yourQuestions: () => 'Tus preguntas',
    answer: () => 'Respuesta',
    askedNotAnswered: (since: string) =>
      `Preguntado hace ${since} \u00b7 sin responder todav\u00eda`,
  },
  auth: {
    brand: () => 'The Floor',
    tagline: () =>
      'Canales de audio donde cualquiera de las dos partes puede pedir tiempo sin interrupciones.',
    notConfigured: () => 'Sin configurar',
    enterEmail: () => 'Escribe tu direcci\u00f3n de correo.',
    enterCode: () => 'Escribe el c\u00f3digo que te lleg\u00f3 por correo.',
    emailPlaceholder: () => 'Direcci\u00f3n de correo',
    sending: () => 'Enviando\u2026',
    sendCode: () => 'Enviar c\u00f3digo',
    emailedCodeTo: (address: string) =>
      `Enviamos un c\u00f3digo de seis d\u00edgitos a ${address}`,
    codePlaceholder: () => 'C\u00f3digo de seis d\u00edgitos',
    displayNamePlaceholder: () =>
      'Nombre visible (en blanco se mantiene el actual)',
    marketingConsent: () =>
      'Escr\u00edbeme de vez en cuando sobre The Floor: c\u00f3mo usarlo y qu\u00e9 hay de nuevo.',
    checking: () => 'Comprobando\u2026',
    signIn: () => 'Entrar',
    useDifferentAddress: () => 'Usar otra direcci\u00f3n',
    serverHint: (url: string) => `Servidor: ${url}`,
    embeddedLead: () => 'Est\u00e1s en el navegador integrado de una app.',
    embeddedWhy: () =>
      ' En iOS estos navegadores suelen darle a la p\u00e1gina un micr\u00f3fono que solo produce silencio: nadie oye nada y nada lo avisa.',
    embeddedAdvice: () => ({
      before:
        'Abre este enlace en Safari o Chrome: el men\u00fa de la parte de arriba o de abajo de esta ventana tiene ',
      firstMenuItem: 'Abrir en Safari',
      between: ' o ',
      secondMenuItem: 'Abrir en el navegador',
      after:
        '. Si no lo encuentras, copia el enlace y p\u00e9galo t\u00fa en un navegador.',
    }),
    linkCopied: () => 'Enlace copiado',
    copyTheLink: () => 'Copiar el enlace',
  },
  panes: {
    brand: () => 'The Floor',
    pickAConversation: () =>
      'Elige una conversaci\u00f3n a la izquierda, o empieza una.',
  },
  watch: {
    openTheWatchTab: () => 'Abrir la pesta\u00f1a de v\u00eddeo',
    exitFullScreen: () => 'Salir de pantalla completa',
    seek: () => 'Avanzar o retroceder',
    back15: () => '\u221215 s',
    forward15: () => '+15 s',
    pause: () => 'Pausa',
    play: () => 'Reproducir',
    refusedOutsideYouTube: () =>
      'El propietario de este v\u00eddeo no permite reproducirlo fuera de YouTube.',
    videoGone: () => 'Este v\u00eddeo ya no est\u00e1: se ha borrado, o es privado.',
    notAVideo: () => 'Ese enlace no es un v\u00eddeo que YouTube conozca.',
    playerRefused: (code: number) =>
      `YouTube ha rechazado este reproductor (${code}); la culpa es de la app, no del v\u00eddeo.`,
    couldNotPlay: (code: number) =>
      `YouTube no ha podido reproducir este v\u00eddeo (${code}).`,
  },
  availability: {
    inTheAppNow: () => 'En la app ahora',
    lastSeen: (since: string) => `Visto por \u00faltima vez hace ${since}`,
    notUsedYet: () => 'sin usar todav\u00eda',
    nobodyElseYet: () => 'nadie m\u00e1s todav\u00eda',
    hereNow: () => 'Aqu\u00ed ahora',
    neverBeenHere: () => 'Nunca ha estado aqu\u00ed',
    lastHere: (since: string) => `Aqu\u00ed por \u00faltima vez hace ${since}`,
  },
  money: {
    nothingYet: () => 'nada todav\u00eda',
    andLast: (rest: string, last: string) => `${rest} y ${last}`,
  },
  contacts: {
    requests: () => 'Solicitudes',
    you: () => 'T\u00fa',
    openYourProfile: (name: string) => `${name}. T\u00fa. Abrir tu perfil.`,
    openTheirProfile: (name: string, availability: string | null) =>
      `${name}.${availability ? ` ${availability}.` : ''} Abrir su perfil.`,
    yourContacts: () => 'Tus contactos',
    nobodyYet: () =>
      'Nadie todav\u00eda. A\u00f1ade a alguien por la direcci\u00f3n con la que se registr\u00f3, y esa persona decide.',
    wantsToBeAContact: () => 'Quiere ser contacto',
    pending: () => 'Pendiente',
    accept: () => 'Aceptar',
    decline: () => 'Rechazar',
    sent: () => 'Enviada',
    withdraw: () => 'Retirar',
    couldNotWithdraw: () => 'No se ha podido retirar',
    addAContact: () => 'A\u00f1adir un contacto',
    alreadyAsked: () => 'Ya te lo hab\u00eda pedido: ahora sois contactos.',
    requestSent: () => 'Solicitud enviada; falta que la acepte.',
    searchByEmail: () => 'Buscar por direcci\u00f3n de correo',
    cancel: () => 'Cancelar',
    sending: () => 'Enviando\u2026',
    sendRequest: () => 'Enviar solicitud',
    or: () => 'o',
    toGenerateAnInviteLink: () => 'Para generar un enlace de invitaci\u00f3n,',
    chooseAUsername: () => 'Elige un nombre de usuario',
    makingALink: () => 'Creando un enlace\u2026',
    shareInviteLink: () => 'Compartir el enlace de invitaci\u00f3n',
    copyInviteLink: () => 'Copiar el enlace de invitaci\u00f3n',
    linkCopied: () =>
      'Enlace copiado. Sirve una sola vez, para la primera persona que lo abra.',
    clipboardRefused: () => 'El portapapeles lo ha rechazado. Int\u00e9ntalo otra vez.',
  },
  channels: {
    declineTitle: () => '\u00bfRechazar esta invitaci\u00f3n?',
    declineBody: (from: string | null) =>
      `Desaparece de tu pantalla de inicio y necesitar\u00e1s una invitaci\u00f3n nueva para ${
        from ? `entrar en ${from}` : 'volver'
      }.`,
    cancel: () => 'Cancelar',
    decline: () => 'Rechazar',
    couldNotStartChannel: () => 'No se ha podido crear el canal',
    thatDidNotWork: () => 'Eso no ha funcionado.',
    reconnecting: () => 'Reconectando\u2026',
    notConnected: () =>
      'Sin conexi\u00f3n: las invitaciones y los canales no se actualizar\u00e1n.',
    startAChannel: () => 'Crear un canal',
    declineInvite: () => 'Rechazar la invitaci\u00f3n',
    aChannel: () => 'Un canal',
    askedYouInAsGuest: (from: string) => `${from} te ha invitado como invitado`,
    askedYouIn: (from: string) => `${from} te ha invitado`,
    waiting: (asked: string) => `${asked} · esperando`,
    askedAnd: (asked: string, quiet: string | null) =>
      `${asked}${quiet ? ` · ${quiet}` : ''}`,
    youAreAGuestHere: (present: number | null) =>
      `Aqu\u00ed eres invitado${present !== null ? ` · ${present} presentes` : ''}`,
    present: (count: number) => `${count} ${count === 1 ? 'presente' : 'presentes'}`,
    nearby: (count: number) => `${count} cerca`,
    rowLabel: (
      title: string,
      line: string | null,
      steppedIn: boolean,
      asGuest: boolean
    ) =>
      `${title}. ${line ? `${line}. ` : ''}${
        steppedIn ? 'Has entrado y salido. ' : ''
      }${asGuest ? 'Abrir como invitado.' : 'Abrir.'}`,
  },
  home: {
    settings: () => 'Ajustes',
    liveBarLabel: (title: string, muted: boolean) =>
      `${title}, ${
        muted ? 'tienes el micr\u00f3fono silenciado' : 'est\u00e1s aqu\u00ed'
      }. Toca para volver.`,
    nobodyElseHereYet: () => 'Todav\u00eda no hay nadie m\u00e1s',
    present: (count: number) => `${count} ${count === 1 ? 'presente' : 'presentes'}`,
    tapToGoBack: () => ' · toca para volver',
    filmElsewhere: (title: string) =>
      `${title}: la pel\u00edcula est\u00e1 en otro de tus dispositivos. Toca para verla aqu\u00ed.`,
    nearbyBarLabel: (title: string, present: number) =>
      `${title}, est\u00e1s cerca. ${
        present === 0
          ? 'No hay nadie.'
          : `${present} ${present === 1 ? 'presente' : 'presentes'}.`
      } Toca para abrir.`,
    nearbySub: (present: number) =>
      present === 0
        ? 'Cerca · no hay nadie'
        : `Cerca · ${present} ${present === 1 ? 'presente' : 'presentes'}`,
    help: () => 'Ayuda',
    answered: () => 'respondida',
    askUsSomething: () =>
      'Preg\u00fantanos algo, o cuenta qu\u00e9 est\u00e1 roto. Una persona lo lee y responde, y la respuesta te espera aqu\u00ed debajo de tu pregunta.',
    chipIn: () => 'Contribuir',
    whatItCosts: () =>
      'La m\u00e1quina en la que funciona, el audio que lleva una conversaci\u00f3n y el almacenamiento de tus grabaciones cuestan dinero cada mes.',
    leaderboard: () => 'Clasificaci\u00f3n',
    leaderboardWhy: () =>
      'Qui\u00e9n ha tra\u00eddo a m\u00e1s gente a The Floor. Est\u00e1 aqu\u00ed porque se activ\u00f3 para tu cuenta.',
    audioLab: () => 'Laboratorio de audio',
    audioLabWhy: () =>
      'Un banco de pruebas para la sesi\u00f3n de audio de iOS. Haz una prueba fuera de cualquier canal, o lo que mide son tres cosas discutiendo.',
    putItOnYourPhone: () => 'Instala The Floor en tu tel\u00e9fono',
    browserCannotNotify: () =>
      'Un navegador no puede avisarte, as\u00ed que nadie puede localizarte aqu\u00ed a menos que est\u00e9s mirando. La app s\u00ed.',
    notNow: () => 'Ahora no',
    getTheApp: () => 'Instalar la app',
    nobodyCanReachYou: () => 'Nadie puede localizarte',
    notificationsAreOff: () =>
      'Las notificaciones de The Floor est\u00e1n desactivadas, as\u00ed que una invitaci\u00f3n o un toque solo llegan si por casualidad est\u00e1s mirando.',
    tellMeMore: () => 'Cu\u00e9ntame m\u00e1s',
    contacts: () => 'Contactos',
    requestsWaiting: () => 'solicitudes pendientes',
    channels: () => 'Canales',
    podcasts: () => 'Podcasts',
    support: () => 'Ayuda y apoyo',
  },
  channelCards: {
    guestSuffix: () => ' · invitado',
    notReceivingYou: () => 'No se te recibe',
    listeningAsking: () => 'Escuchando · pide la palabra',
    listeningRefused: () => 'Escuchando · se le dijo que no',
    listening: () => 'Escuchando',
    hasTheFloor: () => 'Tiene la palabra',
    canSpeakMuted: () => 'Puede hablar · se ha silenciado',
    speaking: () => 'Hablando',
    canSpeak: () => 'Puede hablar',
    turnTheirMicrophoneOff: () => 'Apagar su micr\u00f3fono',
    letThemSpeak: () => 'Dejarle hablar',
    turnTheirMicrophoneOn: () => 'Encender su micr\u00f3fono',
    asked: () => 'Pedido',
    theySaidNo: () => 'Ha dicho que no',
    contact: () => 'Contacto',
    addContact: () => 'A\u00f1adir a contactos',
    askThemToJoin: () => 'Proponerle registrarse',
    addToChannel: () => 'A\u00f1adir al canal',
    remove: () => 'Quitar',
    stepInToAnswerForAGuest: () =>
      'Entra para decidir qu\u00e9 puede hacer un invitado.',
    theyCanHearYouCannot: () => 'Puede o\u00edr el canal. Nadie puede o\u00edrle.',
    nearby: () => 'Cerca',
    presentNotReceivingYou: () => 'Presente · no se te recibe',
    present: () => 'Presente',
    nearbyFor: (since: string) => `Cerca ${since}`,
    steppedOut: () => 'Ha salido',
    steppedOutAgo: (since: string) => `Sali\u00f3 hace ${since}`,
    /**
     * *Sin entrar*, not *Invitado*.
     *
     * *Invitado* is the guest and the pending seat is *Invitaciones*, so the
     * participle here would say that a member of the channel is a guest of it
     * — the one thing this roster must never say. Naming the absence collides
     * with neither and is true of exactly this state.
     */
    invited: () => 'Sin entrar',
    you: (name: string) => `${name} (t\u00fa)`,
    muted: () => ' · silenciado',
    hasTheFloorSuffix: () => ' · tiene la palabra',
    watching: () => ' · viendo',
    waitFor: (seconds: string) => `espera ${seconds}`,
    pinging: () => 'Avisando\u2026',
    pinged: () => 'Avisado',
    ping: () => 'Avisar',
    participantLabel: (
      name: string,
      self: boolean,
      status: string,
      holdsFloor: boolean,
      watching: boolean,
      speaking: boolean,
      openable: boolean
    ) =>
      `${name}${self ? ', t\u00fa' : ''}. ${status}.${
        holdsFloor ? ' Tiene la palabra.' : ''
      }${watching ? ' Viendo.' : ''}${speaking ? ' Hablando.' : ''}${
        openable ? ' Ver perfil.' : ''
      }`,
    stepInToAskAnybodyIn: () =>
      'Entra para invitar a alguien. Una invitaci\u00f3n cae en medio de lo que se est\u00e9 diciendo, as\u00ed que es de quien lo est\u00e9 diciendo.',
    memberOrGuestFull: (cap: number) =>
      `Un miembro se une al canal y se queda; caben ${cap} y est\u00e1 lleno. Un invitado est\u00e1 solo para esta conversaci\u00f3n, y su sitio termina cuando termina la sala.`,
    memberOrGuest: () =>
      'Un miembro se une al canal y se queda. Un invitado est\u00e1 solo para esta conversaci\u00f3n: ve nombres y nada m\u00e1s, y su sitio termina cuando termina la sala.',
    guestOnlyFull: (cap: number) =>
      `Un invitado est\u00e1 solo para esta conversaci\u00f3n, y su sitio termina cuando termina la sala. No se ofrece ser miembro: el canal tiene ${cap} y est\u00e1 lleno.`,
    guestOnly: () =>
      'Un invitado est\u00e1 solo para esta conversaci\u00f3n, y su sitio termina cuando termina la sala.',
    invite: (name: string) => `Invitar a ${name}`,
    guest: () => 'Invitado',
    member: () => 'Miembro',
    audioNotConnected: () => 'Audio sin conectar.',
    connectingAudio: () => 'Conectando el audio\u2026',
    audioDropped: () => 'Se ha cortado el audio: reconectando\u2026',
    audioMovedToOtherDevice: () => 'El audio se ha ido a tu otro dispositivo.',
    microphoneRefused: () => 'Acceso al micr\u00f3fono denegado.',
    audioNotConfigured: () => 'El audio no est\u00e1 configurado en el servidor.',
    audioFailed: (message: string | null) =>
      `Fallo de audio: ${message ?? 'error desconocido'}`,
    playbackBlockedLead: () => 'Este navegador todav\u00eda no reproduce sonido.',
    playbackBlockedRest: () =>
      ' Espera a que se lo pidan, as\u00ed que nada de lo que se dice en este canal te est\u00e1 llegando.',
    playTheChannel: () => 'Reproducir el canal',
    microphoneSilentLead: () => 'No llega nada de tu micr\u00f3fono.',
    microphoneSilentRest: () =>
      ' Si has estado hablando, nadie te oye: es lo que suele pasar en iOS con el navegador integrado de una app. Abre esto en Safari o Chrome; salir y volver a entrar repite la medici\u00f3n.',
  },
  seat: {
    micListening: () => 'Est\u00e1s escuchando. Nadie puede o\u00edrte.',
    micAsking: () => 'Has pedido la palabra. Esperando que alguien responda.',
    micRefused: () => 'Por ahora te han dicho que no al micr\u00f3fono.',
    micOpen: () => 'Tu micr\u00f3fono est\u00e1 abierto y el canal puede o\u00edrte.',
    micMuted: () => 'Tu micr\u00f3fono est\u00e1 abierto, y te has silenciado.',
    unmute: () => 'Quitar silencio',
    mute: () => 'Silenciar',
    stepOut: () => 'Salir',
    beingRecorded: () => 'Esta conversaci\u00f3n se est\u00e1 grabando.',
    you: () => 'T\u00fa',
    silenced: () => 'Alguien tiene la palabra, as\u00ed que la sala no puede o\u00edrte ahora.',
    askToSpeak: () => 'Pedir la palabra',
    twoGuestsAlready: () =>
      'Ya hay dos invitados con micr\u00f3fono, que es todo lo que admite una sala.',
    whoIsHere: () => 'Qui\u00e9n est\u00e1 aqu\u00ed',
    nobodyElseIsHere: () => 'No hay nadie m\u00e1s.',
    guest: () => 'Invitado',
    askedOfYou: () => 'Te han pedido',
    wouldLikeToAddYou: (from: string) =>
      `${from} quiere a\u00f1adirte como contacto.`,
    accepting: () => 'Aceptando\u2026',
    accept: () => 'Aceptar',
    thatDidNotWork: () => 'Eso no ha funcionado.',
    noThanks: () => 'No, gracias',
    clipboard: () => 'Portapapeles',
    nothingOnTheClipboard: () => 'No hay nada en el portapapeles.',
    pasteMine: () => 'Pegar el m\u00edo',
    clear: () => 'Borrar',
    yourNameHere: () => 'Tu nombre aqu\u00ed',
    whatTheRoomCallsYou: () =>
      'C\u00f3mo te llama la sala mientras est\u00e1s en ella. Es solo para esta conversaci\u00f3n, y no dice nada de tu cuenta.',
    yourName: () => 'Tu nombre',
    backToHome: () => 'Volver al inicio',
  },
  transcript: {
    title: () => 'Transcripci\u00f3n',
    nameTheVoices: () => 'Poner nombre a las voces',
    preparing: () => 'Preparando\u2026',
    share: () => 'Compartir',
    shareTranscript: () => 'Compartir la transcripci\u00f3n',
    whichFormat: () => '\u00bfEn qu\u00e9 formato?',
    cancel: () => 'Cancelar',
    text: () => 'Texto',
    subtitles: () => 'Subt\u00edtulos',
    data: () => 'Datos',
    deleteTranscript: () => 'Borrar la transcripci\u00f3n',
    deleteThisTranscript: () => '\u00bfBorrar esta transcripci\u00f3n?',
    deleteCost: () =>
      'La grabaci\u00f3n se conserva. Volver a transcribirla cuesta lo mismo que la primera vez.',
    deleteConfirm: () => 'Borrar',
    couldNotDelete: () => 'No se ha podido borrar',
    beingTranscribed: () =>
      'Se est\u00e1 transcribiendo. Tarda unos minutos; puedes salir de esta pantalla.',
    transcribingFailedWith: (reason: string) =>
      `Fall\u00f3 la transcripci\u00f3n — ${reason}`,
    transcribingFailed: () => 'Fall\u00f3 la transcripci\u00f3n.',
    loading: () => 'Cargando\u2026',
    couldNotSave: () => 'No se ha podido guardar',
    missing: (count: number) =>
      count === 1
        ? 'No se ha podido transcribir a una persona, y no est\u00e1 aqu\u00ed.'
        : `No se ha podido transcribir a ${count} personas, y no est\u00e1n aqu\u00ed.`,
    manyVoices: () =>
      'Una letra junto a un nombre significa que en ese micr\u00f3fono se oy\u00f3 m\u00e1s de una voz. No se sabe de qui\u00e9n eran las dem\u00e1s.',
    findAWord: () => 'Buscar una palabra',
    searchSeekable: () =>
      'La b\u00fasqueda es solo tuya. Tocar una l\u00ednea mueve la reproducci\u00f3n para todos.',
    searchOnly: () =>
      'La b\u00fasqueda es solo tuya. Reproduce esta grabaci\u00f3n para saltar a una l\u00ednea.',
    nothingMatches: () => 'No hay coincidencias.',
    nothingWasTranscribed: () => 'No se transcribi\u00f3 nada.',
    couldNotShare: () => 'No se ha podido compartir',
    voices: () => 'Voces',
    voicesExplanation: () =>
      'El servicio oy\u00f3 estas voces. Etiqueta cada micr\u00f3fono por separado, as\u00ed que las letras son su conjetura: ponles nombre, da el mismo nombre a dos para unirlas, o quita una que nunca fue una persona. La transcripci\u00f3n en s\u00ed no cambia y esto se puede rehacer cuando quieras.',
    saving: () => 'Guardando\u2026',
    save: () => 'Guardar',
    clearAll: () => 'Borrar todo',
    someone: () => 'Alguien',
    lines: (count: number) => (count === 1 ? '1 l\u00ednea' : `${count} l\u00edneas`),
    nameThisVoice: () => 'Poner nombre a esta voz',
    bringBack: () => 'Quitada — recuperar',
    removeFromTranscript: () => 'Quitar de la transcripci\u00f3n',
    jumpTo: (at: string, name: string, text: string) =>
      `Saltar a ${at}, ${name}: ${text}`,
  },
  introduction: {
    somebodyLabel: () => 'Trae a alguien aqu\u00ed',
    somebodyInstruction: () =>
      'En Contactos, env\u00eda un enlace de invitaci\u00f3n, o a\u00f1ade a alguien por la direcci\u00f3n con la que entra.',
    somebodyNote: () =>
      'Un enlace funciona mientras duermes, y nadie puede localizarte hasta que uno de los dos haga esto.',
    stepInLabel: () => 'Entra con alguien',
    stepInInstruction: () =>
      'En Canales, crea uno y entra, y qu\u00e9date hasta que entre alguien m\u00e1s. Quien invites llega a ese canal.',
    stepInNote: () =>
      'Estar dos en un canal a la vez es el momento en que la gente puede oírte, y es para lo que sirve todo esto.',
    floorLabel: () => 'Pide la palabra',
    floorInstruction: () =>
      'En un canal, toca Pedir en la barra de abajo. Todos los dem\u00e1s quedan silenciados hasta que la sueltes.',
    floorNote: () =>
      'Es lo que le da nombre a la app: una persona hablando, y nadie que pueda hablar por encima.',
    nearbyLabel: () => 'Di que est\u00e1s cerca',
    nearbyInstruction: () =>
      'En un canal, toca Cerca. Avisa a todos los que no est\u00e9n de que se te puede localizar durante el pr\u00f3ximo cuarto de hora.',
    nearbyNote: () =>
      'Es c\u00f3mo empieza una conversaci\u00f3n sin que nadie tenga que organizarla: se te puede localizar sin estar dentro.',
    guestLabel: () => 'Trae a un invitado',
    guestInstruction: () =>
      'En la pesta\u00f1a Invitar de un canal, comparte un enlace de invitado. Quien lo abra entra en el canal desde un navegador, sin cuenta y sin instalar nada.',
    guestNote: () =>
      'Qu\u00e9date en el canal mientras lo abre: un enlace de invitado deja de funcionar en cuanto no hay ning\u00fan miembro dentro.',
    playerLabel: () => 'Pon algo para escuchar juntos',
    playerInstruction: () =>
      'En la pesta\u00f1a Escuchar de un canal, a\u00f1ade audio. Todos en la sala lo oyen en el mismo momento, y pod\u00e9is seguir hablando por encima.',
    playerNote: () =>
      'Es lo \u00fanico aqu\u00ed que no es alguien hablando, y la sala sigue siendo una sala mientras suena.',
    installLabel: () => 'Pon The Floor en tu pantalla de inicio',
    installNote: () =>
      'Tiene su propio icono y se abre sin un navegador alrededor, que es c\u00f3mo encuentras el camino de vuelta.',
    seeLess: () => 'Ver menos',
    seeMore: () => 'Ver m\u00e1s',
    openChannels: () => 'Abrir Canales',
    openContacts: () => 'Abrir Contactos',
    install: () => 'Instalar',
    openTheChannel: () => 'Abrir el canal',
    openInvite: () => 'Abrir Invitar',
    openListen: () => 'Abrir Escuchar',
    doneBrief: (label: string) => `Hecho: ${label}.`,
    rowLabel: (
      done: boolean,
      label: string,
      instruction: string,
      note: string
    ) => `${done ? 'Hecho' : 'Sin hacer'}: ${label}. ${instruction} ${note}`,
    dismiss: (label: string) => `Descartar ${label}`,
  },
  install: {
    fromHere: () =>
      'Inst\u00e1lala desde aqu\u00ed, o desde el icono de instalar de la barra de direcciones.',
    safari: () =>
      'Toca Compartir en Safari y luego A\u00f1adir a pantalla de inicio.',
    menu: () =>
      'Abre el men\u00fa de tu navegador y elige Instalar, o A\u00f1adir a pantalla de inicio.',
  },
};

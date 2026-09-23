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
  homeSettings: {
    title: () => 'Ajustes de The Floor',
    noServerConfigured: () =>
      'No hay servidor configurado, as\u00ed que no hay pol\u00edtica que mostrar.',
    couldNotOpenPrivacy: () =>
      'No se ha podido abrir la pol\u00edtica de privacidad',
    nothingElseSignedIn: () => 'No hab\u00eda nada m\u00e1s con la sesi\u00f3n iniciada',
    otherDevicesSignedOut: () => 'Se ha cerrado la sesi\u00f3n en otros dispositivos',
    signedOutBody: (sessions: number) =>
      sessions === 0
        ? 'Este es el \u00fanico dispositivo con la sesi\u00f3n iniciada en tu cuenta.'
        : sessions === 1
          ? 'Se ha cerrado la sesi\u00f3n en otro dispositivo. Necesitar\u00e1 un c\u00f3digo nuevo por correo.'
          : `Se ha cerrado la sesi\u00f3n en ${sessions} dispositivos. Necesitar\u00e1n un c\u00f3digo nuevo por correo.`,
    gettingStarted: () => 'Primeros pasos',
    showTheChecklistAgain: () => 'Volver a mostrar la lista',
    showing: () => 'Mostrando\u2026',
    showTheChecklistAgainAsk: () => '\u00bfVolver a mostrar la lista?',
    showTheChecklistAgainBody: () =>
      'Primeros pasos vuelve al inicio con todos los pasos por hacer otra vez: entrar, las cuatro cosas que probar en un canal, y lo que hayas descartado con la cruz de al lado.\n\nNo cambia nada m\u00e1s: sigues con la sesi\u00f3n iniciada, y tus canales, contactos, grabaciones y ajustes quedan intactos.\n\nSal antes de cualquier canal. Estar en uno con alguien marca el primer paso al instante, as\u00ed que la lista volver\u00eda con ese ya hecho.',
    cancel: () => 'Cancelar',
    showIt: () => 'Mostrarla',
    checklistNote: () =>
      'La lista que hay encima de tus canales en el inicio. Desaparece para siempre cuando est\u00e1n todos los pasos hechos —la conversaci\u00f3n y las cuatro cosas que probar en un canal— o cuando has descartado todos con la cruz de al lado, y esta es la forma de recuperarla.',
    audioOutput: () => 'Salida de audio',
    chooseWhereSoundComesOut: () => 'Elegir por d\u00f3nde sale el sonido',
    chooseWhereSoundComesOutSub: () =>
      'Auriculares, AirPlay o cualquier cosa emparejada',
    labs: () => 'Pruebas',
    showExperimental: () => 'Mostrar funciones experimentales',
    on: () => 'S\u00ed',
    off: () => 'No',
    labsWhat: () =>
      'No, que es donde empieza todo el mundo. S\u00ed, aparece una cosa sin terminar: las transcripciones de tus grabaciones. Puede cambiar o desaparecer.',
    labsWhose: () =>
      'Va con tu cuenta y no con este tel\u00e9fono, y es solo cosa tuya: activarlo te las muestra a ti, no a nadie m\u00e1s de tus canales.',
    diagnostics: () => 'Diagn\u00f3stico',
    forgetThisPhone: () => 'Olvidar este tel\u00e9fono',
    forgetting: () => 'Olvidando\u2026',
    forgetThisPhoneAsk: () => '\u00bfOlvidar este tel\u00e9fono?',
    forgetThisPhoneBody: () =>
      'Este dispositivo olvida todo lo que tiene guardado: la sesi\u00f3n, tus ajustes de apariencia y de toque, y que ya se le ha preguntado por las notificaciones. Tu cuenta, tus canales y tus grabaciones quedan intactos.\n\nBorra la app despu\u00e9s y vuelve a instalarla para tener una instalaci\u00f3n realmente nueva: el permiso de notificaciones es del sistema y solo se borra al borrar la app.',
    forget: () => 'Olvidar',
    forgetNote: () =>
      'Para ver lo que ve alguien que acaba de llegar. Cerrar sesi\u00f3n no hace esto, y borrar la app tampoco.',
    showEveryDab: () => 'Mostrar todas las marcas',
    stopShowingEveryDab: () => 'Dejar de mostrar todas las marcas',
    dabsNote: () =>
      'Pone una marca en las dos pesta\u00f1as del inicio que pueden llevarla, y en la tarjeta de Ayuda detr\u00e1s de Ayuda y apoyo, haya o no algo esperando, para poder mirar la marca en s\u00ed. No cambia nada m\u00e1s, y se apaga la pr\u00f3xima vez que arranque la app.',
    appearance: () => 'Apariencia',
    light: () => 'Claro',
    dark: () => 'Oscuro',
    system: () => 'Del sistema',
    appearanceNote: () =>
      'Del sistema sigue al tel\u00e9fono, y cambia con \u00e9l, incluso con un horario si tienes uno puesto.',
    email: () => 'Correo',
    occasionalEmail: () => 'Correo ocasional sobre The Floor',
    emailNote: () =>
      'No, que es donde empieza todo el mundo salvo que dijera otra cosa al registrarse. S\u00ed, podemos escribirte sobre c\u00f3mo usar The Floor y qu\u00e9 ha cambiado.',
    codesArriveEitherWay: () =>
      'Tus c\u00f3digos para entrar llegan igualmente: son c\u00f3mo entras, no algo que te enviemos.',
    privacy: () => 'Privacidad',
    privacyPolicy: () => 'Pol\u00edtica de privacidad',
    privacyNote: () =>
      'Qu\u00e9 se guarda, por qu\u00e9 y durante cu\u00e1nto tiempo. Se abre en tu navegador.',
    account: () => 'Cuenta',
    signOut: () => 'Cerrar sesi\u00f3n',
    signOutAsk: () => '\u00bfCerrar sesi\u00f3n?',
    signOutBody: () =>
      'Necesitar\u00e1s un c\u00f3digo nuevo por correo para volver a entrar. Tus canales y tus grabaciones se conservan.',
    signOutNote: () =>
      'Solo en este dispositivo. Donde tengas sesi\u00f3n iniciada sigue igual.',
    signingOut: () => 'Cerrando sesi\u00f3n\u2026',
    signOutOtherDevices: () => 'Cerrar sesi\u00f3n en otros dispositivos',
    signOutOtherDevicesAsk: () => '\u00bfCerrar sesi\u00f3n en otros dispositivos?',
    signOutOtherDevicesBody: () =>
      'Se cierra la sesi\u00f3n en cualquier otro tel\u00e9fono, tableta u ordenador con sesi\u00f3n iniciada en tu cuenta. Este dispositivo sigue con la sesi\u00f3n iniciada. Tus canales y tus grabaciones se conservan.',
    signOutOthers: () => 'Cerrar en los dem\u00e1s',
    signOutOthersNote: () =>
      'Para un tel\u00e9fono que has perdido. Es la \u00fanica forma de terminar una sesi\u00f3n desde un dispositivo que ya no tienes.',
    deleting: () => 'Borrando\u2026',
    deleteAccount: () => 'Borrar la cuenta',
    deleteAccountAsk: () => '\u00bfBorrar tu cuenta?',
    deleteAccountBody: () =>
      'Tu direcci\u00f3n, tu nombre, lo que escribiste sobre ti y tus contactos se eliminan de inmediato.\n\nLos canales que compartes con otras personas siguen sin ti, y tambi\u00e9n las grabaciones hechas en ellos: son del canal. Los canales en los que eres el \u00fanico miembro se borran con todo lo que hay dentro.\n\nEsto no se puede deshacer.',
    deleteConfirm: () => 'Borrar',
  },
  channelSettings: {
    title: () => 'Ajustes del canal',
    leaveAsk: () => '\u00bfSalir de este canal?',
    leaveBody: (recordings: string | null, one: boolean) =>
      `Desaparece de tu pantalla de inicio y necesitar\u00e1s una invitaci\u00f3n nueva para volver. Los dem\u00e1s lo conservan${
        recordings === null
          ? '.'
          : `, y ${recordings} con \u00e9l: ya no podr\u00e1s ${
              one ? 'acceder a ella' : 'acceder a ellas'
            }.`
      }`,
    cancel: () => 'Cancelar',
    leave: () => 'Salir',
    deleteAsk: () => '\u00bfBorrar este canal?',
    deleteBody: (recordings: string | null) =>
      recordings === null
        ? 'Eres su \u00faltimo miembro, as\u00ed que esto es el final. No se puede deshacer.'
        : `Eres su \u00faltimo miembro, as\u00ed que esto borra el canal y ${recordings}. Comparte antes lo que quieras conservar: no se puede deshacer.`,
    continueLabel: () => 'Continuar',
    deleteForGood: (recordings: string | null) =>
      recordings === null
        ? '\u00bfBorrar definitivamente?'
        : `\u00bfBorrar ${recordings} definitivamente?`,
    deleteForGoodBody: (days: number) =>
      `Todo desaparece, para siempre, al cabo de ${days} d\u00edas. En la app no hay forma de deshacerlo.`,
    deleteConfirm: () => 'Borrar',
    channelName: () => 'Nombre del canal',
    renameStepIn: () =>
      'Entra para cambiar el nombre de este canal. Hay alguien dentro, y el nombre es c\u00f3mo llama al sitio en el que est\u00e1.',
    renamePublic: () =>
      'Todos los del canal ven este nombre, y cualquiera que est\u00e9 en la sala puede cambiarlo. No se puede dejar vac\u00edo mientras este canal tenga p\u00e1gina p\u00fablica: la p\u00e1gina se encuentra por su nombre, y un canal sin nombre se lista por qui\u00e9n est\u00e1 dentro.',
    renamePrivate: () =>
      'Todos los del canal ven este nombre, y cualquiera que est\u00e9 en la sala puede cambiarlo. D\u00e9jalo vac\u00edo para volver a listar qui\u00e9n est\u00e1 aqu\u00ed.',
    recording: () => 'Grabaci\u00f3n',
    recordAutomatically: () => 'Grabar autom\u00e1ticamente',
    on: () => 'S\u00ed',
    off: () => 'No',
    autoRecordNote: () =>
      'No, que es donde empieza todo canal: una grabaci\u00f3n empieza cuando alguien pulsa Grabar. S\u00ed, empieza sola en cuanto hay dos personas en la sala, y todos la ven en marcha.',
    autoRecordHow: () =>
      'Pausar y Parar funcionan igual en ambos casos, y parar es definitivo: no empieza una segunda grabaci\u00f3n hasta que todo el mundo haya salido del canal y haya vuelto.',
    autoRecordStepIn: () =>
      'Entra para cambiar esto. Lo que se conserva de una conversaci\u00f3n es cosa de quien est\u00e1 en ella.',
    notifications: () => 'Notificaciones',
    publicPage: () => 'P\u00e1gina p\u00fablica',
    guestLinks: () => 'Enlaces de invitado',
    deleting: () => 'Borrar',
    leaving: () => 'Salir',
    deleteChannel: () => 'Borrar el canal',
    leaveChannel: () => 'Salir del canal',
    lastMemberNoRecordings: () =>
      'Eres su \u00faltimo miembro: esto lo destruye para siempre',
    lastMemberWithRecordings: (recordings: string) =>
      `Esto lo destruye, y ${recordings}, para siempre`,
    removesFromHome: () => 'Lo quita de tu pantalla de inicio',
    removesFromHomeWith: (recordings: string) =>
      `Lo quita de tu pantalla de inicio, ${recordings} incluidas`,
    steppingOutInstead: () =>
      'Salir de la sala est\u00e1 en la pantalla del canal y es seguramente lo que quieres: conserva tu sitio aqu\u00ed.',
    couldNotChange: () => 'Ahora mismo no se ha podido cambiar eso.',
    thatDidNotWork: () => 'Eso no ha funcionado.',
    hasAPublicPage: () => 'Este canal tiene p\u00e1gina p\u00fablica',
    publishAsk: () => '\u00bfDarle a este canal una p\u00e1gina p\u00fablica?',
    publishBody: () =>
      'La p\u00e1gina muestra el nombre y la descripci\u00f3n del canal a cualquiera, y el canal aparece en una lista p\u00fablica donde puede encontrarlo gente que no conoces. Los miembros no se nombran.\n\nNinguna grabaci\u00f3n aparece en ella hasta que todos los que estaban en esa grabaci\u00f3n acepten publicarla, uno a uno, desde su tarjeta en la pantalla del canal.',
    notNow: () => 'Ahora no',
    createThePage: () => 'Crear la p\u00e1gina',
    unpublishAsk: () => '\u00bfRetirar esta p\u00e1gina?',
    unpublishBody: () =>
      'La p\u00e1gina y el feed dejan de responder al instante, y el canal sale de la lista p\u00fablica. Quien se hubiera suscrito en una app de podcasts deja de recibirlo, y las copias ya descargadas no se pueden alcanzar.\n\nNo se retira el permiso de nadie, as\u00ed que volver a activarlo pone las mismas grabaciones en la misma direcci\u00f3n.',
    keepThePage: () => 'Conservar la p\u00e1gina',
    takeItDown: () => 'Retirarla',
    saving: () => 'Guardando\u2026',
    pageNote: () =>
      'No hay nada en la p\u00e1gina hasta que todos los de una grabaci\u00f3n acepten publicarla. Se pregunta por cada grabaci\u00f3n por separado, en su propia tarjeta. El canal en s\u00ed aparece en la lista p\u00fablica en cuanto esto est\u00e1 activado.',
    directoryNeedsThese: () =>
      'Para aparecer en un directorio de podcasts, un feed necesita adem\u00e1s esto.',
    publicOffNote: () =>
      'No, que es como empieza todo canal. No hay p\u00e1gina ni feed, y nada de aqu\u00ed es accesible desde fuera.',
    nameItFirst: () =>
      'Ponle antes un nombre a este canal, arriba en esta pantalla. Una p\u00e1gina p\u00fablica se encuentra por su nombre, y este canal no tiene: se lista por qui\u00e9n est\u00e1 dentro, y una p\u00e1gina p\u00fablica nunca nombra a un miembro.',
    coverSetAt: (width: number, height: number) =>
      `Portada puesta — ${width}×${height}.`,
    coverSet: () => 'Portada puesta.',
    uploading: () => 'Subiendo\u2026',
    replaceCoverArt: () => 'Cambiar la portada',
    addCoverArt: () => 'A\u00f1adir una portada',
    coverRulesShort: () => 'Cuadrada, 1400–3000 p\u00edxeles, sin transparencia',
    coverRules: () =>
      'JPEG o PNG cuadrado, 1400–3000 p\u00edxeles, sin transparencia',
    languagePlaceholder: () => 'es',
    languageNote: () =>
      'El idioma de estas conversaciones, como una etiqueta del tipo \u201ces\u201d o \u201cpt-BR\u201d. Si se deja vac\u00edo, el feed dice ingl\u00e9s.',
    explicit: () => 'Estas conversaciones tienen contenido expl\u00edcito',
    done: () => 'Listo',
    category: () => 'Categor\u00eda',
    categoryUnset: () => 'Sin poner — un directorio necesita una',
    couldNotReadLinks: () => 'No se han podido leer los enlaces.',
    reading: () => 'Leyendo\u2026',
    noGuestLinksYet: () =>
      'Todav\u00eda no hay enlaces de invitado. La pantalla del canal crea uno y lo pasa a compartir.',
    linkOpen: () => 'Abierto — cualquiera que lo tenga puede llamar',
    linkClosedWhenEmptied: () => 'Cerrado al quedarse vac\u00edo el canal',
    linkRevoked: () => 'Anulado',
    revoke: () => 'Anular',
    revokeNote: () =>
      'Anularlo impide que llame gente nueva. Quien ya est\u00e9 en el canal se queda hasta que salga o alguien lo quite.',
    revokeStepIn: () =>
      'Entra para anular un enlace. Cerrar una puerta a una conversaci\u00f3n es cosa de quien est\u00e1 en ella.',
    countOf: (n: number) =>
      n === 1 ? 'su grabaci\u00f3n' : `sus ${n} grabaciones`,
  },
  profile: {
    telegramProblem: () =>
      'Un nombre de usuario de Telegram, de cinco caracteres o m\u00e1s: letras, d\u00edgitos y guiones bajos.',
    phoneProblem: () =>
      'Un n\u00famero de tel\u00e9fono con su prefijo de pa\u00eds, como +1 555 123 4567.',
    you: () => 'T\u00fa',
    contact: () => 'Contacto',
    contactRequested: () => 'Contacto solicitado',
    channelMember: () => 'Miembro del canal',
    removeAsk: (name: string) => `\u00bfQuitar a ${name}?`,
    removeBody: () =>
      'Dejar\u00e9is de ser contactos el uno del otro, y saldr\u00e1s de los canales en los que solo est\u00e9is los dos. Los canales con m\u00e1s gente dentro no se ven afectados.',
    cancel: () => 'Cancelar',
    remove: () => 'Quitar',
    couldNotOpen: (service: string) => `No se ha podido abrir ${service}`,
    saving: () => 'Guardando\u2026',
    done: () => 'Listo',
    edit: () => 'Editar',
    name: () => 'Nombre',
    namePlaceholder: () => 'C\u00f3mo quieres que te llamen',
    nameCannotBeEmpty: () =>
      'El nombre no puede estar vac\u00edo: es c\u00f3mo te encuentran los dem\u00e1s, as\u00ed que se conserva este hasta que escribas otro.',
    username: () => 'Nombre de usuario',
    usernameOptional: () => 'opcional',
    usernameHint: (min: number, max: number) =>
      `Solo tuyo, y visible en tu perfil: de ${min} a ${max} caracteres. Todav\u00eda no sirve para nada m\u00e1s; d\u00e9jalo vac\u00edo para no tener ninguno.`,
    invitedCount: (count: number) => `Ha tra\u00eddo a ${count}`,
    invitedBy: (name: string) => `Invitado por ${name}`,
    muteThem: () => 'Silenciarle',
    theyAreMuted: () =>
      'Silenciado. Volver a abrirlo es cosa suya, desde su propia barra: nadie m\u00e1s puede.',
    justUnmuted: (wait: string) =>
      `Acaba de quitarse el silencio. Puedes volver a silenciarle dentro de ${wait}.`,
    theyHaveTheFloor: () =>
      'Tiene la palabra, as\u00ed que su micr\u00f3fono sigue abierto hasta que la suelte.',
    mutingIsSilent: () =>
      'Cerrarlo no le dice por qu\u00e9: d\u00edselo tambi\u00e9n en voz alta. Puede volver a abrirlo cuando quiera.',
    ping: () => 'Aviso',
    sent: () => 'Enviado.',
    pinged: () => 'Avisado.',
    pingAgainIn: (wait: string) => ` Puedes volver a avisarle dentro de ${wait}.`,
    notPingedAgain: () => ' No se le volver\u00e1 a avisar durante unos minutos.',
    said: (who: string) => `${who} dijo:`,
    pingPlaceholder: () => 'Lo que quieras decir (opcional)',
    charactersLeft: (left: number) => `quedan ${left}`,
    theyWillGetANotification: () => 'Le llegar\u00e1 una notificaci\u00f3n.',
    sending: () => 'Enviando\u2026',
    sendPing: () => 'Enviar aviso',
    channelsWithThem: () => 'Canales con esta persona',
    present: (count: number) => `${count} ${count === 1 ? 'presente' : 'presentes'}`,
    hereLabel: (title: string, line: string, muted: boolean) =>
      `${title}. ${line}. Est\u00e1s aqu\u00ed${
        muted ? ', con el micr\u00f3fono silenciado' : ''
      }. Toca para volver.`,
    stepInLabel: (title: string, line: string) => `${title}. ${line}. Entrar.`,
    email: () => 'Correo',
    copied: () => '\u2713 copiado',
    copyFailed: () => '\u2717 no se ha podido copiar',
    copy: () => 'Copiar',
    howYouSignIn: () =>
      'C\u00f3mo entras. Nadie m\u00e1s lo ve salvo que se lo muestres, y eso se hace de contacto en contacto, desde su perfil.',
    differentAddress: () => 'Otra direcci\u00f3n',
    codeOnItsWay: (address: string) =>
      `Va un c\u00f3digo de camino a ${address}. Te hace entrar ah\u00ed, que es lo que la hace tuya.`,
    sixDigits: () => 'Seis d\u00edgitos',
    changing: () => 'Cambiando\u2026',
    changeMyAddress: () => 'Cambiar mi direcci\u00f3n',
    sendACode: () => 'Enviar un c\u00f3digo',
    notShowingTheirEmail: () => 'No te est\u00e1 mostrando su correo.',
    theyCanSeeYourEmail: () => 'Puede ver tu correo.',
    hiding: () => 'Ocultando\u2026',
    stopShowingMyEmail: () => 'Dejar de mostrar mi correo',
    stoppingIsNotRecall: () =>
      'No podr\u00e1 volver a verlo, aunque puede que ya lo tenga apuntado en alg\u00fan sitio.',
    showing: () => 'Mostrando\u2026',
    showMyEmail: () => 'Mostrar mi correo',
    showMyEmailNote: () => 'Mostrar mi correo a este contacto.',
    messaging: () => 'Mensajer\u00eda',
    open: () => 'Abrir',
    contactsSeeThese: () => 'Tus contactos ven esto en tu perfil.',
    noProfileHere: () => 'Aqu\u00ed no hay ning\u00fan perfil que mostrarte.',
    messagingFieldsNote: () =>
      'Visible para tus contactos, que pueden tocar uno para abrir la conversaci\u00f3n ah\u00ed. Deja un campo vac\u00edo para quitarlo de tu perfil.',
    alreadyAContact: () => 'Ya es uno de tus contactos.',
    removing: () => 'Quitando\u2026',
    removeContact: () => 'Quitar de contactos',
    requestSent: () => 'Solicitud enviada; falta que la acepte.',
    accepting: () => 'Aceptando\u2026',
    acceptTheirRequest: () => 'Aceptar su solicitud',
    theyAskedYouFirst: () => 'Te lo ha pedido antes.',
    asking: () => 'Pidiendo\u2026',
    addContact: () => 'A\u00f1adir a contactos',
    theyWillDecide: () =>
      'Ver\u00e1 una solicitud en su pantalla de inicio y decidir\u00e1.',
  },
  channel: {
    uploading: () => 'Subiendo\u2026',
    uploadingPercent: (percent: number) => `Subiendo\u2026 ${percent}%`,
    channelGone: () => 'El canal ya no est\u00e1',
    channelGoneBody: () =>
      'Este canal ya no existe. Puede que terminara hace tiempo, o que ya no formes parte de \u00e9l.',
    loadingChannel: () => 'Cargando el canal\u2026',
    reconnecting: () => 'Reconectando\u2026',
    backToHome: () => 'Volver al inicio',
    someone: () => 'Alguien',
    channelEnded: () => 'El canal ha terminado',
    channelEndedBody: () =>
      'Todo el mundo sali\u00f3 de este canal, as\u00ed que ya no existe. Crea uno nuevo para volver a hablar.',
    nothingOnClipboard: () => 'No hay nada en tu portapapeles que pegar.',
    notAYouTubeLink: () =>
      'Eso no es un enlace de YouTube. Copia uno desde YouTube y vuelve a pulsar.',
    aFilmNobodyNamed: () => 'Una pel\u00edcula sin nombre',
    tabPeople: () => 'Gente',
    tabNotepad: () => 'Notas',
    tabInvite: () => 'Invitar',
    tabListen: () => 'Escuchar',
    tabRecordings: () => 'Grabaciones',
    tabWatch: () => 'Ver',
    aBrowser: () => 'Un navegador',
    anotherPhone: () => 'Otro tel\u00e9fono',
    copied: () => '\u2713 copiado',
    copyFailed: () => '\u2717 no se ha podido copiar',
    copy: () => 'Copiar',
    clipTooLong: (max: number) =>
      `Eso es demasiado largo para compartir. El portapapeles del canal admite ${max} caracteres.`,
    couldNotShare: () => 'No se ha podido compartir',
    recordingPaused: () => 'Grabaci\u00f3n en pausa',
    recording: () => 'Grabando',
    paused: () => 'En pausa',
    settings: () => 'Ajustes',
    home: () => 'Inicio',
    rungIn: () => 'Dentro',
    rungInHintPresent: () => 'Est\u00e1s en este canal',
    rungInHint: () => 'Entra en la conversaci\u00f3n',
    rungNearby: () => 'Cerca',
    rungNearbyHintOn: () => 'Est\u00e1s cerca. Toca para reiniciar la espera',
    rungNearbyHint: () => 'Que se te pueda localizar sin entrar en la conversaci\u00f3n',
    rungOut: () => 'Fuera',
    rungOutHintPresent: () => 'Salir de la conversaci\u00f3n',
    rungOutHintNearby: () => 'Dejar de estar localizable aqu\u00ed',
    rungOutHint: () => 'No est\u00e1s en este canal',
    unmute: () => 'Hablar',
    mute: () => 'Silencio',
    noMicrophone: () => 'Este dispositivo no tiene micr\u00f3fono',
    microphoneMuted: () => 'Tu micr\u00f3fono est\u00e1 silenciado',
    microphoneOpen: () => 'Tu micr\u00f3fono est\u00e1 abierto',
    release: () => 'Soltar',
    claim: () => 'Pedir',
    youHaveTheFloor: () => 'Tienes la palabra',
    claimTheFloor: () => 'Pedir la palabra',
    fullScreen: () => 'Pantalla completa',
    watchOnAnotherDevice: () => 'Ver en otro dispositivo',
    handBackSublabel: () =>
      'Devuelve la pel\u00edcula al dispositivo desde el que entraste',
    filmIsOnThisDevice: () =>
      'La pel\u00edcula est\u00e1 en este dispositivo. Todo lo dem\u00e1s del canal —qui\u00e9n est\u00e1 aqu\u00ed, la palabra, tu micr\u00f3fono— est\u00e1 en el dispositivo desde el que entraste.',
    gotIt: () => 'Entendido',
    cohortTitle: () => 'Tu canal de bienvenida',
    cohortWhy: () =>
      'The Floor sirve para hablar con gente que ya conoces, y no sirve de nada el primer d\u00eda, cuando todav\u00eda no hay nadie que conozcas. As\u00ed que te hemos presentado a unas cuantas personas que se unieron por las mismas fechas, y a alguien que lleva The Floor.',
    cohortWho: () =>
      'Nadie de aqu\u00ed es contacto tuyo, y nadie puede ver tu direcci\u00f3n de correo. Entra y di algo, o sal cuando quieras: en Ajustes del canal, arriba, est\u00e1 Salir de este canal.',
    publicNoticeTitle: () => 'Este canal tiene p\u00e1gina p\u00fablica',
    publicNoticeWhat: () =>
      'Alguien de este canal le ha dado una p\u00e1gina en la web, que muestra su nombre y sus notas a cualquiera, y aparece en una lista p\u00fablica donde puede encontrarlo gente que no conoces. En ella no se nombra nunca a ning\u00fan miembro.',
    publicNoticeRecordings: () =>
      'Ninguna grabaci\u00f3n tuya aparece ah\u00ed salvo que lo aceptes t\u00fa, en su propia tarjeta bajo Grabaciones, y que lo acepten tambi\u00e9n todos los dem\u00e1s. Cualquiera de vosotros puede retirarlo despu\u00e9s.',
    elsewhereTaken: () =>
      'Est\u00e1s en este canal en otro dispositivo. Entrar aqu\u00ed trae la conversaci\u00f3n a este y cierra el micr\u00f3fono del otro.',
    elsewhere: () =>
      'Est\u00e1s en este canal, pero no en este dispositivo. Entrar aqu\u00ed trae la conversaci\u00f3n a este.',
    justSteppedIn: (who: string) => `${who} acaba de entrar.`,
    atTheDoor: () => 'En la puerta',
    knockLead: (name: string) => name,
    knockRest: () => ' est\u00e1 en la puerta con un enlace a este canal.',
    knockWhatTheyGet: () =>
      'Podr\u00e1 escuchar, y hablar solo si alguien le abre el micr\u00f3fono. No puede grabar, y no puede acceder a nada m\u00e1s vuestro.',
    letThemIn: () => 'Dejarle entrar',
    no: () => 'No',
    guests: () => 'Invitados',
    invitations: () => 'Invitaciones',
    takeBack: () => 'Retirar',
    youAskedThemIn: () =>
      'Le invitaste como invitado. Todav\u00eda no ha entrado.',
    theyAskedThemIn: (who: string) =>
      `${who} le invit\u00f3 como invitado. Todav\u00eda no ha entrado.`,
    reconnectingIsLeaving: () =>
      'Reconectando: perder la conexi\u00f3n cuenta como salir.',
    open: () => 'Abrir',
    clear: () => 'Borrar',
    nothingOnTheChannelClipboard: () => 'No hay nada en el portapapeles del canal.',
    replaceWithMyClipboard: () => 'Sustituir por mi portapapeles',
    pasteMyClipboard: () => 'Pegar mi portapapeles',
    oneClipboard: () =>
      'Un solo portapapeles para el canal: pegar sustituye lo que hay, y cualquiera de aqu\u00ed puede copiarlo.',
    stepInToPaste: () => 'Entra para poner algo en el portapapeles del canal.',
    notepadPlaceholder: () => 'Enlaces, una lista de lecturas, para qu\u00e9 es esto…',
    done: () => 'Listo',
    notepadEmptyWritable: () => 'No hay nada en las notas. Escribe algo.',
    notepadEmpty: () => 'No hay nada en las notas. Entra para escribir.',
    edit: () => 'Editar',
    stepInToWrite: () =>
      'Entra para escribir aqu\u00ed. Es para lo que sirve el canal, y eso lo dice quien est\u00e1 dentro.',
    back15: () => '\u221215 s',
    pause: () => 'Pausa',
    play: () => 'Reproducir',
    forward15: () => '+15 s',
    quieter: () => 'M\u00e1s bajo',
    louder: () => 'M\u00e1s alto',
    change: () => 'Cambiar',
    preparing: () => 'Preparando\u2026',
    share: () => 'Compartir',
    remove: () => 'Quitar',
    playSomethingTogether: () => 'Poner algo para escuchar juntos',
    anAudioFile: () => 'Un archivo de audio de este tel\u00e9fono',
    cancelUpload: () => 'Cancelar la subida',
    filmIsPlaying: () =>
      'La pel\u00edcula est\u00e1 en marcha. P\u00e1usala para poner algo aqu\u00ed.',
    theyDecideWhatPlays: (holder: string) =>
      `${holder} tiene la palabra, as\u00ed que decide qu\u00e9 suena.`,
    youDecideWhatPlays: () =>
      'Tienes la palabra: solo t\u00fa puedes cambiar lo que suena.',
    stepInToPlay: () =>
      'Entra para poner algo. Lo que escucha todo el mundo es cosa de quien est\u00e1 escuchando.',
    everyoneHearsThis: () =>
      'Todos oyen esto, y cualquiera que est\u00e9 presente puede cambiarlo.',
    everyoneHearsAndItIsKept: () =>
      'Lo que pongas lo oye todo el mundo, y queda en la grabaci\u00f3n.',
    resumeRecording: () => 'Reanudar la grabaci\u00f3n',
    record: () => 'Grabar',
    resume: () => 'Reanudar',
    pauseRecording: () => 'Pausar la grabaci\u00f3n',
    stopRecording: () => 'Parar la grabaci\u00f3n',
    stop: () => 'Parar',
    floorDecidesWhatPlays: () => 'quien tiene la palabra decide qu\u00e9 suena',
    stepInToPlayShort: () => 'entra para reproducir',
    unmuteTheRoom: () => 'Quitar el silencio de la sala',
    muteTheRoom: () => 'Silenciar la sala',
    unmuteTheRoomSub: () =>
      'Todos pueden hablar otra vez; tu propio silencio no cambia',
    muteTheRoomSub: () => 'En silencio mientras va el v\u00eddeo; pausa para hablar',
    watchThisInstead: () => 'Ver esto en su lugar',
    watchThisInsteadSub: () =>
      'Reproduce el enlace de YouTube de tu portapapeles',
    cancel: () => 'Cancelar',
    orPutOneOfTheseBackOn: () => 'O vuelve a poner una de estas.',
    changeVideo: () => 'Cambiar de v\u00eddeo',
    filmIsOnAnotherDevice: () => 'La pel\u00edcula est\u00e1 en otro dispositivo.',
    watchOnThisDevice: () => 'Ver en este dispositivo',
    stepInToWatch: () =>
      'Entra para ver: una pel\u00edcula no se reproduce para quien est\u00e1 cerca o ha salido.',
    alreadyShowingSomething: () => 'Ya est\u00e1 mostrando algo',
    noOtherDeviceLead: () => 'No hay ning\u00fan otro dispositivo con la sesi\u00f3n iniciada.',
    noOtherDeviceRest: () =>
      ' Abre The Floor en un port\u00e1til o una tableta y entra ah\u00ed, y aparecer\u00e1 aqu\u00ed como un sitio donde ver.',
    copyVideoLink: () => 'Copiar el enlace del v\u00eddeo',
    watchSomethingTogether: () => 'Ver algo juntos',
    watchSomethingTogetherSub: () => 'Un enlace de YouTube de tu portapapeles',
    hideWhatWeHaveWatched: () => 'Ocultar lo que hemos visto',
    watchedBefore: (count: number) => `Vistas antes (${count})`,
    watchedBeforeSub: () => 'Vuelve a poner una, sin enlace',
    roomIsMutedLead: () => 'La sala est\u00e1 en silencio.',
    roomIsMutedRest: () =>
      ' No hay ning\u00fan micr\u00f3fono abierto, as\u00ed que no se cuela nada de la pantalla de nadie. Pausa el v\u00eddeo para hablar.',
    roomStaysMuted: () =>
      ' Alguien lo est\u00e1 viendo en el mismo dispositivo desde el que est\u00e1 en la sala, as\u00ed que sigue en silencio hasta que se pause el v\u00eddeo.',
    pausedSoYouCanTalkLead: () => 'En pausa, pod\u00e9is hablar.',
    pausedSoYouCanTalkRest: () =>
      ' La sala vuelve al silencio cuando se reanude el v\u00eddeo.',
    roomIsUnmutedLead: () => 'La sala no est\u00e1 en silencio.',
    roomIsUnmutedRest: () =>
      ' Se oye a todo el mundo, incluido lo que suene en su propia pantalla.',
    somethingOnListen: () =>
      'Hay algo sonando en Escuchar. P\u00e1usalo para ver algo juntos.',
    stepInToDriveTheFilm: () =>
      'Entra para manejar la pel\u00edcula. Lo que ve todo el mundo es cosa de quien est\u00e1 aqu\u00ed.',
    stepInToStartAParty: () =>
      'Entra para empezar a ver algo juntos. Lo que ve todo el mundo es cosa de quien est\u00e1 aqu\u00ed.',
    stopTheRecordingFirst: () =>
      'Para antes la grabaci\u00f3n: ver algo juntos no se graba.',
    notAvailableJustNow: () => 'Ahora mismo no se puede poner nada.',
    everyoneWatchesInStep: () =>
      'Cada uno lo ve en su propia pantalla, a la vez. No se graba nada de ello.',
    everybodyWatchesInTheApp: () =>
      'Todo el mundo lo ve en la app, a la vez: aqu\u00ed, o en otro dispositivo donde tengas la sesi\u00f3n iniciada. La grabaci\u00f3n queda desactivada mientras dura.',
    contacts: () => 'Contactos',
    thatDidNotWork: () => 'Eso no ha funcionado.',
    guestLink: () => 'Enlace de invitado',
    guestLinkWhat: () =>
      'Un enlace que cualquiera puede abrir en un navegador. Llama a la puerta, y decide quien est\u00e9 en el canal. Los enlaces de este canal se gestionan en Ajustes.',
    makingALink: () => 'Creando un enlace\u2026',
    shareAGuestLink: () => 'Compartir un enlace de invitado',
    copyAGuestLink: () => 'Copiar un enlace de invitado',
    linkCopied: () => 'Enlace copiado. P\u00e9galo donde quieras.',
    linkWouldNotCopy: () => 'El enlace no se ha podido copiar. Int\u00e9ntalo otra vez.',
    stepInToMakeALink: () =>
      'Entra para crear un enlace. Qui\u00e9n entra en una conversaci\u00f3n es cosa de quien la est\u00e1 teniendo.',
  },
  recordings: {
    rowLabel: (name: string, length: string, open: boolean) =>
      `${name}, ${length}. ${open ? 'Ocultar las acciones' : 'Mostrar las acciones'}.`,
    rename: () => 'Cambiar el nombre',
    stillBeingPrepared: () =>
      'Todav\u00eda se est\u00e1 preparando: reproducir y compartir estar\u00e1n disponibles en un momento.',
    playUnavailable: (reason: string) => `No se puede reproducir: ${reason}.`,
    stepInToRenameOrDelete: () =>
      'Entra para cambiar el nombre o borrar. El nombre es de todos, y borrar la quita tambi\u00e9n de sus listas.',
    couldNotRename: () => 'No se ha podido cambiar el nombre',
    namePlaceholder: () => '\u00bfDe qu\u00e9 fue esta conversaci\u00f3n?',
    everyoneSeesTheName: () => 'Todos los de este canal ven el nombre nuevo.',
    renaming: () => 'Cambiando el nombre\u2026',
    save: () => 'Guardar',
    cancel: () => 'Cancelar',
    couldNotDelete: () => 'No se ha podido borrar',
    deleting: () => 'Borrando\u2026',
    delete: () => 'Borrar',
    deleteAsk: (name: string) => `\u00bfBorrar ${name}?`,
    deleteBody: () =>
      'Todos los de este canal la pierden. El audio se elimina dentro de una semana, y nada en la app puede recuperarlo.',
    keep: () => 'Conservar',
    publishedPreparing: () => 'Publicada: el audio a\u00fan se est\u00e1 preparando.',
    published: () => 'Publicada. Cualquiera con la direcci\u00f3n puede escucharla.',
    everybodyAgreed: () => 'Todos han aceptado: se est\u00e1 publicando ahora.',
    waitingOn: (names: string) =>
      `Falta ${names}. Se publica cuando hayan aceptado todos.`,
    notYourVoice: (status: string) =>
      `Tu voz no sale en esta, as\u00ed que no hace falta que lo aceptes. ${status}`,
    couldNotChangeThat: () => 'No se ha podido cambiar eso',
    saving: () => 'Guardando\u2026',
    iAgreeThisCanBePublished: () => 'Acepto que esto se publique',
    publishAsk: () => '\u00bfPublicar esta conversaci\u00f3n?',
    publishBody: () =>
      'Va a la p\u00e1gina p\u00fablica de este canal, donde puede escucharla cualquiera que tenga la direcci\u00f3n, y a su feed, donde las apps de podcasts pueden suscribirse. Se publica en cuanto lo hayan aceptado todos los que salen en ella.\n\nPuedes retirar tu aceptaci\u00f3n cuando quieras, y eso la quita de la p\u00e1gina y del feed. No alcanza a las copias que ya se haya descargado alguien.',
    notNow: () => 'Ahora no',
    iAgree: () => 'Acepto',
    loading: () => 'Cargando\u2026',
    play: () => 'Reproducir',
    couldNotPlay: () => 'No se ha podido reproducir',
    searchWhatWasSaid: () => 'Buscar en lo que se dijo',
    searching: () => 'Buscando\u2026',
    nothingMatches: () => 'No hay coincidencias.',
    aRecording: () => 'Una grabaci\u00f3n',
    someone: () => 'Alguien',
    transcribingNow: () => 'Transcribiendo\u2026',
    transcriptFailed: () => 'Fall\u00f3 la transcripci\u00f3n',
    transcript: () => 'Transcripci\u00f3n',
    transcribe: () => 'Transcribir',
    starting: () => 'Empezando\u2026',
    spendFreeAsk: () => '\u00bfUsar tu transcripci\u00f3n gratuita?',
    transcribeAsk: () => '\u00bfTranscribir esta grabaci\u00f3n?',
    transcribeBody: (provider: string, spends: boolean) =>
      `El audio se env\u00eda a ${provider} para convertirlo en texto, y todos los del canal ver\u00e1n el resultado. Cuesta un poco, y solo se puede hacer una vez por grabaci\u00f3n.` +
      (spends
        ? '\n\nEsta es la \u00fanica transcripci\u00f3n gratuita que tiene tu cuenta. Una vez usada no se podr\u00e1 transcribir ninguna otra grabaci\u00f3n, y borrar esta transcripci\u00f3n no la devuelve.'
        : ''),
    useIt: () => 'Usarla',
    couldNotTranscribe: () => 'No se ha podido transcribir',
    preparing: () => 'Preparando\u2026',
    share: () => 'Compartir',
    couldNotShare: () => 'No se ha podido compartir',
  },
  links: {
    couldNotOpenLink: () => 'No se ha podido abrir el enlace',
  },
  podcastsWeb: {
    frameTitle: () => 'Conversaciones publicadas',
  },
  lockScreen: {
    unmute: () => 'Quitar el silencio',
    mute: () => 'Silenciar',
    microphoneMuted: () => 'Tu micr\u00f3fono est\u00e1 silenciado',
    microphoneOpen: () => 'Tu micr\u00f3fono est\u00e1 abierto',
  },
};

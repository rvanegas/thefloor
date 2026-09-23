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
};

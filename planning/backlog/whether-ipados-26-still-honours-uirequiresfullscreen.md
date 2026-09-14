# Whether iPadOS 26 still honours `UIRequiresFullScreen`

Open, and it no longer blocks anything: the key is deliberately absent and
multitasking is supported outright, so the answer matters only on the day
somebody wants the retreat. This checkout builds against the iOS 26.2 SDK,
where `UISceneSizeRestrictions` notes that `allowsFullScreen` is "currently
only honored on Mac Catalyst", which reads as though the retreat is gone.

Worth settling before anyone plans on being able to opt back out.

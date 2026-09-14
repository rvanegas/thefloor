# The FCM credential is the wide one, and stays acceptable only while the project is empty

**Deliberate, 2026-09-05.** The Firebase console's *Generate new private key*
was taken over creating a service account in Google Cloud IAM with
`roles/firebasemessaging.admin`. The key that button issues belongs to the
`firebase-adminsdk-…` account, which carries the Firebase Admin SDK service
agent role and can do considerably more than send a notification.

**Why that is fine today, stated as the condition it actually is.** That
account's reach is bounded by what the Firebase project contains, and the
project contains nothing but Cloud Messaging — no Firestore, no Realtime
Database, no Storage, no Firebase Auth. A role that can administer those
services over a project that has none of them administers nothing. The wide key
and the narrow key have the same power right now, and one of them took three
minutes less.

**So this is not tidying, it is a tripwire, and the trigger is specific: adding
any other Firebase service to this project silently widens a credential that is
already deployed.** Nothing about the key changes, nothing warns, and the
`.env` line stays byte-identical — the blast radius grows underneath it. So the
narrowing is owed *before* the second service, not on a schedule. If that day
never comes, this entry never needs doing, which is the honest reason it is
deferred rather than done.

Doing it: create a service account in Google Cloud IAM against this project,
grant it *Firebase Cloud Messaging API Admin* and nothing else, generate a JSON
key, replace `~/.config/thefloor/fcm-service-account.json` and the box's copy,
restart, and **delete the old key in the console** — keys accumulate silently
and an undeleted one is still live. Nothing else changes: same env variable,
same path, same code, and `FcmPusher` reads `project_id` and `client_email`
from whatever JSON it is handed.

What is *not* a reason to hurry, since it was overstated once already and the
correction is worth keeping next to the deferral: a leaked messaging key alone
reaches **no devices**. `messages:send` needs a token, a topic or a condition;
no API lists a project's tokens, and this app subscribes to no topics. See
planning/CREDENTIALS.md § *Firebase service account*.

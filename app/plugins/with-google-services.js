const fs = require('node:fs');
const path = require('node:path');

/**
 * Points the Android build at `google-services.json` when there is one.
 *
 * **This exists because the obvious version breaks the build for everybody
 * else.** Setting `expo.android.googleServicesFile` in `app.json` is the
 * documented way to do this, and Expo's own mod throws outright when the file
 * it names is missing — `Cannot copy google-services.json … Ensure the source
 * and destination paths exist`. So a checkout without a Firebase project, which
 * is every checkout until somebody creates one, would fail `expo prebuild`
 * rather than simply building without push. The key has to be conditional, and
 * `app.json` is static, so the condition lives here.
 *
 * Present, this sets the key and Expo's built-in mods do the rest — copying the
 * file into `android/app/` and adding the `com.google.gms.google-services`
 * gradle plugin. Absent, the config is returned untouched and prebuild produces
 * exactly the tree it produced before any of this existed. That is the whole of
 * the "inert until the credential arrives" story on the client: no Firebase
 * initialisation, `getDevicePushTokenAsync` rejects, and `registerForPush`
 * reports the same "not registered" it reports for a refused permission.
 *
 * The file is **not a secret** — it ships inside every APK, and its contents
 * are readable by anybody who downloads the app. It is gitignored because it is
 * per-project build configuration that should not be assumed present, not to
 * protect it. The thing that must be kept is the *server's* service account;
 * see planning/CREDENTIALS.md.
 *
 * **Two locations, and `~/.config/thefloor` is the one to use.** A copy in
 * `app/` wins if it is there, which is what a one-off experiment wants — but
 * `app/` is inside the tree, and this project does most of its work in
 * worktrees that are created and deleted freely. A build input that lives
 * there has to be re-downloaded every time one is thrown away, which is the
 * papercut `~/.config/thefloor` exists to prevent: it is where `livekit.env`,
 * `server.env`, the `.p8` keys and the upload keystore all live, on
 * `bin/provision-livekit`'s founding principle that a credential is authored
 * once, outside any tree, where it can be backed up and diffed. This one is not
 * a credential, but it is exactly as annoying to lose.
 *
 * `THEFLOOR_GOOGLE_SERVICES` overrides both, for a second Firebase project.
 */
const HOME_COPY = path.join(
  process.env.HOME ?? '',
  '.config/thefloor/google-services.json'
);

module.exports = function withGoogleServices(config) {
  const projectRoot = config._internal?.projectRoot ?? process.cwd();
  const candidates = [
    process.env.THEFLOOR_GOOGLE_SERVICES,
    path.join(projectRoot, 'google-services.json'),
    HOME_COPY,
  ].filter(Boolean);
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: file },
  };
};

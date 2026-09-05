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
 */
module.exports = function withGoogleServices(config) {
  const projectRoot = config._internal?.projectRoot ?? process.cwd();
  const file = path.join(projectRoot, 'google-services.json');
  if (!fs.existsSync(file)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: file },
  };
};

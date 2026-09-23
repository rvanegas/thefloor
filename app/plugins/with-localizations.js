const fs = require('node:fs');
const path = require('node:path');
const {
  IOSConfig,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

/**
 * The strings iOS says on this app's behalf, in Spanish as well as English.
 *
 * **There is exactly one of them and it costs a config plugin**, which is
 * worth saying plainly before anybody wonders whether it was worth it. The
 * microphone prompt is the only sentence in this application that the system
 * shows rather than the app, and it is the one shown at the worst possible
 * moment — a person is being asked to hand over a microphone, in a dialog they
 * cannot dismiss and read later, by an app they have had for ninety seconds.
 * An English sentence in an otherwise Spanish app, there, is the one place the
 * translation not being finished actually costs something.
 *
 * **It has to be generated rather than hand-edited**, which is what makes it a
 * plugin. A localised `Info.plist` value lives in `<lang>.lproj/
 * InfoPlist.strings`, which is a file in `ios/` — and `expo prebuild --clean`
 * deletes `ios/` entire; see planning/RELEASING.md, which carries the same
 * warning about `DEVELOPMENT_TEAM`. A hand-written `es.lproj` would survive
 * exactly until the next clean prebuild and then vanish without anything
 * failing, because the fallback is the English string in `Info.plist` and the
 * only symptom is a prompt in the wrong language.
 *
 * Two things are needed and neither works alone. `CFBundleLocalizations`
 * declares which languages the bundle claims, without which iOS never looks
 * for the `.lproj` at all; the file itself is what it finds when it does.
 *
 * **The `.strings` file has to be in the Xcode project as a resource**, or it
 * is written and not copied into the bundle — the failure that looks exactly
 * like the plugin not having run. Expo's `addResourceFileToGroup` is what puts
 * it there; the `xcode` package's own `addResourceFile` is not, having no
 * build phase to attach it to and throwing rather than saying so.
 *
 * The English is the value in `app.json` and is not repeated here, for the
 * reason every other duplicated string in this project is not repeated: the
 * copy is what goes stale. `en.lproj` is therefore not written at all — the
 * `Info.plist` value *is* the English, which is what the development region
 * falls back to.
 */

/** What each language says, keyed by the `Info.plist` key it overrides. */
const TRANSLATIONS = {
  es: {
    NSMicrophoneUsageDescription:
      'The Floor usa tu micrófono para que las demás personas del canal puedan oírte cuando tienes la palabra.',
  },
};

/** The development region, which is what an unlisted language falls back to. */
const BASE = 'en';

module.exports = function withLocalizations(config) {
  const languages = [BASE, ...Object.keys(TRANSLATIONS)];

  config = withInfoPlist(config, (plist) => {
    plist.modResults.CFBundleLocalizations = languages;
    // Said explicitly rather than left to Xcode's default, which is `en` today
    // and is a default rather than a promise. It is also what decides which
    // `.lproj` a device with none of these falls back to.
    plist.modResults.CFBundleDevelopmentRegion = BASE;
    return plist;
  });

  return withXcodeProject(config, (xcode) => {
    const root = xcode.modRequest.platformProjectRoot;
    const name = xcode.modRequest.projectName;
    const project = xcode.modResults;
    // The group the app's own resources are in, which is the one the build
    // phase already copies.
    const group = project.findPBXGroupKey({ name });

    for (const [language, strings] of Object.entries(TRANSLATIONS)) {
      const dir = path.join(root, name, `${language}.lproj`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'InfoPlist.strings'),
        // UTF-8 with a BOM, which is what Xcode writes and what makes an
        // accented character survive: a `.strings` file with no BOM and no
        // UTF-16 header is read as MacRoman by some of the toolchain, and
        // *micrófono* comes out mangled rather than failing.
        '﻿' +
          Object.entries(strings)
            .map(([key, value]) => `"${key}" = "${value}";\n`)
            .join(''),
        'utf8'
      );
      const at = `${language}.lproj/InfoPlist.strings`;
      // Idempotent: prebuild runs this against a tree that may already have
      // it, and a second entry is a duplicate-resource build warning.
      const already = project
        .pbxFileReferenceSection();
      const listed = Object.values(already).some(
        (entry) => entry && entry.path && String(entry.path).includes(at)
      );
      if (!listed) {
        project.addResourceFile(at, { target: project.getFirstTarget().uuid }, group);
      }
    }
    return xcode;
  });
};

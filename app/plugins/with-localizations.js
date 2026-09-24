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
 * build phase to attach it to and throwing rather than saying so. What it
 * throws is `Cannot read properties of null (reading 'path')`, from
 * `correctForResourcesPath`, which names neither this plugin nor the file —
 * it was called here once and cost a prebuild in the middle of an upload.
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
    // Beside `Expo.plist` rather than beside `AppDelegate.swift`, because the
    // `Supporting` group is the one with a `path` of its own: a file reference
    // added under it resolves against `<project>/Supporting`, which is where
    // the file actually is. The app's own group carries no path, so the same
    // reference hung there points at `ios/` and the build copies nothing.
    const supporting = path.join(root, name, 'Supporting');

    for (const [language, strings] of Object.entries(TRANSLATIONS)) {
      const dir = path.join(supporting, `${language}.lproj`);
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
      // One group per `.lproj`, which is how Xcode itself models a localised
      // resource and what `addResourceFileToGroup` expects to be handed.
      const groupName = `${name}/Supporting/${language}.lproj`;
      const group = IOSConfig.XcodeUtils.ensureGroupRecursively(
        xcode.modResults,
        groupName
      );
      // Idempotent: prebuild runs this against a tree that may already have
      // it, and a second entry is a duplicate-resource build warning. Every
      // language's file is called `InfoPlist.strings`, so the test has to be
      // per-group — a search of the whole project finds the first language's
      // and silently skips the rest.
      const listed = (group?.children ?? []).some(
        (child) => child.comment === 'InfoPlist.strings'
      );
      if (!listed) {
        xcode.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: `${language}.lproj/InfoPlist.strings`,
          groupName,
          project: xcode.modResults,
          // Without this the reference exists and no build phase copies it,
          // which is the failure that looks exactly like the plugin not
          // having run.
          isBuildFile: true,
        });
      }
    }
    return xcode;
  });
};

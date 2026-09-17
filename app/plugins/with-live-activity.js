const fs = require('node:fs');
const path = require('node:path');
const {
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

/**
 * Adds the widget extension that draws the lock screen card.
 *
 * **This exists because `expo prebuild` cannot produce a second target.** A
 * Live Activity is drawn by a widget extension and by nothing else, an
 * extension is an Xcode target, and `app.json` has no vocabulary for one — so
 * the target has to be written into the project after it is generated, every
 * time it is generated. That is the whole job here, and it is why this plugin
 * is longer than `with-google-services.js` by an order of magnitude.
 *
 * What it does, in order:
 *
 * 1. `NSSupportsLiveActivities` on the app, without which ActivityKit refuses
 *    every request and says nothing about why.
 * 2. Copies `targets/lock-screen/` into `ios/LockScreenWidget/`. The sources
 *    are kept outside `ios/` because `ios/` is generated and gitignored —
 *    hand-written Swift in there is deleted by the next `prebuild --clean`,
 *    and this project has already paid for that lesson once with a local
 *    module's native half. See the `.gitignore` entry that un-ignores a local
 *    module's own `ios` directory.
 * 3. Adds the extension target, its sources, and the embed phase.
 * 4. Adds the **two shared files** to the *app* target as well. This is the
 *    subtle half: `FloorActivityAttributes` must be the same type in both
 *    binaries or ActivityKit matches nothing, and `ToggleMuteIntent` must be
 *    in the app because that is where a `LiveActivityIntent` is performed.
 * 5. Registers the controller from `AppDelegate`.
 *
 * **`LOCKSCREEN_WIDGET_EXTENSION` is set on the extension and nowhere else.**
 * It is what compiles the intent's body out of the copy that cannot see the
 * pod. `canImport` was the obvious guard and answers the wrong question — see
 * `ToggleMuteIntent.swift`.
 */

/** The target, its directory under `ios/`, and its bundle id suffix. */
const TARGET = 'LockScreenWidget';

/**
 * Sources that belong to both binaries.
 *
 * Keep this list and the reasoning in `FloorActivityAttributes.swift` in step:
 * a file that moves between these two lists changes which process its code
 * runs in, which for the intent is the difference between reaching the room
 * and reaching nothing.
 */
const SHARED = ['FloorActivityAttributes.swift', 'ToggleMuteIntent.swift'];

/** App target only: it imports the pod, which the extension must not. */
const APP_ONLY = ['LockScreenController.swift'];

/** Extension target only: SwiftUI, which the app never draws. */
const WIDGET_ONLY = [
  'LockScreenLiveActivity.swift',
  'LockScreenWidgetBundle.swift',
];

function withLiveActivityPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    return cfg;
  });
}

/**
 * Copies the hand-written Swift into the generated project.
 *
 * `prebuild --clean` wipes `ios/` and this runs again after it, so the copy is
 * unconditional and overwrites: the tree under `targets/` is the source of
 * truth and anything edited inside `ios/` is scratch that the next prebuild
 * discards. A reader who fixes a bug in `ios/LockScreenWidget/` and watches it
 * vanish is meeting exactly this line.
 */
function withCopiedSources(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const from = path.join(cfg.modRequest.projectRoot, 'targets/lock-screen');
      const to = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(to, { recursive: true });
      for (const file of [...SHARED, ...APP_ONLY, ...WIDGET_ONLY]) {
        fs.copyFileSync(path.join(from, file), path.join(to, file));
      }
      // Named for the default `INFOPLIST_FILE` that `xcode`'s `addTarget`
      // writes, so the setting does not have to be corrected afterwards.
      fs.copyFileSync(
        path.join(from, 'Info.plist'),
        path.join(to, `${TARGET}-Info.plist`)
      );
      return cfg;
    },
  ]);
}

function withWidgetTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // Idempotent: `prebuild` without `--clean` runs the mods against a project
    // that may already carry the target, and adding it twice produces a
    // project Xcode opens and cannot build.
    if (project.pbxTargetByName(TARGET)) return cfg;

    const appTarget = project.getFirstTarget();
    const bundleId = `${cfg.ios.bundleIdentifier}.${TARGET}`;

    const group = project.addPbxGroup(
      [...SHARED, ...APP_ONLY, ...WIDGET_ONLY, `${TARGET}-Info.plist`],
      TARGET,
      TARGET
    );
    // Hang it off the project's root group so the files are reachable in
    // Xcode's navigator. Without this they build and are invisible, which is
    // its own kind of trap for whoever opens the project to look.
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      if (
        typeof groups[key] === 'object' &&
        groups[key].name === undefined &&
        groups[key].path === undefined &&
        groups[key].isa === 'PBXGroup'
      ) {
        groups[key].children.push({ value: group.uuid, comment: TARGET });
        break;
      }
    }

    const target = project.addTarget(TARGET, 'app_extension', TARGET, bundleId);

    project.addBuildPhase(
      [...SHARED, ...WIDGET_ONLY],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid
    );
    project.addBuildPhase(
      [],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      target.uuid
    );
    // So the app cannot be built without an up-to-date extension inside it.
    project.addTargetDependency(appTarget.uuid, [target.uuid]);

    /**
     * The app's own copy of the shared files.
     *
     * `addSourceFile` against the app target's sources phase, which is what
     * gives `FloorActivityAttributes` its second target membership. Without
     * this the app would not compile `LockScreenController`, and with a third
     * copy in the pod instead the widget would draw nothing while the app
     * reported success.
     */
    addToSources(project, appTarget.uuid, group.uuid, [...SHARED, ...APP_ONLY]);

    const appSettings = buildSettingsOf(project, appTarget.uuid);
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== 'object' || !entry.buildSettings) continue;
      if (entry.buildSettings.PRODUCT_NAME !== `"${TARGET}"`) continue;
      Object.assign(entry.buildSettings, {
        // Later than the app's 15.1, which an extension is allowed to be —
        // `LockScreenWidgetBundle.swift` says why it is worth it.
        IPHONEOS_DEPLOYMENT_TARGET: '16.1',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        // The flag that compiles the intent's body out of this target.
        SWIFT_ACTIVE_COMPILATION_CONDITIONS:
          '"$(inherited) LOCKSCREEN_WIDGET_EXTENSION"',
        INFOPLIST_FILE: `"${TARGET}/${TARGET}-Info.plist"`,
        GENERATE_INFOPLIST_FILE: 'NO',
        CODE_SIGN_STYLE: 'Automatic',
        // **Read from the Expo config, not from the app target.** Expo writes
        // the version and build number literally into the app's own
        // `Info.plist` and leaves the pbxproj at Xcode's template defaults of
        // `1.0` and `1` — so copying the app's build settings copied those
        // defaults, and every upload drew a 90473 CFBundleVersion mismatch
        // warning with the widget reporting `1.0 (1)` inside a `1.5.3 (222)`
        // app. Apple accepted it; crash reports did not agree with it.
        CURRENT_PROJECT_VERSION: `"${cfg.ios.buildNumber}"`,
        MARKETING_VERSION: `"${cfg.version}"`,
        // **The one setting that silently produces an unsignable archive.**
        // `prebuild --clean` drops `DEVELOPMENT_TEAM` from the app target —
        // planning/RELEASING.md carries that trap — and an extension without
        // one fails at export rather than at build, hours later. Copied from
        // the app so the two can never disagree, and absent when the app is
        // itself unset, which is the state a fresh prebuild leaves.
        ...(appSettings.DEVELOPMENT_TEAM
          ? { DEVELOPMENT_TEAM: appSettings.DEVELOPMENT_TEAM }
          : {}),
      });
    }

    return cfg;
  });
}

/**
 * Gives a target a second membership in files that already have references.
 *
 * **`addSourceFile` cannot do this, and fails silently when asked to.** It
 * calls `addFile`, which opens with `if (this.hasFile(file.path)) return null`
 * — so once `addPbxGroup` has created a reference for `Foo.swift`, every later
 * `addSourceFile('Foo.swift', …)` returns false and adds nothing at all. No
 * throw, no warning; the target simply comes out missing the file, and the
 * first sign of it is `cannot find 'LockScreenController' in scope` from a
 * Swift file that is looking straight at it.
 *
 * Working around that by passing a different *spelling* of the same path —
 * `LockScreenWidget/Foo.swift` — does defeat `hasFile`, and produces a second
 * reference resolved relative to a group that already carries that directory:
 * `LockScreenWidget/LockScreenWidget/Foo.swift`, which does not exist. Both
 * failures were met in that order on 2026-09-17.
 *
 * So this adds a `PBXBuildFile` against the reference that is already there,
 * which is what a second target membership actually is in this file format.
 */
function addToSources(project, targetUuid, groupUuid, fileNames) {
  const phase = project.pbxSourcesBuildPhaseObj(targetUuid);
  const buildFiles = project.pbxBuildFileSection();
  const children = project.getPBXGroupByKey(groupUuid).children;
  for (const name of fileNames) {
    const child = children.find((entry) => entry.comment === name);
    if (!child) {
      throw new Error(
        `with-live-activity: ${name} is missing from the ${TARGET} group.`
      );
    }
    const uuid = project.generateUuid();
    buildFiles[uuid] = {
      isa: 'PBXBuildFile',
      fileRef: child.value,
      fileRef_comment: name,
    };
    buildFiles[`${uuid}_comment`] = `${name} in Sources`;
    phase.files.push({ value: uuid, comment: `${name} in Sources` });
  }
}

/** The app target's settings, read from its Release configuration. */
function buildSettingsOf(project, targetUuid) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const lists = project.pbxXCConfigurationList();
  const list = lists[target.buildConfigurationList];
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const ref of list.buildConfigurations) {
    const entry = configurations[ref.value];
    if (entry && entry.name === 'Release') return entry.buildSettings ?? {};
  }
  return {};
}

/**
 * One line in `AppDelegate`, handing the controller to the pod.
 *
 * At launch rather than lazily, because the first thing that would trigger a
 * lazy registration is a `show()` from JavaScript — and a `show()` arriving
 * before the host exists is dropped, not queued. See
 * `LockScreenController.register`.
 */
function withRegistration(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') return cfg;
    if (cfg.modResults.contents.includes('LockScreenController.register()')) {
      return cfg;
    }
    /**
     * The first line of `didFinishLaunchingWithOptions`, matched rather than
     * its signature — which Expo writes across four lines and reformats
     * between SDKs. This string is the body's own first statement and has been
     * stable across every template this project has seen.
     */
    const anchor = 'let delegate = ReactNativeDelegate()';
    if (!cfg.modResults.contents.includes(anchor)) {
      /**
       * **Loudly, unlike `with-google-services`, and the difference is the
       * kind of failure.** A missing `google-services.json` is an absent
       * optional credential and building without it is correct. A missing
       * anchor is a template that has moved: the registration would silently
       * not happen, `LiveActivityModule.host` would stay nil, every `show`
       * would answer false, and the card would simply never appear with
       * nothing anywhere saying why. Failing the prebuild puts that discovery
       * at the moment it is cheap.
       */
      throw new Error(
        'with-live-activity: could not find the AppDelegate launch anchor. ' +
          'The Expo template has changed; update the anchor in ' +
          'plugins/with-live-activity.js.'
      );
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      anchor,
      `LockScreenController.register()\n    ${anchor}`
    );
    return cfg;
  });
}

module.exports = function withLiveActivity(config) {
  return withRegistration(
    withWidgetTarget(withCopiedSources(withLiveActivityPlist(config)))
  );
};

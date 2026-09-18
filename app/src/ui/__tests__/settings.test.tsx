import React from "react";
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { HomeView } from "../HomeView";
import { HomeSettingsView } from "../HomeSettingsView";
import { SupportView } from "../SupportView";
import { LeaderboardView } from "../LeaderboardView";
import { SectionLabel } from "../components";
import { Alert, StyleSheet } from "react-native";
import { chimeIn, warmChimes } from "../../audio/chime";
import {
  NOW,
  findButton,
  homeNav,
  labelOf,
  mockApp,
  render,
  resetHarness,
  textOf,
} from "../testing/harness";

/**
 * The three module mocks. They live in each test file rather than in the
 * harness because `jest.mock` is hoisted above the imports of its own file and
 * of no other — `testing/harness` holds the factories, and the single copy of
 * the state they close over.
 */
jest.mock("../../api/download", () =>
  require("../testing/harness").downloadMock(),
);
jest.mock("../../api/upload", () => require("../testing/harness").uploadMock());
jest.mock("../../state/AppProvider", () =>
  require("../testing/harness").appProviderMock(),
);
/**
 * The fourth, and the only one that is not a harness factory: the chime is a
 * native sound with nothing under it in jest, and this screen played one on a
 * tap for the day the loudness ladder was on it. **Kept after the ladder
 * went**, because the assertion that is left is that this screen makes no
 * noise at all — which needs something to watch.
 */
jest.mock("../../audio/chime", () => ({
  chimeIn: jest.fn(),
  warmChimes: jest.fn(),
}));

/**
 * Settings and what is reached from it: the three preferences, the privacy
 * link, deleting the account, and Support with the standings.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

/**
 * The resting background of a labelled button, which is how these three
 * settings say which option is in force — there is no other mark on the row.
 * `pressed: false` because `style` is a function here: what a test means is
 * the untouched state, not the one under a finger.
 */
const styleOf = (tree: ReactTestRenderer, label: string) =>
  StyleSheet.flatten(
    findButton(tree, label)!.props.style({ pressed: false }),
  ) as { backgroundColor?: unknown };

beforeEach(resetHarness);

describe("Home settings", () => {
  /** The view fetches on mount, so every case has to let that settle. */
  async function openSettings() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  }

  /**
   * The privacy policy, which Guideline 5.1.1(i) requires to be reachable from
   * inside the application and not only from the App Store listing.
   *
   * The page itself is the server's, and tested there. What is asserted here is
   * that there is a way to it, and that it points at the server actually
   * holding the data rather than at a URL somebody typed into the app.
   */
  describe("the privacy policy link", () => {
    it("is offered on the settings screen", async () => {
      // That it points at *this* app's server is asserted in
      // privacyLink.test.tsx, which needs the address configured at import time
      // and so cannot share this file's module registry.
      const tree = await openSettings();
      expect(findButton(tree, "Privacy policy")).toBeDefined();
      act(() => tree.unmount());
    });

    it("says so rather than opening nothing when there is no server", async () => {
      // Which is the case here: these tests run with no EXPO_PUBLIC_API_URL,
      // the same state a development build with no `app/.env` is in.
      const { Linking } = require("react-native");
      const opened = jest
        .spyOn(Linking, "openURL")
        .mockResolvedValue(undefined as never);

      const tree = await openSettings();
      await act(async () =>
        findButton(tree, "Privacy policy")!.props.onPress(),
      );

      expect(opened).not.toHaveBeenCalled();
      expect(textOf(tree)).toContain("No server configured");

      opened.mockRestore();
      act(() => tree.unmount());
    });
  });

  /**
   * Deleting the account, which App Store Guideline 5.1.1(v) requires to be
   * reachable from inside the application rather than by writing to anybody.
   *
   * What is asserted here is the shape of the offer — findable on the settings
   * screen, asked about before it happens, and honest about what it takes — not
   * what the server does with it, which is the server's own test.
   */
  describe("deleting the account", () => {
    const alertSpy = () => {
      const { Alert } = require("react-native");
      return jest.spyOn(Alert, "alert").mockImplementation(() => {});
    };

    it("is offered on the same screen as signing out", async () => {
      const tree = await openSettings();
      expect(findButton(tree, "Delete account")).toBeDefined();
      expect(findButton(tree, "Sign out")).toBeDefined();
      act(() => tree.unmount());
    });

    it("asks first, and says what it does not take", async () => {
      const asked = alertSpy();
      const tree = await openSettings();

      act(() => findButton(tree, "Delete account")!.props.onPress());
      expect(asked).toHaveBeenCalled();
      expect(mockApp.deleteAccount).not.toHaveBeenCalled();

      // The part nobody would guess: a channel is not yours to take with you.
      // "This cannot be undone" alone would be true and useless.
      const body = asked.mock.calls[0][1] as string;
      expect(body).toContain("carry on without you");
      expect(body).toContain("cannot be undone");

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it("does it when the destructive choice is taken", async () => {
      const asked = alertSpy();
      const tree = await openSettings();
      act(() => findButton(tree, "Delete account")!.props.onPress());

      const actions = asked.mock.calls[0][2] as Array<{
        style?: string;
        onPress?: () => void;
      }>;
      await act(async () =>
        actions.find((a) => a.style === "destructive")!.onPress!(),
      );
      expect(mockApp.deleteAccount).toHaveBeenCalled();

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it("stays put and says so when the server refused", async () => {
      // The failure that matters: a screen claiming the account is gone while
      // the server still has one would leave nobody able to try again.
      const asked = alertSpy();
      mockApp.deleteAccount.mockRejectedValueOnce(
        new Error("server said no") as never,
      );
      const tree = await openSettings();
      act(() => findButton(tree, "Delete account")!.props.onPress());

      const actions = asked.mock.calls[0][2] as Array<{
        style?: string;
        onPress?: () => void;
      }>;
      await act(async () =>
        actions.find((a) => a.style === "destructive")!.onPress!(),
      );
      expect(textOf(tree)).toContain("server said no");
      expect(findButton(tree, "Delete account")).toBeDefined();

      asked.mockRestore();
      act(() => tree.unmount());
    });
  });

  it("holds signing out, which is no longer on Home", () => {
    // It sat in the header beside a dozen harmless taps. Here it is among the
    // other things that are about the account rather than about a channel.
    const tree = render(<HomeView {...homeNav} />);
    expect(findButton(tree, "Sign out")).toBeUndefined();
    act(() => tree.unmount());
  });

  it("signs out behind a confirmation", async () => {
    const tree = await openSettings();
    const signOut = findButton(tree, "Sign out");
    expect(signOut).toBeDefined();
    act(() => signOut!.props.onPress());
    // The alert carries it; the tap alone must not.
    expect(mockApp.signOut).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("opens from Home", () => {
    const onOpenSettings = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
    };
    const tree = render(
      <HomeView {...homeNav} onOpenSettings={onOpenSettings} />,
    );
    act(() => findButton(tree, "Settings")!.props.onPress());
    expect(onOpenSettings).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

/*
  `describe("the control-cards setting")` was here and went on 2026-09-13,
  with the setting itself. It asserted the three things every setting on this
  screen owes — both answers, a mark on the one in force, reporting a change
  upward — about "Hide the repeated channel controls", which switched off the
  channel screen's repetitions of its own footer.

  Those cards are deleted for everybody now, so the setting governed nothing
  and the screen no longer offers it. What it used to hide is asserted on the
  channel screen instead, which is where it always was: see
  `a channel screen that does not repeat its footer` in channelMembers.test.tsx.
  The wire field and the column survive, unread — see
  decisions/2026-09-13-the-cards-a-footer-made-redundant.md.
*/

/**
 * The gate over the experimental features.
 *
 * What the screen owes is the same three things every other setting here owes
 * — both answers, a mark on the one in force, and reporting a change upward —
 * plus one this one owes and the others do not: naming what appears. A switch
 * labelled only "experimental features" is one whose effect nobody can find
 * afterwards. What it *does* is asserted on the channel screen, which is where
 * the two features live.
 */
describe("the Labs setting", () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  /**
   * The second On/Off pair: the tap, then this. Positional, so it moves when
   * a setting is added or taken away above it — which has now happened three
   * times: the tabs arriving on 2026-09-12 and going on 2026-09-13, and the
   * repeated channel controls going the same day, which is what took this
   * from third to second. That is the whole of why the number is here rather
   * than buried in the expression below.
   */
  const labsButton = (tree: ReactTestRenderer, label: string) =>
    tree.root
      .findAll(
        (n) =>
          n.props?.accessibilityRole === "button" &&
          typeof n.props.onPress === "function",
      )
      .filter((n) => labelOf(n).includes(label))[1];

  /**
   * The heading, which names which of the two settings screens this is.
   * A channel has one too, reached by an identical gear from an identical
   * header, and both said *Settings* until 2026-09-12.
   */
  it("says whose settings these are", async () => {
    const tree = await openSettings();
    expect(textOf(tree)).toContain("Floor Settings");
    act(() => tree.unmount());
  });

  /**
   * One thing, not two: watching a video together left Labs on 2026-09-18 and
   * the card must stop naming it, a switch that promises something it does not
   * turn on being worse than one that promises nothing.
   */
  it("names the thing it turns on", async () => {
    const tree = await openSettings();
    const text = textOf(tree);
    expect(text).toContain("Show experimental features");
    expect(text).toContain("transcripts");
    expect(text).not.toContain("watching a video together");
    // And that it is nobody else's business, which is the question anybody
    // sharing a channel asks next.
    expect(text).toContain("not to anybody else");
    act(() => tree.unmount());
  });

  it("reports a change rather than keeping it", async () => {
    const tree = await openSettings();
    act(() => labsButton(tree, "On").props.onPress());
    expect(mockApp.setLabs).toHaveBeenCalledWith(true);
    expect(mockApp.setTapToLook).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * Which one is marked rather than merely that they differ, because the
   * default is the whole point of this setting: an account that has never
   * asked has to see Off in force. The tap's Off is the yardstick — since
   * 2026-09-07 every setting on this screen is named for the departure from
   * what an untouched account gets, so Off is in force on all three and they
   * carry the same mark.
   */
  it("marks Off in force for somebody who has never asked", async () => {
    const tree = await openSettings();
    const styleFor = (node: ReactTestInstance) =>
      StyleSheet.flatten(node.props.style({ pressed: false })) as {
        backgroundColor?: unknown;
      };
    expect(styleFor(labsButton(tree, "Off")).backgroundColor).not.toBe(
      styleFor(labsButton(tree, "On")).backgroundColor,
    );
    expect(styleFor(labsButton(tree, "Off")).backgroundColor).toBe(
      styleFor(findButton(tree, "Off")!).backgroundColor,
    );
    act(() => tree.unmount());
  });
});

/**
 * Where sound comes out, which is this phone's business and not a channel's.
 *
 * **On this screen since 2026-09-17**, having been on Channel Settings since
 * it was built. Nothing about it was ever per channel: the sheet is the system
 * sheet, and the route it sets is still in force in the next channel and after
 * the app is closed.
 *
 * Ours to place, not ours to build: iOS knows what is connected and this app
 * cannot — nothing in the audio stack tells JavaScript what outputs exist. So
 * the button raises the system sheet and nothing more, which is the whole of
 * what there is to assert.
 */
describe("the output picker", () => {
  it("opens the system output picker", async () => {
    const { AudioSession } = require("@livekit/react-native");
    AudioSession.showAudioRoutePicker.mockClear();

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });

    const picker = findButton(tree, "Choose where sound comes out");
    expect(picker).toBeDefined();
    await act(async () => picker!.props.onPress());
    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

/**
 * The chimes have no setting on this screen, and had one for a day.
 *
 * A *Sounds* section offered five rungs on 2026-09-15 and was withdrawn the
 * same day: a phone heard all five as much the same, the alert path taking no
 * gain, so the app plays at one constant — `CHIME_AMPLITUDE` in the
 * audio-route module. This is the assertion that the screen went with it, and
 * that nothing on it makes a noise. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 */
describe("how loud the chimes are", () => {
  it("offers no loudness and sounds nothing", async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    const text = textOf(tree);
    expect(text).not.toContain("How loud the channel chimes are");
    for (const word of ["Quietest", "Quiet", "Middle", "Loud", "Loudest"]) {
      expect(findButton(tree, word)).toBeFalsy();
    }
    expect(chimeIn).not.toHaveBeenCalled();
    expect(warmChimes).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

/**
 * Making this phone forget it has ever run the app.
 *
 * It exists because iOS gives no other way: the keychain outlives the app that
 * wrote it, so deleting and reinstalling comes back signed in and still
 * remembering having been asked about notifications.
 *
 * **Behind `debug`, which the server grants per account, rather than behind
 * Labs, which anybody may switch on.** Labs promises unfinished features; this
 * is an instrument, useless to somebody using the app, and *forget everything*
 * does not belong one tap from a switch people are invited to flip.
 */
describe("forgetting this phone", () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  const alertSpy = () =>
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

  it("is not offered to an account without diagnostics", async () => {
    mockApp.debug = false;
    const tree = await openSettings();
    expect(findButton(tree, "Forget this phone")).toBeUndefined();
    act(() => tree.unmount());
  });

  it("asks first, and says what it cannot do", async () => {
    mockApp.debug = true;
    const asked = alertSpy();
    const tree = await openSettings();

    act(() => findButton(tree, "Forget this phone")!.props.onPress());
    expect(asked).toHaveBeenCalled();
    expect(mockApp.signOut).not.toHaveBeenCalled();

    // The half it cannot reach, and the order that follows from it: the
    // notification permission is the system's, and only deleting the app
    // clears it. Somebody who does this and then expects a fresh prompt
    // without reinstalling has wasted an afternoon.
    const body = asked.mock.calls[0][1] as string;
    expect(body).toContain("Delete the app afterwards");

    asked.mockRestore();
    act(() => tree.unmount());
  });

  /**
   * Signing out first is load-bearing rather than tidy: that request carries
   * this phone's push address so the server drops the row, and it needs the
   * token the next line deletes.
   */
  it("signs out before it forgets the token", async () => {
    mockApp.debug = true;
    const asked = alertSpy();
    const tree = await openSettings();
    act(() => findButton(tree, "Forget this phone")!.props.onPress());

    const actions = asked.mock.calls[0][2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    await act(async () =>
      actions.find((a) => a.style === "destructive")!.onPress!(),
    );
    expect(mockApp.signOut).toHaveBeenCalled();

    asked.mockRestore();
    act(() => tree.unmount());
  });
});

/**
 * Putting the introduction back, which is the narrow sibling of the card
 * above and, since 2026-09-14, the only one of the two that is not an
 * instrument.
 *
 * It was behind the same `debug` grant and is offered to every account now:
 * a rung put away with the cross is a decision somebody is allowed to
 * reverse, and nothing else in the app reverses it. What it must not do is
 * what its neighbour does — this one leaves the session alone, and a version
 * that signed out would make the checklist cost a code by email to look at.
 */
describe("showing the checklist again", () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  const alertSpy = () =>
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

  // The gate this used to assert, inverted. An account without `debug` sees
  // *Forget this phone* nowhere and this everywhere; the two cards sat under
  // one grant and no longer do.
  it("is offered to an account without diagnostics", async () => {
    mockApp.debug = false;
    const tree = await openSettings();
    expect(findButton(tree, "Show the checklist again")).toBeDefined();
    expect(findButton(tree, "Forget this phone")).toBeUndefined();
    act(() => tree.unmount());
  });

  it("asks first, and says to step out of the channel", async () => {
    mockApp.debug = false;
    const asked = alertSpy();
    const tree = await openSettings();

    act(() => findButton(tree, "Show the checklist again")!.props.onPress());
    expect(asked).toHaveBeenCalled();
    expect(mockApp.forgetIntroduction).not.toHaveBeenCalled();

    // The one thing that is not guessable from the button: `doneAt` is
    // written off `conversing`, so doing this from inside a channel with
    // somebody re-ticks that rung before the list can be looked at.
    const body = asked.mock.calls[0][1] as string;
    expect(body).toContain("Step out of any channel first");

    asked.mockRestore();
    act(() => tree.unmount());
  });

  it("forgets the introduction and nothing else", async () => {
    mockApp.debug = false;
    const asked = alertSpy();
    const tree = await openSettings();
    act(() => findButton(tree, "Show the checklist again")!.props.onPress());

    const actions = asked.mock.calls[0][2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    await act(async () =>
      actions.find((a) => a.style !== "cancel")!.onPress!(),
    );
    expect(mockApp.forgetIntroduction).toHaveBeenCalled();
    expect(mockApp.signOut).not.toHaveBeenCalled();

    asked.mockRestore();
    act(() => tree.unmount());
  });
});

/**
 * The button that draws every dab, so that the mark can be looked at.
 *
 * **Behind the same `debug` grant as *Forget this phone*, and for the same
 * reason**: it is an instrument, it is useless to somebody using the app, and
 * a switch that makes the interface ask for attention it does not want is one
 * that costs these marks the only thing they trade on. It exists because the
 * two states that draw a dab are a nuisance to arrange — a second account has
 * to ask to be a contact, an answer has to be published by hand — so the mark
 * itself was the part nobody could put on a screen.
 *
 * What it does to Home is in `home.test.tsx`; this is the gate and the toggle.
 */
describe("showing every dab", () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it("is not offered to an account without diagnostics", async () => {
    mockApp.debug = false;
    const tree = await openSettings();
    expect(findButton(tree, "Show every dab")).toBeUndefined();
    act(() => tree.unmount());
  });

  it("turns the override on", async () => {
    mockApp.debug = true;
    const tree = await openSettings();
    act(() => findButton(tree, "Show every dab")!.props.onPress());
    expect(mockApp.forceDabs).toHaveBeenCalledWith(true);
    act(() => tree.unmount());
  });

  /**
   * And off again from the same button, which is the whole of why it is a
   * toggle: a control that could only switch marks on would leave somebody
   * looking at them until they relaunched.
   */
  it("turns it off again, saying so on the label", async () => {
    mockApp.debug = true;
    mockApp.forcedDabs = true;
    const tree = await openSettings();
    act(() => findButton(tree, "Stop showing every dab")!.props.onPress());
    expect(mockApp.forceDabs).toHaveBeenCalledWith(false);
    act(() => tree.unmount());
  });
});

/**
 * Whether a tap on a channel arrives or only looks.
 *
 * The setting itself is a phone preference held in the provider; what this
 * screen owes is the two choices, a mark on the one in force, and reporting a
 * change upward. What the choice *does* is asserted on Home and in the
 * channel, which are the two screens it changes.
 */

describe("the stepping-in setting", () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it("offers both answers and says what each means", async () => {
    const tree = await openSettings();
    expect(textOf(tree)).toContain("Tap a channel to look, not step in");
    expect(findButton(tree, "On")).toBeDefined();
    expect(findButton(tree, "Off")).toBeDefined();
    expect(textOf(tree)).toContain("everyone there can hear you");
    act(() => tree.unmount());
  });

  it("reports a change rather than keeping it", async () => {
    const tree = await openSettings();
    act(() => findButton(tree, "Off")!.props.onPress());
    expect(mockApp.setTapToLook).toHaveBeenCalledWith(false);
    act(() => tree.unmount());
  });

  it("marks which one is in force", async () => {
    mockApp.tapToLook = true;
    const tree = await openSettings();
    // Button's style is a function of press state, not an array.
    expect(styleOf(tree, "Off").backgroundColor).not.toBe(
      styleOf(tree, "On").backgroundColor,
    );
    act(() => tree.unmount());
  });
});

/**
 * Choosing a colour scheme.
 *
 * What the choice *looks* like cannot be asserted here — the colours resolve
 * in UIKit, below anything JavaScript observes. What can be asserted is that
 * the screen offers the three choices, marks the current one, and reports a
 * change upward rather than keeping it to itself.
 */

describe("the appearance setting", () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it("offers light, dark and following the phone", async () => {
    const tree = await openSettings();
    expect(findButton(tree, "Light")).toBeDefined();
    expect(findButton(tree, "Dark")).toBeDefined();
    expect(findButton(tree, "System")).toBeDefined();
    act(() => tree.unmount());
  });

  it("reports a choice rather than keeping it", async () => {
    const tree = await openSettings();
    act(() => findButton(tree, "Light")!.props.onPress());
    expect(mockApp.setAppearance).toHaveBeenCalledWith("light");
    act(() => tree.unmount());
  });

  it("marks which one is in force", async () => {
    // Three buttons that all look alike would leave the current scheme
    // guessable only by looking at the screen it is describing.
    mockApp.appearance = "dark";
    const tree = await openSettings();
    // Button's style is a function of press state, not an array.
    expect(styleOf(tree, "Dark").backgroundColor).not.toBe(
      styleOf(tree, "Light").backgroundColor,
    );
    expect(styleOf(tree, "Light").backgroundColor).toBe(
      styleOf(tree, "System").backgroundColor,
    );
    act(() => tree.unmount());
  });
});

/**
 * Where somebody is, which decides whether to try them at all.
 *
 * It lived on Home's contact rows until Home became a list of channels and
 * those rows went. Moved rather than deleted: the server still composes it —
 * `ContactView` carries it untouched — and it is shown here, to contacts
 * alone, which is exactly the audience that could see it before.
 */

describe("Support", () => {
  /** Both screens fetch on mount, so every case has to let that settle. */
  async function open(element: React.ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  /** The headings a tree draws, in order — see the case that asks for them. */
  const sectionLabels = (tree: ReactTestRenderer): string[] =>
    tree.root
      .findAll((node) => node.type === SectionLabel)
      .map((node) => String(node.props.children));

  /**
   * The tier with its third body showing, which is where every row below
   * lives. They were the tail of whichever list was up until the Support tab
   * arrived; what each of them asserts is unchanged by the move, so the tab is
   * set here once rather than at each call.
   */
  const home = () => open(<HomeView {...homeNav} list="support" />);

  it("offers a way in from Home, and nothing more than that", async () => {
    const tree = await home();
    expect(findButton(tree, "Chip in")).toBeTruthy();
    // The card says what the money is for, since a button with no sentence
    // under it is the thing the section labels were removed in favour of.
    expect(textOf(tree)).toContain("cost money every month");
    // The *case* for giving still belongs on the screen behind this, not on
    // the tab somebody is passing through.
    expect(textOf(tree)).not.toContain("unlocks nothing");
    act(() => tree.unmount());
  });

  /**
   * What replaced the two headings. *Support* as a heading inside a tab
   * called Support labelled the screen with its own name, and neither
   * heading could say what the button under it did — so both went, and every
   * card carries a line instead.
   */
  it("heads nothing, and explains every card it draws", async () => {
    const tree = await open(
      <HomeView
        {...homeNav}
        list="support"
        onOpenLeaderboard={() => {}}
        onOpenAudioLab={() => {}}
      />,
    );
    expect(sectionLabels(tree)).toEqual([]);
    const text = textOf(tree);
    expect(text).toContain("A person reads it and writes back");
    expect(text).toContain("cost money every month");
    expect(text).toContain("brought the most people");
    expect(text).toContain("bench for the iOS audio session");
    act(() => tree.unmount());
  });

  it("opens the screen rather than the browser", async () => {
    const opened = jest.fn();
    const tree = await open(
      <HomeView {...homeNav} list="support" onOpenSupport={opened} />,
    );
    act(() => findButton(tree, "Chip in")!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("says nothing on Home when there is nowhere to give", async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: "me@example.com",
      mine: null,
    });
    const tree = await home();
    expect(findButton(tree, "Chip in")).toBeUndefined();
    // Nor the line that explains it, which is the thing a heading over
    // nothing used to be. The tab drew *Support* over an empty group once;
    // there are no headings on it at all now, and the guard is that the card
    // and its sentence leave together.
    expect(textOf(tree)).not.toContain("cost money every month");
    act(() => tree.unmount());
  });

  it("leaves Home alone when support cannot be read at all", async () => {
    // An older server, or one that fails. Home is what somebody opened the app
    // for and must not wait on, or break with, an extra fetch — so the tier
    // still draws, on the tab that fetch is for as well as on the lists.
    mockApp.loadSupport.mockRejectedValueOnce(new Error("nope"));
    const tree = await home();
    expect(findButton(tree, "Chip in")).toBeUndefined();
    expect(findButton(tree, "Help")).toBeTruthy();
    act(() => tree.unmount());

    mockApp.loadSupport.mockRejectedValueOnce(new Error("nope"));
    const channels = await open(<HomeView {...homeNav} />);
    expect(textOf(channels)).toContain("Start a channel");
    act(() => channels.unmount());
  });

  it("makes the case on its own screen, and names the address", async () => {
    const tree = await open(<SupportView onBack={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain("costs money every month");
    expect(text).toContain("unlocks nothing");
    // The address is the whole of how a donation finds its way back to an
    // account, so the screen has to name it.
    expect(text).toContain("me@example.com");
    expect(findButton(tree, "Chip in")).toBeTruthy();
    act(() => tree.unmount());
  });

  it("thanks somebody who has already given, in their own currencies", async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: "https://ko-fi.com/thefloor",
      identifier: "me@example.com",
      mine: {
        count: 2,
        since: NOW,
        totals: [
          { currency: "EUR", cents: 1000 },
          { currency: "USD", cents: 300 },
        ],
      },
    });
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(textOf(tree)).toContain("€10.00 and $3.00");
    act(() => tree.unmount());
  });

  it("says so plainly when there is nowhere to give", async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: "me@example.com",
      mine: null,
    });
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(findButton(tree, "Chip in")).toBeUndefined();
    expect(textOf(tree)).toContain("no way to give");
    act(() => tree.unmount());
  });

  /**
   * The way in to the standings, which sits on Home directly under Chip in.
   * Absent unless the account has been granted them, and nothing anywhere
   * says so.
   */
  it("offers the Leaderboard from Home only when there is a way in", async () => {
    const tree = await home();
    expect(findButton(tree, "Leaderboard")).toBeUndefined();
    act(() => tree.unmount());

    const opened = jest.fn();
    const granted = await open(
      <HomeView {...homeNav} list="support" onOpenLeaderboard={opened} />,
    );
    const button = findButton(granted, "Leaderboard");
    expect(button).toBeTruthy();
    act(() => button!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => granted.unmount());
  });

  /**
   * The two are independent: a server with nowhere to give still shows the
   * standings to an account granted them, and the section label survives for
   * it alone.
   */
  it("keeps the Leaderboard when there is nowhere to give", async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: "me@example.com",
      mine: null,
    });
    const tree = await open(
      <HomeView {...homeNav} list="support" onOpenLeaderboard={() => {}} />,
    );
    expect(findButton(tree, "Chip in")).toBeUndefined();
    expect(findButton(tree, "Leaderboard")).toBeTruthy();
    act(() => tree.unmount());
  });

  it("says nothing about the standings on the Support screen", async () => {
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(findButton(tree, "Leaderboard")).toBeUndefined();
    expect(findButton(tree, "Invitations")).toBeUndefined();
    act(() => tree.unmount());
  });
});

/**
 * The one screen that shows people who never agreed to be shown to you. There
 * is no way to ask for it and no setting that turns it on, so what this covers
 * is that it renders what it is given and says what the number means.
 */

describe("the invitation standings", () => {
  /** Renders and waits for the fetch, which lands in a microtask. */
  async function open(element: React.ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it("lists people in order, with what the number counts", async () => {
    const tree = await open(<LeaderboardView onBack={() => {}} />);

    const text = textOf(tree);
    expect(text).toContain("Ada");
    expect(text).toContain("Grace");
    expect(text.indexOf("Ada")).toBeLessThan(text.indexOf("Grace"));
    // Said once, because a reader will otherwise take it for invitations sent.
    expect(text).toContain("all the way down");
    act(() => tree.unmount());
  });

  it("says so plainly when nobody has invited anybody", async () => {
    mockApp.loadLeaderboard.mockResolvedValueOnce([]);
    const tree = await open(<LeaderboardView onBack={() => {}} />);
    expect(textOf(tree)).toContain("Nobody has brought anybody here yet");
    act(() => tree.unmount());
  });

  it("shows the refusal rather than an empty board", async () => {
    // A client that asked without the grant, or an older server. Either way
    // an empty list would be a claim, and this is not one.
    mockApp.loadLeaderboard.mockRejectedValueOnce(new Error("Not found."));
    const tree = await open(<LeaderboardView onBack={() => {}} />);
    expect(textOf(tree)).toContain("Not found.");
    act(() => tree.unmount());
  });
});

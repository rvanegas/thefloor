import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ClipboardPasteButton } from 'expo-clipboard';
import {
  pasteText,
  systemPasteAvailable,
  useClipboardHasPasteable,
} from '../clipboard';
import { useText } from '../i18n';
import { Button } from './components';
import { colors, spacing, type } from './theme';

/**
 * A button that takes whatever is on the clipboard, **without iOS asking
 * whether to allow it** wherever that can be avoided.
 *
 * Every read an app makes of the clipboard sets off the system's *Allow
 * Paste?* sheet — including one the person has just asked for by pressing a
 * button that says *paste* — because iOS cannot tell a button that means it
 * from a button that does not. What it can tell is its own control:
 * `UIPasteControl`, which `expo-clipboard` draws as `ClipboardPasteButton`.
 * A tap on that is the permission, so there is no sheet. Task `allow-paste`.
 *
 * **The price is that Apple draws it and nobody else.** The word is *Paste*
 * in the system's language, with the system's glyph; only its colours and the
 * shape of its corners can be set, and never through `style`. So the words
 * that would have been this button's label and sublabel are drawn beneath it
 * as a caption, and it takes the `default` or `primary` fill as colours
 * handed to the control rather than as a style. `colors.*` go across opaque —
 * the native side resolves `DynamicColorIOS` itself — which is what keeps
 * STYLE.md rule 2.
 *
 * **Everywhere else it is the ordinary `Button`**, pressing which calls
 * `pasteText` exactly as before: iOS 15, Android and the web, none of which
 * has the control. **And when it is disabled**, because the system control
 * has no refused state of its own — it greys only when the clipboard holds
 * nothing it accepts — and a control the state would overrule is drawn as
 * one that says so, not as a live one that does nothing (STYLE.md rule 9).
 *
 * **And when the clipboard holds nothing it takes**, since 2026-09-30. On a
 * device the control does not grey itself for that, as was assumed when it
 * went in: it draws nothing, and the caption sat under an empty slot. So the
 * clipboard is asked first — without being read, see
 * `useClipboardHasPasteable` — and an empty one gets the disabled `Button`
 * with `emptySublabel`, which says what to go and do rather than what the
 * press would have done.
 *
 * **And it is drawn afresh whenever the clipboard is asked again**, since
 * 2026-10-03: a control that has been to the background can come back drawing
 * nothing with text on the clipboard, until the app is killed. See
 * `useClipboardHasPasteable`.
 *
 * Either way the caller is handed the text, or null for nothing. An empty
 * clipboard is null through the fallback and cannot happen through the
 * control, which is not drawn for one.
 */
export function PasteButton({
  label,
  sublabel,
  emptySublabel,
  onPaste,
  disabled,
  variant = 'default',
  style,
}: {
  /** What the press does, in words. The caption under the system control. */
  label: string;
  sublabel?: string;
  /** The sublabel while the clipboard holds nothing to paste: what to copy. */
  emptySublabel?: string;
  onPaste: (text: string | null) => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
  style?: StyleProp<ViewStyle>;
}) {
  const shared = useText().shared;
  const system = systemPasteAvailable();
  const { pasteable, asked } = useClipboardHasPasteable(system && !disabled);
  const empty = pasteable === false;
  if (disabled || !system || empty) {
    return (
      <Button
        label={label}
        sublabel={
          empty && !disabled
            ? (emptySublabel ?? shared.copySomethingFirst())
            : sublabel
        }
        variant={variant}
        disabled={disabled || empty}
        style={style}
        onPress={() => void pasteText().then(onPaste)}
      />
    );
  }
  const primary = variant === 'primary';
  return (
    <View style={[styles.stack, style]}>
      <ClipboardPasteButton
        // A new control at every answer, never the one that went to the
        // background: that one can come back hidden for good. See
        // `useClipboardHasPasteable`.
        key={asked}
        // Text and links only: a link copied from YouTube's share sheet is a
        // URL on the pasteboard rather than a string, and the control stays
        // grey for anything it does not accept. Images are nothing any
        // caller here can use.
        acceptedContentTypes={['plain-text', 'url']}
        backgroundColor={(primary ? colors.text : colors.surfaceRaised) as string}
        foregroundColor={(primary ? colors.bg : colors.text) as string}
        // The nearest of Apple's corner styles to `radius.md`; the control
        // takes no number.
        cornerStyle="large"
        displayMode="iconAndLabel"
        style={styles.control}
        onPress={(data) =>
          onPaste(data.type === 'text' && data.text.length > 0 ? data.text : null)
        }
      />
      <Text style={styles.caption}>{label}</Text>
      {sublabel ? <Text style={styles.captionSub}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing(0.5) },
  // A height and a width are both required: without them the native view
  // lays out at zero and draws nothing. 48 is every filled button's minimum.
  control: { height: 48, alignSelf: 'stretch' },
  caption: { ...type.muted, color: colors.text, fontWeight: '600', textAlign: 'center' },
  captionSub: { ...type.muted, textAlign: 'center' },
});

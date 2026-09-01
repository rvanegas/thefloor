import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LIST_WIDTH, PaneContext, type Layout } from './layout';
import { colors, spacing, type } from './theme';

/**
 * A list beside the screen you are looking at — or, below the breakpoint, that
 * screen on its own, as a phone has always shown it.
 *
 * **Both arrangements are here, and that is the point of the component.**
 * Crossing the breakpoint is something that happens while somebody watches: a
 * rotation, or a window dragged wider beside another app. React reconciles by
 * position and by key, and it only preserves a subtree that stays at the same
 * place in the tree — so if the stacked layout rendered its screen directly
 * and the split one rendered it two Views down, every crossing would unmount
 * and remount it. `ChannelView` holds `viewing`, `settingsOpen`,
 * `transcriptFor` and every composer field in local state, so that costs an
 * open profile and a half-typed message, mid-drag, for no reason anybody could
 * see. The detail slot therefore sits at one fixed depth under one fixed key
 * in both modes, and only the list beside it comes and goes.
 *
 * The audio survives either way — the session hook is above all of this in
 * `Root` — which is precisely what would have made the loss quiet enough to
 * ship.
 *
 * **It reads nothing.** No hook, no app state; `Root` decides the mode and
 * hands both halves down. That is what makes it testable on its own.
 */
export function Panes({
  layout,
  list,
  detail,
}: {
  layout: Layout;
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  const split = layout === 'split';
  return (
    <View style={split ? styles.row : styles.fill}>
      {split ? (
        <View key="list" style={styles.list}>
          <PaneContext.Provider value="list">{list}</PaneContext.Provider>
        </View>
      ) : null}
      <View key="detail" style={styles.fill}>
        <PaneContext.Provider value={split ? 'detail' : null}>
          {detail}
        </PaneContext.Provider>
      </View>
    </View>
  );
}

/**
 * The right-hand pane with nothing in it.
 *
 * **Not a dead end, which is the only thing it has to get right.** The list
 * beside it is a live Home, so there is nothing to offer here and no button
 * worth putting on it: a control here would be a second way to do what the
 * pane to its left is already doing, in the half nobody is looking at.
 */
export function NoDetailView() {
  return (
    <View style={styles.empty}>
      <Text style={type.title}>The Floor</Text>
      <Text style={[type.muted, styles.emptyLine]}>
        Pick a conversation on the left, or start one.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  /**
   * Fixed rather than a fraction, so every point above the breakpoint goes to
   * the conversation. A list of channel names is the one thing on screen that
   * does not get better for being wider.
   */
  list: {
    width: LIST_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
  },
  emptyLine: { marginTop: spacing(1), textAlign: 'center' },
});

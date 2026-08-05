import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, type } from './theme';

export function Button({
  label,
  onPress,
  disabled,
  variant = 'default',
  sublabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'floor' | 'danger' | 'ghost';
  sublabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = {
    default: { bg: colors.surfaceRaised, fg: colors.text },
    primary: { bg: colors.text, fg: colors.bg },
    floor: { bg: colors.floor, fg: '#FFFFFF' },
    danger: { bg: colors.danger, fg: '#FFFFFF' },
    ghost: { bg: 'transparent', fg: colors.textMuted },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? colors.disabled : tone.bg },
        variant === 'ghost' && styles.buttonGhost,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: disabled ? colors.textFaint : tone.fg },
        ]}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text
          style={[
            styles.buttonSublabel,
            { color: disabled ? colors.textFaint : tone.fg },
          ]}
        >
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  autoCapitalize = 'none',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      style={styles.field}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={[type.label, styles.sectionLabel]}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={[type.muted, styles.empty]}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(2),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonGhost: { minHeight: 40 },
  pressed: { opacity: 0.7 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  buttonSublabel: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.85,
    fontVariant: ['tabular-nums'],
  },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.5),
    fontSize: 16,
    color: colors.text,
    minHeight: 48,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: spacing(0.75),
    marginTop: spacing(2),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
  },
  empty: { paddingVertical: spacing(2) },
});

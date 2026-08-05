import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { backend } from '../mock/backend';
import type { Account } from '../mock/types';
import { Button, Field } from './components';
import { colors, spacing, type } from './theme';

/**
 * Signed-out state. Identity is a phone number or email plus a one-time code —
 * no password. A display name is collected only when the account is new.
 */
export function AuthView({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [step, setStep] = useState<'identify' | 'verify'>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isNewAccount = step === 'verify' && !backend.findByIdentifier(identifier);

  function sendCode() {
    if (!identifier.trim()) {
      setError('Enter a phone number or email.');
      return;
    }
    backend.requestCode(identifier);
    setError(null);
    setStep('verify');
  }

  function verify() {
    if (!backend.isValidCode(code)) {
      setError('Enter the six-digit code.');
      return;
    }
    if (isNewAccount && !displayName.trim()) {
      setError('Choose a display name.');
      return;
    }
    onSignedIn(backend.signIn(identifier, displayName));
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <View style={styles.brand}>
          <Text style={type.title}>The Floor</Text>
          <Text style={[type.muted, styles.tagline]}>
            Audio sessions where either party can claim uninterrupted time.
          </Text>
        </View>

        {step === 'identify' ? (
          <>
            <Field
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Phone number or email"
              keyboardType="email-address"
              autoFocus
            />
            <Button label="Send code" variant="primary" onPress={sendCode} />
          </>
        ) : (
          <>
            <Text style={[type.muted, styles.sentTo]}>
              Code sent to {identifier.trim()}
            </Text>
            <Field
              value={code}
              onChangeText={setCode}
              placeholder="Six-digit code"
              keyboardType="number-pad"
              autoFocus
            />
            {isNewAccount ? (
              <Field
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display name"
                autoCapitalize="words"
              />
            ) : null}
            <Button
              label={isNewAccount ? 'Create account' : 'Sign in'}
              variant="primary"
              onPress={verify}
            />
            <Button
              label="Use a different number or email"
              variant="ghost"
              onPress={() => {
                setStep('identify');
                setCode('');
                setError(null);
              }}
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          Demo build: no code is actually sent — any six digits work. Seeded
          accounts: +15550000001 (You), +15550000002 (Dana Chu),
          miro@example.com, priya@example.com.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(1.5),
  },
  brand: { marginBottom: spacing(2) },
  tagline: { marginTop: spacing(1), lineHeight: 20 },
  sentTo: { marginBottom: spacing(0.5) },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(0.5) },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing(4),
  },
});

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, type LibraryDocument } from '../api/http';
import { useText } from '../i18n';
import { Button, Field } from './components';
import { spacing, type } from './theme';

/**
 * **The documents a *reading* may be made from**, since 2026-11-20: those of
 * the libraries switched on in this channel, searched by what is typed, a
 * row each. Pressing one is the choice; the card it is drawn in says
 * *Preparing the reading…* while the server speaks it.
 *
 * **In the *Listen* card rather than over it.** A sheet would be the first
 * one on the channel screen, and what it chooses is what this card plays, so
 * the card is where the choosing happens. Each document is a `Button` with
 * its library as the sublabel, the shape *Play something together* already
 * has, so the list reads as more of the same choice. See planning/STYLE.md
 * § *Controls*.
 *
 * At most a hundred, as the server sends them, newest first until something
 * is typed and best first after.
 */
export function DocumentPicker({
  token,
  channelId,
  onPick,
  onCancel,
}: {
  token: string;
  channelId: string;
  onPick: (document: LibraryDocument) => void;
  onCancel: () => void;
}) {
  const t = useText().channel;
  const [query, setQuery] = useState('');
  const [listed, setListed] = useState<
    | { state: 'loading' }
    | { state: 'error'; message: string }
    | { state: 'ready'; libraries: string[]; documents: LibraryDocument[] }
  >({ state: 'loading' });

  useEffect(() => {
    let current = true;
    // A pause after typing before asking, so a word is one request and not
    // one a letter.
    const timer = setTimeout(
      () => {
        api
          .channelDocuments(token, channelId, query.trim())
          .then((answer) => {
            if (current) setListed({ state: 'ready', ...answer });
          })
          .catch((error: unknown) => {
            if (current) {
              setListed({ state: 'error', message: error instanceof Error ? error.message : String(error) });
            }
          });
      },
      query ? 350 : 0
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [token, channelId, query]);

  return (
    <View style={styles.stack}>
      <Field value={query} onChangeText={setQuery} placeholder={t.searchTheLibrary()} submitLabel="done" />
      {listed.state === 'loading' ? <Text style={type.muted}>{t.preparing()}</Text> : null}
      {listed.state === 'error' ? <Text style={type.muted}>{listed.message}</Text> : null}
      {listed.state === 'ready' && listed.libraries.length === 0 ? (
        <Text style={type.muted}>{t.noLibraryIsOn()}</Text>
      ) : null}
      {listed.state === 'ready' && listed.libraries.length > 0 && listed.documents.length === 0 ? (
        <Text style={type.muted}>{t.noDocumentsFound()}</Text>
      ) : null}
      {listed.state === 'ready'
        ? listed.documents.map((document) => (
            <Button
              key={`${document.library}/${document.name}`}
              label={document.title}
              // Whose it is, only where there is more than one to tell apart.
              sublabel={listed.libraries.length > 1 ? document.library : undefined}
              onPress={() => onPick(document)}
            />
          ))
        : null}
      <Button label={t.cancel()} variant="quiet" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing(1) },
});

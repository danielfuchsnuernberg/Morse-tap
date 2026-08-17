import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null; stack: string | null };

/**
 * Shows what went wrong instead of a black screen.
 *
 * In development a crash gets a red error screen. In a release build it
 * gets nothing at all - the app just renders empty, which is impossible
 * to diagnose from a photo of a black phone. This puts the message and
 * the component stack on screen so it can be read and fixed.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, stack: info.componentStack ?? null });
    console.error('Morse Chat crashed:', error, info.componentStack);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something broke</Text>
          <Text style={styles.message}>{error.message || String(error)}</Text>

          {error.stack ? (
            <>
              <Text style={styles.label}>Where</Text>
              <Text style={styles.code}>{error.stack.split('\n').slice(0, 8).join('\n')}</Text>
            </>
          ) : null}

          {stack ? (
            <>
              <Text style={styles.label}>Components</Text>
              <Text style={styles.code}>{stack.trim().split('\n').slice(0, 8).join('\n')}</Text>
            </>
          ) : null}

          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              this.setState({ error: null, stack: null });
              this.props.onReset?.();
            }}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            Screenshot this and send it on. It says exactly what failed, which a blank screen
            doesn&apos;t.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingTop: 70, gap: 12 },
  title: { color: theme.bad, fontSize: 22, fontWeight: '800' },
  message: { color: theme.text, fontSize: 15, lineHeight: 21 },
  label: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  code: {
    color: theme.textDim,
    fontFamily: 'Courier',
    fontSize: 11,
    lineHeight: 16,
    backgroundColor: theme.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
  },
  button: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: theme.radius,
    alignItems: 'center',
    backgroundColor: theme.accent,
  },
  buttonText: { color: '#000', fontWeight: '800', fontSize: 15 },
  hint: { color: theme.textDim, fontSize: 12, lineHeight: 18, marginTop: 12 },
});

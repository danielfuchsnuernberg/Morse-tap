import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Splash } from './src/native';

/**
 * A test designed so the result cannot be misread.
 *
 * The splash screen is configured BLUE. This screen is RED. So:
 *   - red   -> React Native started and rendered; the splash was the
 *              whole problem
 *   - blue  -> React Native never rendered; the fault is below the JS
 *
 * The previous version of this test never asked the splash to go away,
 * which meant a perfectly working app would still have looked stuck.
 */
export default function AppMinimal() {
  useEffect(() => {
    // Ask, repeatedly, in case the first attempt is too early.
    Splash?.hideAsync().catch(() => undefined);
    const timer = setTimeout(() => Splash?.hideAsync().catch(() => undefined), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>RED MEANS IT WORKS</Text>
      <Text style={styles.body}>
        React Native started and rendered this screen.{'\n'}
        If you can read this, the app was fine and the splash screen was the problem.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#CC2222',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  body: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 },
});

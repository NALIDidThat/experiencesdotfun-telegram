import { Platform, ScrollView, ScrollViewProps, StyleSheet } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export function KeyboardAwareScrollViewCompat({
  children,
  style,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'none',
  ...props
}: Props) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        style={[style, styles.webScroll]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      style={style}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  webScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
});

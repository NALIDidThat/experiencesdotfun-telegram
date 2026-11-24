import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

const poppinsFamilyByWeight: Record<string, string> = {
  '100': 'Poppins_400Regular',
  '200': 'Poppins_400Regular',
  '300': 'Poppins_400Regular',
  '400': 'Poppins_400Regular',
  normal: 'Poppins_400Regular',
  '500': 'Poppins_500Medium',
  '600': 'Poppins_600SemiBold',
  '700': 'Poppins_700Bold',
  bold: 'Poppins_700Bold',
  '800': 'Poppins_800ExtraBold',
  '900': 'Poppins_800ExtraBold',
};

const poppinsFamilyByLegacyName: Record<string, string> = {
  Inter_400Regular: 'Poppins_400Regular',
  Inter_500Medium: 'Poppins_500Medium',
  Inter_600SemiBold: 'Poppins_600SemiBold',
  Inter_700Bold: 'Poppins_700Bold',
};

function resolvePoppinsFamily(style?: StyleProp<TextStyle>) {
  const flattened = StyleSheet.flatten(style);
  const existingFamily = flattened?.fontFamily;

  if (existingFamily && poppinsFamilyByLegacyName[existingFamily]) {
    return poppinsFamilyByLegacyName[existingFamily];
  }

  if (existingFamily?.startsWith('Poppins_')) {
    return existingFamily;
  }

  const weight = flattened?.fontWeight;
  return poppinsFamilyByWeight[String(weight ?? '400')] ?? 'Poppins_400Regular';
}

export const PoppinsText = forwardRef<NativeText, TextProps>(function PoppinsText(
  { style, ...props },
  ref,
) {
  const fontFamily = resolvePoppinsFamily(style);
  return <NativeText {...props} ref={ref} style={[style, { fontFamily }]} />;
});

export const PoppinsTextInput = forwardRef<NativeTextInput, TextInputProps>(
  function PoppinsTextInput({ style, ...props }, ref) {
    const fontFamily = resolvePoppinsFamily(style);
    return <NativeTextInput {...props} ref={ref} style={[style, { fontFamily }]} />;
  },
);

export const typography = {
  display: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.7,
  },
  screenTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.45,
  },
  sectionTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 20,
    lineHeight: 27,
  },
  body: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  caption: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
  button: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
  },
} as const;

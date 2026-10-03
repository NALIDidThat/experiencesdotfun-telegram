import { useCallback, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
} from 'react-native';
import { useMotionPreferences } from '@/context/MotionContext';

type MotionPressableProps = PressableProps & {
  motion?: boolean;
  pressScale?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

export function MotionPressable({
  children,
  disabled = false,
  motion = true,
  onPressIn,
  onPressOut,
  pressScale = 0.975,
  style,
  ...props
}: MotionPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { reduceMotion } = useMotionPreferences();

  const animateScale = useCallback((toValue: number) => {
    scale.stopAnimation();
    if (!motion || disabled || reduceMotion) {
      scale.setValue(1);
      return;
    }

    Animated.spring(scale, {
      toValue,
      useNativeDriver: Platform.OS !== 'web',
      damping: 22,
      stiffness: 380,
      mass: 0.65,
      overshootClamping: true,
    }).start();
  }, [disabled, motion, reduceMotion, scale]);

  const resolvedStyle = useCallback((state: PressableStateCallbackType) => {
    const baseStyle = typeof style === 'function' ? style(state) : style;
    if (!motion || reduceMotion) return baseStyle;

    const flattenedStyle = StyleSheet.flatten(baseStyle);
    return [
      baseStyle,
      {
        transform: [...(flattenedStyle?.transform ?? []), { scale }],
      },
    ];
  }, [motion, reduceMotion, scale, style]);

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        animateScale(pressScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateScale(1);
        onPressOut?.(event);
      }}
      style={resolvedStyle}
    >
      {children}
    </AnimatedPressable>
  );
}
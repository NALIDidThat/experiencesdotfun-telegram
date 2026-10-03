import { useCallback, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable as NativePressable,
  type StyleProp,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { useMotionPreferences } from '@/context/MotionContext';

type MotionPressableProps = PressableProps & {
  containerStyle?: StyleProp<ViewStyle>;
  motion?: boolean;
  pressScale?: number;
};

export function MotionPressable({
  children,
  containerStyle,
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

  return (
    <Animated.View
      style={[
        containerStyle,
        motion && !reduceMotion ? { transform: [{ scale }] } : null,
      ]}
    >
      <NativePressable
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
        style={style}
      >
        {children}
      </NativePressable>
    </Animated.View>
  );
}
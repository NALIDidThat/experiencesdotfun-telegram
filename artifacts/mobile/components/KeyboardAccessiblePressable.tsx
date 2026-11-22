import React, { useRef, type ComponentProps } from 'react';
import { Platform, Pressable } from 'react-native';

type PressableProps = ComponentProps<typeof Pressable>;
type WebKeyboardEvent = {
  key: string;
  repeat?: boolean;
  preventDefault: () => void;
};

type Props = Omit<PressableProps, 'onPress'> & {
  onPress: () => void;
};

export function KeyboardAccessiblePressable({ onPress, ...props }: Props) {
  const enterHandled = useRef(false);
  const webKeyboardProps = Platform.OS === 'web'
    ? {
        onKeyDown: (event: WebKeyboardEvent) => {
          if (event.key === 'Enter' && !event.repeat) {
            event.preventDefault();
            enterHandled.current = true;
            onPress();
          }
        },
        onKeyUp: (event: Pick<WebKeyboardEvent, 'key'>) => {
          if (event.key === 'Enter') {
            setTimeout(() => {
              enterHandled.current = false;
            }, 0);
          }
        },
      }
    : {};

  return (
    <Pressable
      {...props}
      {...(webKeyboardProps as ComponentProps<typeof Pressable>)}
      onPress={(event) => {
        if (enterHandled.current && (event as { nativeEvent?: { key?: string } }).nativeEvent?.key === 'Enter') {
          return;
        }
        enterHandled.current = false;
        onPress();
      }}
    />
  );
}

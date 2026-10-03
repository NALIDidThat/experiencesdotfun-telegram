import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, type ReactNode } from 'react-native';

type MotionPreferences = {
  reduceMotion: boolean;
};

const MotionContext = createContext<MotionPreferences>({ reduceMotion: false });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const value = useMemo(() => ({ reduceMotion }), [reduceMotion]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionPreferences() {
  return useContext(MotionContext);
}
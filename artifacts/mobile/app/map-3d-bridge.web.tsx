import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ExploreMapGoogle3D from '@/components/ExploreMapGoogle3D.web';
import type { ExploreMapHandle, ExploreMapProps } from '@/components/ExploreMap.types';

type MapData = Omit<ExploreMapProps, 'apiKey' | 'onSelectCity' | 'onSelectFriend' | 'onSelectExperience' | 'onExploreCity' | 'onResetCity'>;
type BridgeMessage = { type: string; props?: MapData; latitude?: number; longitude?: number };
type NativeBridgeWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };

export default function Map3DBridgeRoute() {
  const [mapProps, setMapProps] = useState<MapData | null>(null);
  const mapRef = useRef<ExploreMapHandle>(null);

  useEffect(() => {
    const send = (message: object) => (window as NativeBridgeWindow).ReactNativeWebView?.postMessage(JSON.stringify(message));
    const receive = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as BridgeMessage;
        if (message.type === 'update' && message.props) setMapProps(message.props);
        if (message.type === 'focus' && Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
          mapRef.current?.focusOnCity(message.latitude!, message.longitude!);
        }
        if (message.type === 'reset') mapRef.current?.resetView();
      } catch {
        // Ignore unrelated messages sent by the WebView host.
      }
    };
    window.addEventListener('message', receive);
    document.addEventListener('message', receive as EventListener);
    send({ type: 'ready' });
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('message', receive as EventListener);
    };
  }, []);

  if (!mapProps) return <View style={styles.root} />;
  const send = (message: object) => (window as NativeBridgeWindow).ReactNativeWebView?.postMessage(JSON.stringify(message));
  return (
    <View style={styles.root}>
      <ExploreMapGoogle3D
        ref={mapRef}
        {...mapProps}
        apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
        onSelectCity={(city) => send({ type: 'city', city })}
        onSelectFriend={(friendId) => send({ type: 'friend', friendId })}
        onSelectExperience={(experienceId) => send({ type: 'experience', experienceId })}
        onExploreCity={(city) => send({ type: 'city', city })}
        onResetCity={() => send({ type: 'reset' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, minHeight: 0 } });

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { ExploreGlobe } from '@/components/ExploreGlobe';
import { useColors } from '@/hooks/useColors';
import type { ExploreMapHandle, ExploreMapProps } from '@/components/ExploreMap.types';

const bridgePath = '/map-3d-bridge';
const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
type WebViewElementProps = WebViewProps & { ref?: React.Ref<WebView> };
const WebViewElement = WebView as unknown as React.ComponentType<WebViewElementProps>;

const ExploreMap = React.forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMap(props, ref) {
  const colors = useColors();
  const webView = useRef<WebView>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeFailed, setBridgeFailed] = useState(false);
  const data = useMemo(() => ({
    cities: props.cities,
    friends: props.friends,
    experienceLocations: props.experienceLocations,
    mode: props.mode,
    selectedCity: props.selectedCity,
    selectedCityCoordinates: props.selectedCityCoordinates,
    profileCityCenter: props.profileCityCenter,
    sheetOverlayHeight: props.sheetOverlayHeight,
    status: props.status,
    verifiedActivityStatus: props.verifiedActivityStatus,
    fullScreen: props.fullScreen,
    showFriends: props.showFriends,
  }), [props]);

  useEffect(() => {
    if (bridgeReady) webView.current?.postMessage(JSON.stringify({ type: 'update', props: data }));
  }, [bridgeReady, data]);

  React.useImperativeHandle(ref, () => ({
    focusOnCity: (latitude, longitude) => webView.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify(JSON.stringify({ type: 'focus', latitude, longitude }))}, '*'); true;`,
    ),
    resetView: () => webView.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify(JSON.stringify({ type: 'reset' }))}, '*'); true;`,
    ),
  }), []);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; city?: string; friendId?: number; experienceId?: number };
      if (message.type === 'ready') setBridgeReady(true);
      if (message.type === 'city' && message.city) props.onSelectCity(message.city);
      if (message.type === 'friend' && message.friendId) props.onSelectFriend?.(message.friendId);
      if (message.type === 'experience' && message.experienceId) props.onSelectExperience?.(message.experienceId);
      if (message.type === 'reset') props.onResetCity();
    } catch {
      // Ignore malformed bridge messages.
    }
  };

  if (Platform.OS === 'web') return null;
  if (!domain || bridgeFailed) {
    return (
      <View style={styles.root}>
        <ExploreGlobe
          ref={ref}
          cities={props.cities}
          friends={props.friends}
          experienceLocations={props.experienceLocations}
          mode={props.mode}
          selectedCity={props.selectedCity}
          selectedCityCoordinates={props.selectedCityCoordinates}
          status={props.status}
          verifiedActivityStatus={props.verifiedActivityStatus}
          fullScreen={props.fullScreen}
          showFriends={props.showFriends}
          onSelectCity={props.onSelectCity}
          onSelectFriend={props.onSelectFriend}
          onSelectExperience={props.onSelectExperience}
          onExploreCity={props.onExploreCity}
          onResetCity={props.onResetCity}
        />
        {bridgeFailed ? <Text style={[styles.error, { color: colors.foreground, backgroundColor: colors.card }]}>Google 3D map unavailable. Showing the interactive Earth fallback.</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.root} testID="explore-map-native">
      <WebViewElement
        ref={webView}
        source={{ uri: `https://${domain}${bridgePath}` }}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        onError={() => setBridgeFailed(true)}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 400) setBridgeFailed(true);
        }}
        style={styles.map}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: 'hidden' },
  map: { flex: 1, backgroundColor: '#071f3d' },
  error: { position: 'absolute', left: 12, right: 12, bottom: 12, padding: 10, borderRadius: 10 },
});

export default ExploreMap;

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function Map3DBridgeNativeFallback() {
  return (
    <View style={styles.root}>
      <Text>3D map bridge is only used by the embedded web map.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

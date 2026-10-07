import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ExploreGlobe } from '@/components/ExploreGlobe';
import { useColors } from '@/hooks/useColors';
import type { ExploreMapHandle, ExploreMapProps } from '@/components/ExploreMap.types';

const ExploreMap = React.forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMap(props, ref) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const sheetClearance = (props.sheetOverlayHeight ?? Math.min(208, Math.max(176, height * 0.34))) + 8;
  return (
    <View style={styles.root} testID="explore-map-native">
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
      <View style={[styles.notice, { bottom: props.fullScreen ? sheetClearance : 12, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
          Google Maps and nearby places are available on web.
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: { fontSize: 11, lineHeight: 15 },
});

export default ExploreMap;

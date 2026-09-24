import { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type UserAvatarProps = {
  avatarUrl?: string | null;
  name: string;
  containerStyle: StyleProp<ViewStyle>;
  initialStyle: StyleProp<TextStyle>;
};

export function UserAvatar({
  avatarUrl,
  name,
  containerStyle,
  initialStyle,
}: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && failedUrl !== avatarUrl);

  return (
    <View style={[containerStyle, styles.clipped]}>
      {showImage ? (
        <Image
          accessible={false}
          source={{ uri: avatarUrl! }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailedUrl(avatarUrl!)}
        />
      ) : (
        <Text style={initialStyle}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clipped: {
    overflow: 'hidden',
  },
});
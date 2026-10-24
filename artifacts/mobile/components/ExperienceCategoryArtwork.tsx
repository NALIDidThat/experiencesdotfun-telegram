import { Image, type ImageStyle, type StyleProp } from "react-native";
import type { ExperienceCategory } from "@workspace/api-client-react";

const artworkByCategory: Record<ExperienceCategory, number> = {
  environmental: require("../assets/images/category-environmental.png"),
  education: require("../assets/images/category-education.png"),
  community: require("../assets/images/category-community.png"),
};

export function ExperienceCategoryArtwork({
  category,
  size = 64,
  style,
}: {
  category: ExperienceCategory;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessible={false}
      source={artworkByCategory[category]}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
    />
  );
}

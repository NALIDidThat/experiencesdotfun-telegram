import React from 'react';
import { View } from 'react-native';
import type { ExperienceCategory } from '@workspace/api-client-react';
import { ExperienceCategoryArtwork } from '@/components/ExperienceCategoryArtwork';

const categories = new Set<ExperienceCategory>(['community', 'education', 'environmental']);

export function NodeArtwork({
  nodeCategories,
  size = 40,
}: {
  nodeCategories?: readonly string[] | null;
  size?: number;
}) {
  const category = nodeCategories?.find((item): item is ExperienceCategory => categories.has(item as ExperienceCategory))
    ?? 'community';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <ExperienceCategoryArtwork category={category} size={size} />
    </View>
  );
}

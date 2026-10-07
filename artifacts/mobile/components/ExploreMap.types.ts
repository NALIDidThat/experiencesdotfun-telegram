import type { ExploreGlobeHandle, GlobeCity, GlobeExperienceLocation, GlobeFriend, GlobeMode } from '@/components/ExploreGlobe';

export type ExploreMapCategory = 'all' | 'food' | 'parks' | 'community' | 'culture' | 'shopping' | 'transit' | 'essentials';

export type ExploreMapProps = {
  apiKey?: string;
  cities: GlobeCity[];
  friends?: GlobeFriend[];
  experienceLocations?: GlobeExperienceLocation[];
  mode: GlobeMode;
  selectedCity: string | null;
  selectedCityCoordinates?: { latitude: number; longitude: number };
  profileCityCenter?: { latitude: number; longitude: number } | null;
  sheetOverlayHeight?: number;
  status: 'loading' | 'ready' | 'error';
  verifiedActivityStatus?: 'loading' | 'ready' | 'error';
  fullScreen?: boolean;
  showFriends?: boolean;
  onSelectCity: (city: string) => void;
  onSelectFriend?: (friendId: number) => void;
  onSelectExperience?: (experienceId: number) => void;
  onExploreCity: (city: string) => void;
  onResetCity: () => void;
};

export type ExploreMapHandle = ExploreGlobeHandle;

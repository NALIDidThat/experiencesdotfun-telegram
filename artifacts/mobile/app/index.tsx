import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getGetAccountabilityDashboardQueryKey,
  getGetHostExperienceMilestonesQueryKey,
  getGetHostOverviewQueryKey,
  useAcceptFriendRequest,
  useCreateExperience,
  useUpdateHostExperience,
  useCancelHostExperience,
  useCreateFriendRequest,
  useCreateSocialInvite,
  useDeclineFriendRequest,
  useGetExperience,
  useGetFriendProfile,
  useGetHostExperienceMilestones,
  useGetAccountabilityDashboard,
  useGetHostOverview,
  useGetMe,
  useGetMyXpAwards,
  useJoinExperience,
  useListExperienceParticipants,
  useListExperiences,
  useListFriendRequests,
  useListFriendNotifications,
  useListFriends,
  useListDirectConversations,
  useListTopFriends,
  useListHostExperiences,
  useListMyParticipations,
  useListSentFriendRequests,
  useMarkAttendance,
  usePromoteNextWaitlistedParticipant,
  useRejectParticipation,
  useRedeemMyXpAwards,
  useSubmitCompletion,
  useSubmitExperienceMilestone,
  useTrackAnalyticsEvent,
  useSaveTopFriends,
  useUpdateMe,
  useVerifyParticipation,
  useReviewExperienceMilestoneSubmission,
  getGetExperienceQueryKey,
  getGetFriendProfileQueryKey,
  getGetMyXpAwardsQueryKey,
  getListMyParticipationsQueryKey,
  getListHostExperiencesQueryKey,
  getListExperienceParticipantsQueryKey,
  getListFriendRequestsQueryKey,
  getListFriendNotificationsQueryKey,
  getListFriendsQueryKey,
  getListDirectConversationsQueryKey,
  getListTopFriendsQueryKey,
  getListSentFriendRequestsQueryKey,
  type Experience,
  type ExperienceCategory,
  type ExperienceDetail,
  type ExperienceCreateInput,
  type ExperienceMilestoneSubmission,
  type Participation,
  type User,
  type UserType,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useMotionPreferences } from '@/context/MotionContext';
import { useColors } from '@/hooks/useColors';
import { AccountabilitySection } from '@/components/AccountabilitySection';
import { OrganisationPartnershipsSection } from '@/components/OrganisationPartnershipsSection';
import { SocialFeed } from '@/components/SocialFeed';
import { PersonalActivityScreen } from '@/components/PersonalActivityScreen';
import { AccountsCenterScreen } from '@/components/AccountsCenterScreen';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { KeyboardInteractionHarness } from '@/components/KeyboardInteractionHarness';
import { CommunityXpPanel } from '@/components/CommunityXpPanel';
import { UserAvatar } from '@/components/UserAvatar';
import { MotionPressable } from '@/components/MotionPressable';
import { NotificationsScreen } from '@/components/NotificationsScreen';
import { DirectMessagesScreen } from '@/components/DirectMessagesScreen';
import { AiAssistantScreen } from '@/components/AiAssistantScreen';
import { ExperienceChallengesScreen } from '@/components/ExperienceChallengesScreen';
import { ExploreGlobe, type GlobeCity, type GlobeFriend } from '@/components/ExploreGlobe';
import { DateSliderPicker, formatExperienceDateUk } from '@/components/DateSliderPicker';
import { ExperienceXpSlider } from '@/components/ExperienceXpSlider';
import { openTelegramBot } from '@/lib/telegram';
import { createSocialInviteShareContent } from '@/lib/social-invite-copy';

type Screen = 'home' | 'explore' | 'activity' | 'experiences' | 'ai' | 'challenges' | 'profile' | 'accounts' | 'notifications' | 'messages' | 'direct-message' | 'friends' | 'friend-profile' | 'experience' | 'host' | 'host-detail' | 'create' | 'email';
type IconName = keyof typeof Feather.glyphMap;
type BottomNavQuickAction = 'post' | 'create' | 'progress' | 'assistant' | 'challenges';
type HostExperienceFilter = 'all' | Experience['status'];
type HostParticipantFilter = 'all' | 'participants' | 'review' | 'waitlisted';
const screenNames: readonly Screen[] = ['home', 'explore', 'activity', 'experiences', 'ai', 'challenges', 'profile', 'accounts', 'notifications', 'messages', 'direct-message', 'friends', 'friend-profile', 'experience', 'host', 'host-detail', 'create', 'email'];

const categories: Array<{ key: ExperienceCategory | 'all'; label: string; icon: IconName }> = [
  { key: 'all', label: 'All', icon: 'grid' },
  { key: 'environmental', label: 'Environmental', icon: 'feather' },
  { key: 'education', label: 'Education', icon: 'book-open' },
  { key: 'community', label: 'Community', icon: 'users' },
];

// City-centre coordinates are deliberately coarse approximations, used only to
// place city aggregates on the globe. Unknown cities remain available in the list.
const exploreCityCoordinates: Record<string, { latitude: number; longitude: number }> = {
  london: { latitude: 51.5072, longitude: -0.1276 },
  'new york': { latitude: 40.7128, longitude: -74.006 },
  'los angeles': { latitude: 34.0522, longitude: -118.2437 },
  'san francisco': { latitude: 37.7749, longitude: -122.4194 },
  toronto: { latitude: 43.6532, longitude: -79.3832 },
  'mexico city': { latitude: 19.4326, longitude: -99.1332 },
  'sao paulo': { latitude: -23.5505, longitude: -46.6333 },
  'rio de janeiro': { latitude: -22.9068, longitude: -43.1729 },
  'buenos aires': { latitude: -34.6037, longitude: -58.3816 },
  dublin: { latitude: 53.3498, longitude: -6.2603 },
  paris: { latitude: 48.8566, longitude: 2.3522 },
  berlin: { latitude: 52.52, longitude: 13.405 },
  amsterdam: { latitude: 52.3676, longitude: 4.9041 },
  madrid: { latitude: 40.4168, longitude: -3.7038 },
  lisbon: { latitude: 38.7223, longitude: -9.1393 },
  rome: { latitude: 41.9028, longitude: 12.4964 },
  istanbul: { latitude: 41.0082, longitude: 28.9784 },
  cairo: { latitude: 30.0444, longitude: 31.2357 },
  lagos: { latitude: 6.5244, longitude: 3.3792 },
  nairobi: { latitude: -1.2921, longitude: 36.8219 },
  mogadishu: { latitude: 2.0469, longitude: 45.3182 },
  'cape town': { latitude: -33.9249, longitude: 18.4241 },
  dubai: { latitude: 25.2048, longitude: 55.2708 },
  mumbai: { latitude: 19.076, longitude: 72.8777 },
  delhi: { latitude: 28.6139, longitude: 77.209 },
  bangkok: { latitude: 13.7563, longitude: 100.5018 },
  singapore: { latitude: 1.3521, longitude: 103.8198 },
  tokyo: { latitude: 35.6762, longitude: 139.6503 },
  seoul: { latitude: 37.5665, longitude: 126.978 },
  sydney: { latitude: -33.8688, longitude: 151.2093 },
  melbourne: { latitude: -37.8136, longitude: 144.9631 },
};

function normalizeExploreCityName(city: string) {
  return city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

const categoryIcon: Record<ExperienceCategory, IconName> = {
  environmental: 'feather',
  education: 'book-open',
  community: 'users',
};

const categoryLabel: Record<ExperienceCategory, string> = {
  environmental: 'Environmental',
  education: 'Education',
  community: 'Community',
};

const categoryGradients: Record<ExperienceCategory, readonly [string, string]> = {
  environmental: ['#04ADBF', '#1A98E5'],
  education: ['#6805F2', '#1A98E5'],
  community: ['#F20789', '#6805F2'],
};

const hostExperienceFilters: Array<{ key: HostExperienceFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'full', label: 'Full' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
  { key: 'cancelled', label: 'Cancelled' },
];

const hostParticipantFilters: Array<{ key: HostParticipantFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Completions' },
  { key: 'participants', label: 'Participants' },
  { key: 'waitlisted', label: 'Waitlist' },
];

const hostExperienceStatusLabels: Record<Experience['status'], string> = {
  published: 'Published',
  full: 'Full',
  completed: 'Completed',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

const hostParticipationStatusLabels: Record<Participation['status'], string> = {
  joined: 'Joined',
  attended: 'Attended',
  submitted: 'To review',
  verified: 'Verified',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
};

function money(pence: number | null | undefined) {
  return pence ? `£${(pence / 100).toFixed(2)}` : null;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function invalidateAppQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries().catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return;
    console.warn('Could not refresh cached app data after a successful update.');
  });
}

function dateLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime())
    ? date
    : value.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function hostTimestampLabel(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime())
    ? null
    : value.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function triggerHaptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

function Button({
  label, onPress, variant = 'primary', disabled = false, icon, style, color, textColor, testID,
}: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'alternative'; disabled?: boolean; icon?: IconName; style?: any; color?: string; textColor?: string; testID?: string;
}) {
  const colors = useColors();

  let bg = colors.primary;
  let fg = colors.primaryForeground;
  let border = 'transparent';
  let borderWidth = 0;

  if (variant === 'secondary') {
    bg = 'transparent';
    fg = colors.foreground;
    border = colors.border;
    borderWidth = 1.5;
  } else if (variant === 'alternative') {
    bg = colors.secondary;
    fg = colors.secondaryForeground;
  }
  if (color) bg = color;
  if (textColor) fg = textColor;

  return (
    <MotionPressable
      containerStyle={style}
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPressIn={() => triggerHaptic()}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth,
          borderRadius: colors.radius,
          opacity: disabled ? 0.4 : pressed ? 0.9 : 1,
        },
      ]}
    >
      {icon ? <Feather name={icon} size={20} color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </MotionPressable>
  );
}

type HeaderMenuItem = { key: string; label: string; icon: IconName; onPress: () => void; badge?: number };

function Header({
  title,
  subtitle,
  onBack,
  menuItems,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  menuItems?: HeaderMenuItem[];
}) {
  const colors = useColors();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerTop = 16;

  return (
    <>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        {onBack && (
          <Pressable accessibilityLabel="Go back" onPress={() => { triggerHaptic(); onBack(); }} style={styles.backButton}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
        )}
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
          {subtitle && <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
        </View>
        {menuItems?.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={menuOpen ? 'Close profile menu' : 'Open profile menu'}
            accessibilityState={{ expanded: menuOpen }}
            testID="profile-menu-toggle"
            onPress={() => { triggerHaptic(); setMenuOpen((open) => !open); }}
            style={({ pressed }) => [styles.headerMenuButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View accessibilityElementsHidden style={styles.headerMenuLines}>
              <View style={[styles.headerMenuLine, { backgroundColor: colors.foreground }]} />
              <View style={[styles.headerMenuLine, { backgroundColor: colors.foreground }]} />
            </View>
          </Pressable>
        ) : null}
      </View>
      {menuItems?.length ? (
        <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.headerMenuOverlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close profile menu"
              onPress={() => setMenuOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.headerMenuPopover,
                {
                  top: headerTop + 44,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              {menuItems.map((item) => (
                <Pressable
                  key={item.key}
                  testID={`profile-menu-${item.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.badge ? `${item.label}, ${item.badge} unread` : item.label}
                  onPress={() => {
                    triggerHaptic();
                    setMenuOpen(false);
                    item.onPress();
                  }}
                  style={({ pressed }) => [styles.headerMenuItem, { opacity: pressed ? 0.65 : 1 }]}
                >
                  <Feather name={item.icon} size={16} color={colors.primary} />
                  <Text style={[styles.headerMenuItemText, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
                  {item.badge ? (
                    <View style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, minWidth: 22, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <Text style={{ color: colors.primaryForeground, fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function EmptyState({ title, body, icon = 'compass', onAction, actionLabel }: { title: string; body: string; icon?: IconName; onAction?: () => void; actionLabel?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
      {onAction && actionLabel && (
        <View style={{ marginTop: 24, width: '100%' }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

function InlineError({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View style={[styles.inlineError, { backgroundColor: colors.destructive + '10', borderColor: colors.destructive + '35', borderRadius: colors.radius }]}>
      <Feather name="alert-circle" size={17} color={colors.destructive} />
      <Text accessibilityRole="alert" style={[styles.inlineErrorText, { color: colors.destructive }]}>{message}</Text>
    </View>
  );
}

function TelegramConnectCard() {
  const colors = useColors();
  const { login, loading } = useAuth();
  return (
    <View style={[styles.telegramCard, { backgroundColor: colors.card, borderColor: colors.primary + '35', borderRadius: colors.radius }]}>
      <View style={[styles.telegramIcon, { backgroundColor: colors.primary + '12' }]}>
        <Feather name="send" size={20} color={colors.primary} />
      </View>
      <View style={styles.telegramCopy}>
        <Text style={[styles.telegramTitle, { color: colors.foreground }]}>Log in with Telegram</Text>
        <Text style={[styles.telegramBody, { color: colors.mutedForeground }]}>Use your Telegram profile to sync your passport, friends, and hosted experiences.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log in with Telegram"
        disabled={loading}
        onPress={() => { triggerHaptic(); void login(); }}
        style={({ pressed }) => [styles.telegramButton, { backgroundColor: colors.primary, borderRadius: colors.radius - 6, opacity: loading ? 0.5 : pressed ? 0.82 : 1 }]}
      >
        {loading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />}
      </Pressable>
    </View>
  );
}

function ExperienceCard({ item, onPress }: { item: Experience; onPress: () => void }) {
  const colors = useColors();
  const { reduceMotion } = useMotionPreferences();
  const icon = categoryIcon[item.category];
  const gradient = categoryGradients[item.category] ?? categoryGradients.community;
  const entrance = useRef(new Animated.Value(0)).current;
  const availabilityColor = item.availablePlaces < 4 ? colors.primary : colors.mutedForeground;
  const availabilityLabel = item.availablePlaces === 0 ? 'Waitlist open' : `${item.availablePlaces} spots left`;

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }

    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.experienceCardWrap,
        {
          opacity: entrance,
          transform: [{
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [5, 0],
            }),
          }],
        },
      ]}
    >
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`View ${item.title}. ${categoryLabel[item.category]}. ${dateLabel(item.date)} in ${item.city}. ${availabilityLabel}. Earn ${item.xpReward} XP.`}
        accessibilityHint="Opens experience details"
        testID={`explore-experience-card-${item.id}`}
        onPress={() => { triggerHaptic(); onPress(); }}
        style={[styles.experienceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
      >
        <View style={styles.experienceCardArtwork}>
          {item.category === 'community' ? (
            <ImageBackground
              source={require('../assets/images/community-cover.jpg')}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          )}
          {item.category !== 'community' ? (
            <View style={[StyleSheet.absoluteFill, styles.experienceCardFallback]}>
              <Feather name={icon} size={72} color={colors.primaryForeground} style={{ opacity: 0.2 }} />
            </View>
          ) : null}
          <LinearGradient
            colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.66)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          <View style={styles.experienceCardArtworkTop}>
            <View style={[styles.experienceCardCategory, { backgroundColor: colors.card }]}>
              <Feather name={icon} size={14} color={colors.primary} />
              <Text style={[styles.experienceCardCategoryText, { color: colors.foreground }]}>{categoryLabel[item.category]}</Text>
            </View>
            <View style={[styles.experienceCardXp, { backgroundColor: colors.card }]}>
              <Feather name="zap" size={13} color={colors.primary} />
              <Text style={[styles.experienceCardXpText, { color: colors.primary }]}>+{item.xpReward} XP</Text>
            </View>
          </View>

          <View style={styles.experienceCardArtworkCopy}>
            <Text style={[styles.experienceCardOrg, { color: colors.primaryForeground }]} numberOfLines={1}>{item.organisation.name}</Text>
            <Text style={[styles.experienceCardTitle, { color: colors.primaryForeground }]} numberOfLines={2}>{item.title}</Text>
          </View>
        </View>

        <View style={styles.experienceCardContent}>
          <View style={styles.experienceCardMetaRow}>
            <View style={[styles.experienceCardMetaChip, { backgroundColor: colors.muted }]}>
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={[styles.experienceCardMetaText, { color: colors.foreground }]} numberOfLines={1}>{dateLabel(item.date)}</Text>
            </View>
            <View style={[styles.experienceCardMetaChip, { backgroundColor: colors.muted }]}>
              <Feather name="map-pin" size={14} color={colors.mutedForeground} />
              <Text style={[styles.experienceCardMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.city}</Text>
            </View>
          </View>

          <View style={[styles.experienceCardBottomRow, { borderTopColor: colors.border }]}>
            <View style={styles.experienceAvailability}>
              <Feather name="users" size={15} color={availabilityColor} />
              <Text style={[styles.experienceAvailabilityText, { color: availabilityColor }]} numberOfLines={1}>{availabilityLabel}</Text>
            </View>
            <View style={[styles.experienceDetailsButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
              <Text style={[styles.experienceDetailsButtonText, { color: colors.primaryForeground }]}>See details</Text>
              <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
            </View>
          </View>
        </View>
      </MotionPressable>
    </Animated.View>
  );
}

function LoadingState() {
  const colors = useColors();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading...</Text>
    </View>
  );
}

function EmailAuthPanel({
  onBack,
  onSuccess,
  accountType,
}: {
  onBack: () => void;
  onSuccess: (justSignedUp: boolean) => void;
  accountType: UserType | null;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { loginWithIdentifier, signUpWithEmail, loading, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupStep, setSignupStep] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const isSignup = mode === 'signup';
  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase();
  const signupFields = [
    {
      label: 'Name',
      title: 'What should we call you?',
      description: 'This is the name people will see on your profile.',
      placeholder: 'Your name',
      icon: 'user' as const,
      autoCapitalize: 'words' as const,
      returnKeyType: 'next' as const,
    },
    {
      label: 'Email',
      title: 'What’s your email?',
      description: 'We’ll use it to sign you in.',
      placeholder: 'you@example.com',
      icon: 'mail' as const,
      autoCapitalize: 'none' as const,
      autoComplete: 'email' as const,
      keyboardType: 'email-address' as const,
      returnKeyType: 'next' as const,
    },
    {
      label: 'Password',
      title: 'Create a password',
      description: 'Use at least 8 characters.',
      placeholder: 'At least 8 characters',
      icon: 'lock' as const,
      autoCapitalize: 'none' as const,
      secureTextEntry: true,
      returnKeyType: 'next' as const,
    },
    {
      label: 'Confirm password',
      title: 'Confirm your password',
      description: 'Enter the same password again.',
      placeholder: 'Repeat your password',
      icon: 'check-circle' as const,
      autoCapitalize: 'none' as const,
      secureTextEntry: true,
      returnKeyType: 'next' as const,
    },
    {
      label: 'Username',
      title: 'Choose your username',
      description: 'Your unique username helps friends find you.',
      placeholder: 'yourname',
      icon: 'at-sign' as const,
      autoCapitalize: 'none' as const,
      autoComplete: 'username' as const,
      returnKeyType: 'done' as const,
    },
  ];
  const activeSignupField = signupFields[signupStep];
  const activeSignupValue = [name, email, password, confirmPassword, username][signupStep];

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  const updateActiveSignupValue = (value: string) => {
    if (signupStep === 0) setName(value);
    else if (signupStep === 1) setEmail(value);
    else if (signupStep === 2) setPassword(value);
    else if (signupStep === 3) setConfirmPassword(value);
    else setUsername(value);
  };

  const continueSignup = async () => {
    setLocalError(null);
    clearAuthError();
    if (signupStep === 0 && !name.trim()) {
      setLocalError('Enter your name to continue.');
    } else if (signupStep === 1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError('Enter a valid email address.');
    } else if (signupStep === 2 && password.length < 8) {
      setLocalError('Use at least 8 characters for your password.');
    } else if (signupStep === 3 && password !== confirmPassword) {
      setLocalError('Your passwords do not match.');
    } else if (signupStep === 4 && !/^[a-z0-9_]{5,32}$/.test(normalizedUsername)) {
      setLocalError('Use 5–32 letters, numbers, or underscores.');
    } else if (!accountType) {
      setLocalError('Choose an account type before creating your account.');
    } else if (signupStep < signupFields.length - 1) {
      setSignupStep((current) => current + 1);
    } else {
      Keyboard.dismiss();
      const created = await signUpWithEmail(
        name.trim(),
        normalizedUsername,
        email.trim(),
        password,
        accountType,
      );
      if (created) {
        setLoginIdentifier(email.trim());
        onSuccess(true);
      }
    }
  };

  const submitLogin = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    const authenticated = await loginWithIdentifier(loginIdentifier, password);
    if (authenticated) onSuccess(false);
  };

  return (
    <View style={[styles.emailAuthScreen, { backgroundColor: colors.muted }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.muted} />
      <KeyboardAwareScrollViewCompat
        style={[styles.emailAuthScroll, { backgroundColor: colors.muted }]}
        contentContainerStyle={[styles.emailAuthContent, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        bottomOffset={24}
      >
        <View
          style={[
            styles.emailAuthForm,
            !isSignup && styles.emailLoginForm,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: colors.radius + 8,
              paddingHorizontal: isSignup ? 22 : 0,
              paddingTop: isSignup ? 22 : 0,
              paddingBottom: isSignup ? 20 : 0,
            },
          ]}
        >
          {isSignup ? (
            <View style={styles.emailAuthHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={signupStep > 0 ? 'Previous signup step' : 'Back to sign-in options'}
                onPress={() => {
                  setLocalError(null);
                  clearAuthError();
                  if (signupStep > 0) setSignupStep((current) => current - 1);
                  else onBack();
                }}
                style={styles.emailBack}
              >
                <View style={[styles.emailBackIcon, { backgroundColor: colors.primary + '14' }]}>
                  <Feather name="arrow-left" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.emailBackText, { color: colors.primary }]}>Back</Text>
              </Pressable>
              <View style={styles.emailSignupIntroRow}>
                <View style={[styles.emailIllustration, { backgroundColor: colors.primary + '14' }]} accessible={false}>
                  <Feather name={activeSignupField.icon} size={27} color={colors.primary} />
                </View>
                <View style={styles.emailCardIntro}>
                  <Text style={[styles.emailHeroEyebrow, { color: colors.primary }]}>EXPERIENCES.FUN</Text>
                  <Text style={[styles.emailCardTitle, { color: colors.foreground }]}>{activeSignupField.title}</Text>
                  <Text style={[styles.emailCardBody, { color: colors.mutedForeground }]}>{activeSignupField.description}</Text>
                </View>
              </View>
              <View style={styles.emailSignupProgress}>
                <View style={styles.emailSignupProgressMeta}>
                  <Text style={[styles.emailSignupProgressLabel, { color: colors.primary }]}>
                    STEP {signupStep + 1} OF {signupFields.length}
                  </Text>
                  <Text style={[styles.emailSignupProgressHint, { color: colors.mutedForeground }]}>
                    {signupStep === signupFields.length - 1 ? 'Almost done' : 'Your progress is saved'}
                  </Text>
                </View>
                <View style={styles.emailSignupProgressTrack}>
                  {signupFields.map((field, index) => (
                    <View
                      key={field.label}
                      style={[
                        styles.emailSignupProgressSegment,
                        { backgroundColor: index <= signupStep ? colors.primary : colors.border },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={[colors.secondary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emailLoginHero}
            >
              <View
                pointerEvents="none"
                style={[styles.emailLoginOrbit, { borderColor: colors.primaryForeground }]}
              />
              <View
                pointerEvents="none"
                style={[styles.emailLoginOrbitSmall, { borderColor: colors.primaryForeground }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to sign-in options"
                onPress={() => {
                  setLocalError(null);
                  clearAuthError();
                  onBack();
                }}
                style={styles.emailLoginBack}
              >
                <Feather name="arrow-left" size={17} color={colors.primaryForeground} />
                <Text style={[styles.emailLoginBackText, { color: colors.primaryForeground }]}>Back</Text>
              </Pressable>
              <View style={styles.emailLoginHeroCopy}>
                <View style={styles.emailLoginBrandRow}>
                  <View style={[styles.emailLoginBrandMark, { borderColor: colors.primaryForeground }]}>
                    <Feather name="users" size={22} color={colors.primaryForeground} />
                  </View>
                  <View>
                    <Text style={[styles.emailLoginBrandName, { color: colors.primaryForeground }]}>
                      EXPERIENCES.FUN
                    </Text>
                    <Text style={[styles.emailLoginBrandCaption, { color: colors.primaryForeground }]}>
                      {accountType === 'organisation'
                        ? 'FOR ORGANISATIONS'
                        : accountType === 'participant'
                          ? 'FOR PEOPLE'
                          : 'SIGN IN'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.emailLoginHeroTitle, { color: colors.primaryForeground }]}>Log in</Text>
                <Text style={[styles.emailLoginHeroBody, { color: colors.primaryForeground }]}>
                  Welcome back. Enter your details below.
                </Text>
              </View>
            </LinearGradient>
          )}

          <View style={[styles.emailAuthFields, !isSignup && styles.emailLoginFields]}>
            {isSignup ? (
              <View style={styles.emailField}>
                <Text style={[styles.emailLabel, { color: colors.foreground }]}>{activeSignupField.label}</Text>
                <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                  <Feather name={activeSignupField.icon} size={17} color={colors.primary} style={styles.emailInputIcon} />
                  <TextInput
                    key={`signup-${signupStep}`}
                    ref={inputRef}
                    testID={`email-signup-${activeSignupField.label.toLowerCase().replaceAll(' ', '-')}`}
                    accessibilityLabel={activeSignupField.label}
                    value={activeSignupValue}
                    onChangeText={updateActiveSignupValue}
                    onSubmitEditing={() => { void continueSignup(); }}
                    placeholder={activeSignupField.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize={activeSignupField.autoCapitalize}
                    autoComplete={activeSignupField.autoComplete}
                    keyboardType={activeSignupField.keyboardType}
                    returnKeyType={activeSignupField.returnKeyType}
                    secureTextEntry={activeSignupField.secureTextEntry}
                    style={[styles.emailInput, { color: colors.foreground }]}
                  />
                </View>
                <Text style={[styles.emailFieldHint, { color: colors.mutedForeground }]}>
                  {signupStep === 4
                    ? '5–32 characters. Letters, numbers and underscores only.'
                    : signupStep === 2
                      ? 'Choose a password with at least 8 characters.'
                      : activeSignupField.description}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.emailField}>
                  <Text style={[styles.emailLabel, { color: colors.foreground }]}>Email or username</Text>
                  <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                    <Feather name="mail" size={17} color={colors.primary} style={styles.emailInputIcon} />
                    <TextInput
                      testID="email-login-identifier"
                      accessibilityLabel="Email or username"
                      value={loginIdentifier}
                      onChangeText={setLoginIdentifier}
                      placeholder="you@example.com or username"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="none"
                      autoComplete="username"
                      keyboardType="email-address"
                      style={[styles.emailInput, { color: colors.foreground }]}
                    />
                  </View>
                </View>
              <View style={styles.emailField}>
                  <Text style={[styles.emailLabel, { color: colors.foreground }]}>Password</Text>
                  <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                    <Feather name="lock" size={17} color={colors.primary} style={styles.emailInputIcon} />
                    <TextInput
                      testID="email-login-password"
                      accessibilityLabel="Password"
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Your password"
                      placeholderTextColor={colors.mutedForeground}
                      secureTextEntry
                      autoCapitalize="none"
                      style={[styles.emailInput, { color: colors.foreground }]}
                    />
                  </View>
                </View>
              </>
            )}
            {localError || authError ? <Text testID="email-auth-error" accessibilityRole="alert" style={[styles.emailError, { color: colors.destructive }]}>{localError ?? authError}</Text> : null}
            <Button
              label={loading ? (isSignup ? 'Creating account…' : 'Logging in…') : (isSignup && signupStep < signupFields.length - 1 ? 'Continue' : isSignup ? 'Create account' : 'Log in')}
              disabled={loading || (isSignup
                ? !activeSignupValue.trim() || !accountType
                : !loginIdentifier.trim() || !password)}
              onPress={() => { void (isSignup ? continueSignup() : submitLogin()); }}
              icon={isSignup ? 'user-plus' : 'log-in'}
              color={colors.primary}
              style={styles.emailSubmitButton}
              testID="email-auth-submit"
            />
            {isSignup && signupStep > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => { setLocalError(null); setSignupStep((current) => current - 1); }}
                style={styles.emailSignupPrevious}
              >
                <Text style={[styles.emailSignupPreviousText, { color: colors.mutedForeground }]}>Previous step</Text>
              </Pressable>
            ) : (
              <View style={styles.emailSecureNote}>
                <Feather name="shield" size={12} color={colors.mutedForeground} />
                <Text style={[styles.emailSecureNoteText, { color: colors.mutedForeground }]}>Your details are kept secure</Text>
              </View>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            testID="email-auth-mode-switch"
            onPress={() => {
              setMode(isSignup ? 'login' : 'signup');
              setSignupStep(0);
              if (isSignup) setLoginIdentifier(email.trim());
              else setEmail('');
              setLocalError(null);
              clearAuthError();
            }}
            style={[
              styles.emailSwitchRow,
              !isSignup && styles.emailLoginSwitch,
              !isSignup && { borderTopColor: colors.border },
            ]}
          >
            <Text style={[styles.emailSwitchPrompt, { color: colors.mutedForeground }]}>{isSignup ? 'Already have an account?' : 'New to Experiences.fun?'}</Text>
            <Text style={[styles.emailSwitchLink, { color: colors.secondary }]}>{isSignup ? 'Log in' : 'Sign up'}</Text>
            <Feather name="arrow-up-right" size={15} color={colors.secondary} />
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function TalentWelcome({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { height: screenHeight } = useWindowDimensions();
  const welcome = colors.welcome;
  const isWeb = Platform.OS === 'web';
  const topInset = isWeb ? 8 : insets.top;
  const bottomInset = isWeb ? 24 : Math.max(insets.bottom, 16);
  const isCompactWelcome = screenHeight < 740;
  const heroStageHeight = isCompactWelcome
    ? Math.max(248, screenHeight * 0.37)
    : Math.min(screenHeight * 0.46, 390);
  const heroImageHeight = screenHeight;

  return (
    <View style={[styles.talentScreen, { backgroundColor: welcome.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={welcome.background} />
      <Image
        source={require('../assets/images/welcome-panorama.png')}
        resizeMode="cover"
        accessible={false}
        style={[styles.welcomeBackdrop, { height: heroImageHeight }]}
      />
      <View style={[styles.welcomeOverlay, { height: heroImageHeight, pointerEvents: 'none' }]}>
        <LinearGradient
          colors={[welcome.overlayTop, welcome.overlayMid, welcome.overlayBottom, welcome.background]}
          locations={[0, 0.43, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[welcome.overlayLeft, welcome.overlayRight]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        style={styles.welcomeScroll}
        contentContainerStyle={[
          styles.welcomeScrollContent,
          { minHeight: Math.max(0, screenHeight - topInset - bottomInset), paddingTop: topInset, paddingBottom: bottomInset },
        ]}
      >
        <View style={[styles.welcomeHeader, { paddingHorizontal: 26 }]}>
          <Text style={styles.welcomeBrand} accessibilityLabel="Experiences dot fun">
            <Text style={{ color: welcome.foreground }}>experiences</Text>
            <Text style={{ color: colors.primary }}>.fun</Text>
          </Text>
          <View style={{ width: 54 }} />
        </View>

        <View style={[styles.welcomeHeroStage, { height: heroStageHeight, marginHorizontal: 26 }]}>
          <View style={[styles.welcomeXpCard, { backgroundColor: welcome.surface, borderColor: welcome.border }]}>
            <View style={[styles.welcomeMedal, { backgroundColor: colors.primary }]}>
              <Feather name="award" size={19} color={welcome.gold} />
            </View>
            <View style={styles.welcomeXpCopy}>
              <Text style={[styles.welcomeXpValue, { color: welcome.foreground }]}>+50 XP</Text>
              <Text style={[styles.welcomeXpLabel, { color: welcome.muted }]}>Community Clean-Up</Text>
            </View>
          </View>
        </View>

        <View style={styles.welcomeContent}>
          <Text style={[styles.welcomeTitle, { color: welcome.foreground }]}>
            Find your people.{'\n'}<Text style={{ color: colors.primary }}>Make a difference.</Text>
          </Text>
          <View style={styles.welcomeDetails}>
            <Text style={[styles.welcomeDescription, { color: welcome.muted }]}>
              Discover local experiences, get involved in your community, and see the impact you make.
            </Text>

            <View style={styles.welcomeSocialProof}>
              <View style={styles.welcomeAvatars} accessibilityLabel="Community members">
                {[
                  { initials: 'A', backgroundColor: colors.teal },
                  { initials: 'J', backgroundColor: colors.secondary },
                  { initials: 'M', backgroundColor: colors.primary },
                ].map((avatar) => (
                  <View key={avatar.initials} style={[styles.welcomeAvatar, { backgroundColor: avatar.backgroundColor, borderColor: welcome.background }]}>
                    <Text style={[styles.welcomeAvatarInitial, { color: colors.primaryForeground }]}>{avatar.initials}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.welcomeSocialText, { color: welcome.muted }]}>
                Join a growing community making change, together.
              </Text>
            </View>

            <View style={[styles.welcomeAuthActions, { flexDirection: 'column' }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Get started"
                accessibilityHint="Continue to choose a Participant or Organisation account"
                testID="welcome-start"
                onPressIn={triggerHaptic}
                onPress={onContinue}
                style={({ pressed }) => [
                  styles.welcomeTelegramButton,
                  {
                    width: '100%',
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.welcomeTelegramLabel, { color: colors.primaryForeground }]}>Get started</Text>
                <Feather name="arrow-right" size={20} color={colors.primaryForeground} />
              </Pressable>
            </View>

            <Text style={[styles.welcomeTelegramNote, { color: welcome.muted }]}>
              Choose Participant or Organisation to get started.
            </Text>
          </View>
        </View>
        {isWeb ? <View style={[styles.welcomeHomeIndicator, { backgroundColor: welcome.foreground }]} /> : null}
      </ScrollView>
    </View>
  );
}

function FlowProgressHeader({
  step,
  total,
  label,
  onBack,
}: {
  step: number;
  total: number;
  label: string;
  onBack?: () => void;
}) {
  const colors = useColors();
  const progress = Math.round((step / total) * 100);

  return (
    <View style={styles.flowHeader}>
      <View style={styles.flowHeaderTop}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => { triggerHaptic(); onBack(); }}
            style={[styles.flowBackButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
        ) : <View style={styles.flowBackSpacer} />}
        <View style={styles.flowBrandLockup}>
          <View style={[styles.flowBrandMark, { backgroundColor: colors.primary }]}>
            <Feather name="compass" size={15} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.flowBrandText, { color: colors.foreground }]}>
            experiences<Text style={{ color: colors.primary }}>.fun</Text>
          </Text>
        </View>
        <Text style={[styles.flowStepCount, { color: colors.mutedForeground }]}>
          {String(step).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </Text>
      </View>
      <View style={styles.flowProgressMeta}>
        <Text style={[styles.flowProgressLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.flowProgressHint, { color: colors.mutedForeground }]}>{progress}% complete</Text>
      </View>
      <View
        accessibilityLabel={`Progress: step ${step} of ${total}`}
        accessibilityValue={{ min: 0, max: total, now: step }}
        style={[styles.flowProgressTrack, { backgroundColor: colors.border }]}
      >
        <View style={[styles.flowProgressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

function AccountTypeSelection({
  selectedType,
  onSelect,
  onBack,
  onContinue,
}: {
  selectedType: UserType | null;
  onSelect: (value: UserType) => void;
  onBack?: () => void;
  onContinue: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const options: Array<{ value: UserType; title: string; description: string; icon: IconName }> = [
    {
      value: 'participant',
      title: 'Participant',
      description: 'Discover local experiences, meet people and build your contribution history.',
      icon: 'compass',
    },
    {
      value: 'organisation',
      title: 'Organisation',
      description: 'Bring your community together, host experiences and see your impact.',
      icon: 'briefcase',
    },
  ];

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.onboarding, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.flowScreenContent, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 24) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <FlowProgressHeader step={1} total={2} label="ACCOUNT TYPE" onBack={onBack} />
      <View style={styles.flowContent}>
        <View style={[styles.flowHeroBadge, { backgroundColor: colors.primary + '14' }]}>
          <Feather name="users" size={25} color={colors.primary} />
        </View>
        <Text style={[styles.flowEyebrow, { color: colors.primary }]}>YOUR PLACE IN THE COMMUNITY</Text>
        <Text style={[styles.flowTitle, { color: colors.foreground }]}>What brings you here?</Text>
        <Text style={[styles.flowDescription, { color: colors.mutedForeground }]}>
          Choose the path that fits. We’ll shape your Experiences.fun profile around it.
        </Text>

        <View style={styles.accountTypeOptions}>
          {options.map((option) => {
            const selected = selectedType === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                testID={`account-type-${option.value}`}
                onPress={() => { triggerHaptic(); onSelect(option.value); }}
                style={[
                  styles.accountTypeCard,
                  {
                    backgroundColor: selected ? colors.primary + '08' : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={[styles.accountTypeIcon, { backgroundColor: selected ? colors.primary + '14' : colors.muted }]}>
                  <Feather name={option.icon} size={21} color={selected ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={styles.accountTypeCopy}>
                  <Text style={[styles.accountTypeTitle, { color: colors.foreground }]}>{option.title}</Text>
                  <Text style={[styles.accountTypeDescription, { color: colors.mutedForeground }]}>{option.description}</Text>
                </View>
                <View style={[styles.accountTypeRadio, { borderColor: selected ? colors.primary : colors.border }]}>
                  {selected ? <View style={[styles.accountTypeRadioInner, { backgroundColor: colors.primary }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.flowReassurance}>
          <Feather name="edit-3" size={14} color={colors.mutedForeground} />
          <Text style={[styles.flowReassuranceText, { color: colors.mutedForeground }]}>
            You can update your profile details any time.
          </Text>
        </View>
      </View>
      <View style={[styles.flowFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Button
          label="Continue"
          disabled={!selectedType}
          onPress={onContinue}
          icon="arrow-right"
          testID="account-type-continue"
        />
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function LoginChoiceScreen({
  accountType,
  onBack,
  onEmail,
  onTelegram,
}: {
  accountType: UserType;
  onBack: () => void;
  onEmail: () => void;
  onTelegram: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { inTelegram, loading, authError, clearAuthError } = useAuth();
  const accountLabel = accountType === 'organisation' ? 'Organisation' : 'Participant';

  const continueWithTelegram = () => {
    clearAuthError();
    if (inTelegram) onTelegram();
    else openTelegramBot();
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.onboarding, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.flowScreenContent, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 24) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <FlowProgressHeader
        step={2}
        total={2}
        label="SIGN IN"
        onBack={() => { clearAuthError(); onBack(); }}
      />
      <View style={styles.flowContent}>
        <View style={[styles.flowHeroBadge, { backgroundColor: colors.primary + '14' }]}>
          <Feather name="lock" size={23} color={colors.primary} />
        </View>
        <Text style={[styles.flowEyebrow, { color: colors.primary }]}>{accountLabel.toUpperCase()} PROFILE</Text>
        <Text style={[styles.flowTitle, { color: colors.foreground }]}>Let’s get you started.</Text>
        <Text style={[styles.flowDescription, { color: colors.mutedForeground }]}>
          Sign in or create an account to continue as a {accountLabel.toLowerCase()}.
        </Text>

        <View style={styles.loginMethods}>
          <Button
            label={loading ? 'Connecting…' : inTelegram ? 'Continue with Telegram' : 'Open Telegram'}
            disabled={loading}
            onPress={continueWithTelegram}
            icon="send"
          />
          {authError ? <InlineError message={authError} /> : null}
          <Button
            label="Continue with email"
            variant="secondary"
            color={colors.card}
            textColor={colors.foreground}
            onPress={() => { clearAuthError(); onEmail(); }}
            icon="mail"
            testID="login-choice-email"
          />
        </View>
        <View style={styles.flowReassurance}>
          <Feather name="shield" size={14} color={colors.mutedForeground} />
          <Text style={[styles.flowReassuranceText, { color: colors.mutedForeground }]}>
            Returning? Use the same sign-in method as before.
          </Text>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function SignupCongratulations({
  user,
  onContinue,
}: {
  user: User;
  onContinue: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAwareScrollViewCompat
      testID="signup-congratulations"
      style={[styles.signupCongratsScreen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.signupCongratsContent,
        {
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      bottomOffset={24}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.signupCongratsMark, { backgroundColor: colors.primary + '14' }]}>
        <Feather name="check" size={32} color={colors.primary} />
      </View>
      <Text style={[styles.signupCongratsEyebrow, { color: colors.primary }]}>
        WELCOME TO EXPERIENCES.FUN
      </Text>
      <Text accessibilityRole="header" style={[styles.signupCongratsTitle, { color: colors.foreground }]}>
        Congratulations — you’re in.
      </Text>
      <Text style={[styles.signupCongratsBody, { color: colors.mutedForeground }]}>
        Your account is ready. Set up your profile to find experiences and opportunities that fit you.
      </Text>

      <View
        testID="signup-reward-50"
        style={[
          styles.signupCongratsReward,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius * 2,
          },
        ]}
      >
        <View style={[styles.signupCongratsRewardIcon, { backgroundColor: colors.success + '14' }]}>
          <Feather name="award" size={27} color={colors.success} />
        </View>
        <View style={styles.signupCongratsRewardCopy}>
          <Text style={[styles.signupCongratsRewardTitle, { color: colors.success }]}>
            +{user.xp} XP
          </Text>
          <Text style={[styles.signupCongratsRewardText, { color: colors.mutedForeground }]}>
            Added to your account for signing up
          </Text>
        </View>
      </View>

      <Button
        label="Continue to profile setup"
        icon="arrow-right"
        onPress={onContinue}
        testID="signup-congratulations-continue"
      />
    </KeyboardAwareScrollViewCompat>
  );
}

function Onboarding({
  user,
  accountType: initialAccountType,
  onDone,
}: {
  user: User;
  accountType: UserType;
  onDone: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const update = useUpdateMe();
  const { refresh } = useAuth();
  const accountType = user.userType ?? initialAccountType;
  const totalSteps = 4;
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState<ExperienceCategory[]>(user.interests ?? []);
  const [city, setCity] = useState(user.city ?? '');
  const [organisationName, setOrganisationName] = useState(user.organisation?.name ?? '');
  const [organisationDescription, setOrganisationDescription] = useState(user.organisation?.description ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [name, setName] = useState(user.name ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase();
  const usernameIsValid = /^[a-z0-9_]{5,32}$/.test(normalizedUsername);

  const steps = accountType === 'organisation'
    ? [
        { label: 'CONTACT', eyebrow: 'THE PERSON BEHIND IT', title: 'Who will people connect with?', description: 'Add the name of the person representing your organisation.', icon: 'user' as IconName },
        { label: 'ORGANISATION', eyebrow: 'YOUR ORGANISATION', title: 'Introduce your organisation.', description: 'Give participants a clear picture of the community and work you bring together.', icon: 'briefcase' as IconName },
        { label: 'LOCATION & FOCUS', eyebrow: 'YOUR COMMUNITY', title: 'Where does your work happen?', description: 'Set your base and choose the causes your organisation supports.', icon: 'map-pin' as IconName },
        { label: 'PROFILE PREVIEW', eyebrow: 'READY TO BEGIN', title: 'Your organisation is taking shape.', description: 'Review the essentials before creating your profile.', icon: 'award' as IconName },
      ]
    : [
        { label: 'YOUR PROFILE', eyebrow: 'FIRST, THE BASICS', title: 'A name people will recognise.', description: 'This is how you’ll appear to people you meet through Experiences.fun.', icon: 'user' as IconName },
        { label: 'YOUR INTERESTS', eyebrow: 'WHAT YOU CARE ABOUT', title: 'What would you like to do more of?', description: 'Choose the causes you want to see first. Select at least one.', icon: 'heart' as IconName },
        { label: 'YOUR AREA', eyebrow: 'MAKE IT LOCAL', title: 'Where do you want to get involved?', description: 'We’ll use your city to surface experiences and opportunities nearby.', icon: 'map-pin' as IconName },
        { label: 'PROFILE PREVIEW', eyebrow: 'READY TO BEGIN', title: 'Your passport is taking shape.', description: 'Review the essentials before creating your profile.', icon: 'award' as IconName },
      ];
  const activeStep = steps[step - 1];

  const toggleInterest = (interest: ExperienceCategory) => {
    triggerHaptic();
    setInterests((current) => current.includes(interest)
      ? current.filter((value) => value !== interest)
      : [...current, interest]);
  };

  const renderInterestOption = (item: (typeof categories)[number]) => {
    const interest = item.key as ExperienceCategory;
    const selected = interests.includes(interest);
    const descriptions: Record<ExperienceCategory, string> = {
      environmental: 'Care for the places and planet we share.',
      education: 'Share knowledge, skills and curiosity.',
      community: 'Bring people together where you live.',
    };
    return (
      <Pressable
        key={item.key}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        onPress={() => toggleInterest(interest)}
        style={[
          styles.interestCard,
          {
            backgroundColor: selected ? colors.primary + '08' : colors.card,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        <View style={[styles.interestIcon, { backgroundColor: selected ? colors.primary + '14' : colors.muted }]}>
          <Feather name={item.icon} size={20} color={selected ? colors.primary : colors.mutedForeground} />
        </View>
        <View style={styles.interestCopy}>
          <Text style={[styles.interestTitle, { color: colors.foreground }]}>{item.label}</Text>
          <Text style={[styles.interestDescription, { color: colors.mutedForeground }]}>{descriptions[interest]}</Text>
        </View>
        <View style={[styles.interestCheck, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}>
          {selected ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
        </View>
      </Pressable>
    );
  };

  const next = async () => {
    triggerHaptic();
    Keyboard.dismiss();
    if (step === 1 && (!name.trim() || !usernameIsValid)) return;
    if (step === 2 && accountType === 'participant' && interests.length === 0) return;
    if (step === 2 && accountType === 'organisation' && (!organisationName.trim() || !organisationDescription.trim())) return;
    if (step === 3 && (!city.trim() || (accountType === 'organisation' && interests.length === 0))) return;

    if (step === totalSteps) {
      if (!user || !accountType) {
        setSaveError('Choose an account type before saving your profile.');
        return;
      }
      setSaveError(null);
      try {
        const data = accountType === 'organisation'
          ? {
              name: name.trim(),
              username: normalizedUsername,
              bio: bio.trim() || null,
              city: city.trim(),
              interests,
              participationType: 'host' as const,
              userType: accountType,
              organisation: {
                name: organisationName.trim(),
                description: organisationDescription.trim(),
                city: city.trim(),
                categories: interests,
              },
            }
          : {
              name: name.trim(),
              username: normalizedUsername,
              bio: bio.trim() || null,
              city: city.trim(),
              interests,
              participationType: 'join' as const,
              userType: accountType,
            };
        await update.mutateAsync({ data });
        invalidateAppQueries(queryClient);
        await refresh();
        onDone();
      } catch (error) {
        setSaveError(requestErrorMessage(error, 'We couldn’t save your profile. Your answers are still here—please try again.'));
      }
      return;
    }

    setStep((value) => Math.min(totalSteps, value + 1));
  };

  const previous = () => {
    triggerHaptic();
    Keyboard.dismiss();
    setStep((value) => Math.max(1, value - 1));
  };

  const stepIsInvalid =
    (step === 1 && (!name.trim() || !usernameIsValid)) ||
    (step === 2 && (accountType === 'participant'
      ? interests.length === 0
      : !organisationName.trim() || !organisationDescription.trim())) ||
    (step === 3 && (!city.trim() || (accountType === 'organisation' && interests.length === 0)));

  const reviewItems = accountType === 'organisation'
    ? [
        { label: 'Contact', value: name.trim() || 'Add a contact name', step: 1 },
        { label: 'Username', value: normalizedUsername ? `@${normalizedUsername}` : 'Choose a username', step: 1 },
        { label: 'Organisation', value: organisationName.trim() || 'Add an organisation name', step: 2 },
        { label: 'Location & focus', value: `${city.trim() || 'Add a city'} · ${interests.map((value) => categoryLabel[value]).join(', ') || 'Choose causes'}`, step: 3 },
      ]
    : [
        { label: 'Display name', value: name.trim() || 'Add your name', step: 1 },
        { label: 'Username', value: normalizedUsername ? `@${normalizedUsername}` : 'Choose a username', step: 1 },
        { label: 'Interests', value: interests.map((value) => categoryLabel[value]).join(', ') || 'Choose interests', step: 2 },
        { label: 'City', value: city.trim() || 'Add your city', step: 3 },
      ];

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.onboarding, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.flowScreenContent, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 24) }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      bottomOffset={24}
      showsVerticalScrollIndicator={false}
    >
      <FlowProgressHeader
        step={step}
        total={totalSteps}
        label={activeStep.label}
        onBack={step > 1 ? previous : undefined}
      />
      <View style={styles.flowContent}>
        <View style={[styles.flowHeroBadge, { backgroundColor: colors.primary + '14' }]}>
          <Feather name={activeStep.icon} size={23} color={colors.primary} />
        </View>
        <Text style={[styles.flowEyebrow, { color: colors.primary }]}>{activeStep.eyebrow}</Text>
        <Text style={[styles.flowTitle, { color: colors.foreground }]}>{activeStep.title}</Text>
        <Text style={[styles.flowDescription, { color: colors.mutedForeground }]}>{activeStep.description}</Text>

        {step === 1 ? (
          <View style={styles.flowForm}>
            <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>
              {accountType === 'organisation' ? 'Contact name' : 'Display name'}
            </Text>
            <TextInput
              accessibilityLabel={accountType === 'organisation' ? 'Contact name' : 'Display name'}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="done"
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.flowTextInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]}
            />
            <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>Public username</Text>
            <TextInput
              accessibilityLabel="Public username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
              returnKeyType="done"
              placeholder="yourusername"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.flowTextInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]}
            />
            <Text style={[styles.flowFieldHint, { color: colors.mutedForeground }]}>
              {user.email
                ? 'Choose a unique username for this profile.'
                : 'Choose a unique username for this profile. Your other account keeps its own history.'}
            </Text>
          </View>
        ) : null}

        {step === 2 && accountType === 'participant' ? (
          <View style={styles.interestList}>
            {categories.slice(1).map(renderInterestOption)}
          </View>
        ) : null}

        {step === 2 && accountType === 'organisation' ? (
          <View style={styles.flowForm}>
            <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>Organisation name</Text>
            <TextInput
              accessibilityLabel="Organisation name"
              value={organisationName}
              onChangeText={setOrganisationName}
              autoCapitalize="words"
              returnKeyType="next"
              placeholder="e.g. The Good Gym"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.flowTextInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]}
            />
            <View style={styles.flowFieldLabelRow}>
              <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>What does your organisation do?</Text>
              <Text style={[styles.optionalLabel, { color: colors.mutedForeground }]}>Required</Text>
            </View>
            <TextInput
              accessibilityLabel="Organisation description"
              value={organisationDescription}
              onChangeText={setOrganisationDescription}
              multiline
              maxLength={600}
              textAlignVertical="top"
              placeholder="Describe your community and the work you do"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.flowMultilineInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]}
            />
            <Text style={[styles.characterCount, { color: colors.mutedForeground }]}>{organisationDescription.length}/600</Text>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.flowForm}>
            <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>
              {accountType === 'organisation' ? 'Organisation city' : 'City or area'}
            </Text>
            <TextInput
              accessibilityLabel={accountType === 'organisation' ? 'Organisation city' : 'City or area'}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
              returnKeyType="done"
              placeholder="e.g. London"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.flowTextInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]}
            />
            {accountType === 'organisation' ? (
              <View style={styles.organisationFocusSection}>
                <View style={styles.flowFieldLabelRow}>
                  <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>Causes you support</Text>
                  <Text style={[styles.optionalLabel, { color: colors.mutedForeground }]}>Choose at least one</Text>
                </View>
                <View style={styles.interestList}>
                  {categories.slice(1).map(renderInterestOption)}
                </View>
              </View>
            ) : (
              <View style={[styles.flowTip, { backgroundColor: colors.muted }]}>
                <Feather name="map-pin" size={16} color={colors.primary} />
                <Text style={[styles.flowTipText, { color: colors.mutedForeground }]}>
                  Your city helps us bring nearby experiences to the front.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {step === totalSteps ? (
          <View style={styles.reviewSection}>
            <LinearGradient
              colors={[colors.secondary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.profilePreviewCard}
            >
              <View style={styles.profilePreviewBrand}>
                <View style={[styles.profilePreviewMark, { backgroundColor: colors.primaryForeground + '24' }]}>
                  <Feather name={accountType === 'organisation' ? 'briefcase' : 'award'} size={18} color={colors.primaryForeground} />
                </View>
                <Text style={[styles.profilePreviewEyebrow, { color: colors.primaryForeground }]}>
                  {accountType === 'organisation' ? 'ORGANISATION PROFILE' : 'EXPERIENCES PASSPORT'}
                </Text>
              </View>
              <Text style={[styles.profilePreviewTitle, { color: colors.primaryForeground }]} numberOfLines={2}>
                {accountType === 'organisation' ? organisationName.trim() || 'Your organisation' : name.trim() || 'Your name'}
              </Text>
              <Text style={[styles.profilePreviewBody, { color: colors.primaryForeground }]} numberOfLines={2}>
                {accountType === 'organisation'
                  ? organisationDescription.trim() || 'A clear introduction to your community.'
                  : `Participant${city.trim() ? ` · ${city.trim()}` : ''}`}
              </Text>
              <View style={styles.profilePreviewLocation}>
                <Feather name="map-pin" size={14} color={colors.primaryForeground} />
                <Text style={[styles.profilePreviewLocationText, { color: colors.primaryForeground }]}>{city.trim() || 'Your city'}</Text>
              </View>
              <View style={styles.profilePreviewTags}>
                {interests.map((interest) => (
                  <View key={interest} style={[styles.profilePreviewTag, { backgroundColor: colors.primaryForeground + '24' }]}>
                    <Text style={[styles.profilePreviewTagText, { color: colors.primaryForeground }]}>{categoryLabel[interest]}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>

            <View style={styles.reviewList}>
              {reviewItems.map((item) => (
                <View key={item.label} style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.reviewCopy}>
                    <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                    <Text style={[styles.reviewValue, { color: colors.foreground }]} numberOfLines={2}>{item.value}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.label}`}
                    onPress={() => { triggerHaptic(); setStep(item.step); }}
                    style={styles.reviewEditButton}
                  >
                    <Text style={[styles.reviewEditText, { color: colors.primary }]}>Edit</Text>
                    <Feather name="arrow-up-right" size={14} color={colors.primary} />
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.bioSection}>
              <View style={styles.flowFieldLabelRow}>
                <Text style={[styles.flowFieldLabel, { color: colors.foreground }]}>
                  {accountType === 'organisation' ? 'A note from your contact' : 'A little about you'}
                </Text>
                <Text style={[styles.optionalLabel, { color: colors.mutedForeground }]}>Optional</Text>
              </View>
              <TextInput
                accessibilityLabel={accountType === 'organisation' ? 'Contact bio' : 'Profile bio'}
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={280}
                textAlignVertical="top"
                placeholder={accountType === 'organisation' ? 'Add a short introduction from your contact' : 'Share a little about what you enjoy'}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.flowMultilineInput, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]}
              />
              <Text style={[styles.characterCount, { color: colors.mutedForeground }]}>{bio.length}/280</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={[styles.flowFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {saveError ? <InlineError message={saveError} /> : null}
        <Button
          label={update.isPending ? 'Saving profile…' : step === totalSteps ? (accountType === 'organisation' ? 'Create organisation profile' : 'Create my passport') : 'Continue'}
          disabled={update.isPending || stepIsInvalid}
          onPress={() => { void next(); }}
          icon={step === totalSteps ? 'check' : 'arrow-right'}
        />
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function Home({
  user,
  go,
  composerRequest,
  onComposerRequestHandled,
}: {
  user: User;
  go: (screen: Screen, params?: Record<string, string>) => void;
  composerRequest: number | null;
  onComposerRequestHandled: (signal: number) => void;
}) {
  const colors = useColors();
  const { user: authenticatedUser } = useAuth();
  const [feedRefreshSignal, setFeedRefreshSignal] = useState(0);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const query = useListExperiences({ availableOnly: true });
  const participations = useListMyParticipations(
    { status: 'upcoming' },
    { query: { enabled: user.userType === 'participant', queryKey: getListMyParticipationsQueryKey({ status: 'upcoming' }) } },
  );
  const directConversations = useListDirectConversations({
    query: {
      enabled: Boolean(authenticatedUser),
      queryKey: [...getListDirectConversationsQueryKey(), user.id],
      staleTime: 10_000,
      refetchInterval: 30_000,
    },
  });
  const items = query.data ?? [];
  const firstName = user.name.split(' ')[0];
  const upcomingCount = participations.data?.length ?? 0;
  const unreadDirectMessageCount = (directConversations.data ?? [])
    .reduce((total, conversation) => total + conversation.unreadCount, 0);

  return (
      <ScrollView
      style={[styles.dashboardScreen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.dashboardContent, { paddingTop: 12 }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching || participations.isRefetching || feedRefreshing}
          onRefresh={() => {
            triggerHaptic();
            setFeedRefreshSignal((signal) => signal + 1);
            void Promise.all([query.refetch(), participations.refetch()]);
          }}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {!authenticatedUser ? <TelegramConnectCard /> : null}

      <View style={styles.dashboardHero}>
        <View style={styles.dashboardGreeting}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            testID="dashboard-profile-button"
            onPress={() => { triggerHaptic(); go('profile'); }}
            style={({ pressed }) => [styles.dashboardHeroAvatarButton, pressed && styles.dashboardHeroActionPressed]}
          >
            <UserAvatar
              avatarUrl={user.avatarUrl}
              name={user.name}
              containerStyle={[styles.dashboardHeroAvatar, { backgroundColor: colors.muted }]}
              initialStyle={{ color: colors.primary, fontFamily: 'Inter_700Bold' }}
            />
          </Pressable>
          <View style={styles.dashboardGreetingCopy}>
            <Text style={[styles.dashboardName, { color: colors.foreground }]} numberOfLines={1}>Hi, {firstName}</Text>
            <Text style={[styles.dashboardWelcome, { color: colors.mutedForeground }]}>Find your next way to contribute</Text>
          </View>
          <View style={styles.dashboardGreetingActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unreadDirectMessageCount > 0
                ? `Open messages, ${unreadDirectMessageCount} unread`
                : 'Open messages'}
              testID="dashboard-messages-button"
              onPress={() => { triggerHaptic(); go('messages'); }}
              style={({ pressed }) => [styles.dashboardHeroAction, pressed && styles.dashboardHeroActionPressed]}
            >
              <Feather name="message-circle" size={19} color={colors.foreground} />
              {unreadDirectMessageCount > 0 ? (
                <View style={[styles.dashboardMessageBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.dashboardMessageBadgeText}>
                    {unreadDirectMessageCount > 99 ? '99+' : unreadDirectMessageCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
              testID="dashboard-notifications-button"
              onPress={() => { triggerHaptic(); go('notifications'); }}
              style={({ pressed }) => [styles.dashboardHeroAction, pressed && styles.dashboardHeroActionPressed]}
            >
              <Feather name="bell" size={19} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.dashboardStatusCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Pressable
            testID="dashboard-first-experience"
            accessibilityRole="button"
            accessibilityLabel={upcomingCount ? 'Open your upcoming experiences' : 'Explore your first experience'}
            accessibilityHint={upcomingCount ? 'View your experience journey' : 'Find an experience to join'}
            onPress={() => { triggerHaptic(); go('experiences'); }}
            style={({ pressed }) => [
              styles.dashboardStatusPrompt,
              pressed && styles.dashboardStatusCardPressed,
            ]}
          >
            <View style={styles.dashboardStatusMain}>
              <View style={[styles.dashboardStatusIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name={upcomingCount ? 'calendar' : 'compass'} size={18} color={colors.primary} />
              </View>
              <View style={styles.dashboardStatusCopy}>
                <Text style={[styles.dashboardStatusTitle, { color: colors.foreground }]}>
                  {upcomingCount ? `${upcomingCount} experience${upcomingCount === 1 ? '' : 's'} coming up` : 'Ready for your first experience?'}
                </Text>
                <Text style={[styles.dashboardStatusSub, { color: colors.mutedForeground }]}>
                  {upcomingCount ? 'Your next plans are ready when you are.' : 'Find an experience you’ll look forward to.'}
                </Text>
                <View style={styles.dashboardStatusCta}>
                  <Text style={[styles.dashboardStatusCtaText, { color: colors.primary }]}>
                    {upcomingCount ? 'View upcoming experiences' : 'Explore experiences'}
                  </Text>
                  <Feather name="arrow-right" size={15} color={colors.primary} />
                </View>
              </View>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search experiences"
            accessibilityHint="Browse and filter available experiences"
            testID="dashboard-explore-button"
            onPress={() => { triggerHaptic(); go('explore'); }}
            style={({ pressed }) => [
              styles.dashboardHomeSearch,
              { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
              pressed && styles.dashboardStatusCardPressed,
            ]}
          >
            <Feather name="search" size={18} color={colors.mutedForeground} />
            <Text style={[styles.dashboardHomeSearchLabel, { color: colors.mutedForeground }]}>Search experiences</Text>
            <View style={[styles.dashboardHomeSearchFilter, { backgroundColor: colors.card }]}>
              <Feather name="sliders" size={16} color={colors.foreground} />
            </View>
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dashboardCategoryRow}>
            {categories.map((item) => {
              const selected = item.key === 'all';
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Explore ${item.label === 'All' ? 'all categories' : item.label} experiences`}
                  accessibilityState={{ selected }}
                  testID={`dashboard-category-${item.key}`}
                  key={item.key}
                  onPress={() => { triggerHaptic(); go('explore', { category: item.key }); }}
                  style={({ pressed }) => [
                    styles.dashboardCategory,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.76 : 1,
                    },
                  ]}
                >
                  <Feather name={item.icon} size={15} color={selected ? colors.primaryForeground : colors.mutedForeground} />
                  <Text style={[styles.dashboardCategoryText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
      {participations.isError ? <InlineError message="Your upcoming bookings couldn’t be loaded. Pull down to try again." /> : null}

      <View style={styles.dashboardSectionHeader}>
        <Text style={[styles.dashboardSectionTitle, { color: colors.foreground }]}>Your progress</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See your experience passport"
          onPress={() => { triggerHaptic(); go('profile'); }}
        >
          <Text style={[styles.dashboardSeeAll, { color: colors.primary }]}>See all</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your experience passport" onPress={() => { triggerHaptic(); go('profile'); }} style={[styles.dashboardPassportCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.dashboardPassportTop}>
          <View>
            <Text style={[styles.dashboardCardEyebrow, { color: colors.primary }]}>EXPERIENCE PASSPORT</Text>
            <Text style={[styles.dashboardPassportTitle, { color: colors.foreground }]}>{user.level}</Text>
          </View>
          <View style={[styles.dashboardPassportArt, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="award" size={28} color={colors.primary} />
          </View>
        </View>
        <View style={styles.dashboardPassportMetrics}>
          <View style={[styles.dashboardPassportMetric, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
            <View style={styles.dashboardPassportMetricLabelRow}>
              <Feather name="zap" size={13} color={colors.primary} />
              <Text style={[styles.dashboardPassportMetricLabel, { color: colors.mutedForeground }]}>XP EARNED</Text>
            </View>
            <View style={styles.dashboardPassportMetricValueRow}>
              <Text style={[styles.dashboardPassportMetricValue, { color: colors.foreground }]}>{user.xp.toLocaleString()}</Text>
              <Text style={[styles.dashboardPassportMetricUnit, { color: colors.mutedForeground }]}>XP</Text>
            </View>
          </View>
          <View style={[styles.dashboardPassportMetric, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
            <View style={styles.dashboardPassportMetricLabelRow}>
              <Feather name="check-circle" size={13} color={colors.primary} />
              <Text style={[styles.dashboardPassportMetricLabel, { color: colors.mutedForeground }]}>COMPLETED</Text>
            </View>
            <Text style={[styles.dashboardPassportMetricValue, { color: colors.foreground }]}>{user.completedCount}</Text>
          </View>
        </View>
      </Pressable>

      <SocialFeed
        currentUserId={user.id}
        refreshSignal={feedRefreshSignal}
        openComposerSignal={composerRequest}
        onComposerRequestHandled={onComposerRequestHandled}
        onRefreshingChange={setFeedRefreshing}
        onOpenExperience={(id) => go('experience', { id: String(id) })}
        onOpenFriend={(friendId) => go('friend-profile', { friendId: String(friendId) })}
        onOpenSelf={() => go('profile')}
        onOpenFriends={() => go('friends')}
        onOpenProfile={() => go('profile')}
        onOpenExplore={() => go('explore')}
      />

      <View style={styles.dashboardSectionHeader}>
        <Text style={[styles.dashboardSectionTitle, { color: colors.foreground }]}>Upcoming near you</Text>
        <Pressable accessibilityRole="button" onPress={() => { triggerHaptic(); go('explore'); }}>
          <Text style={[styles.dashboardSeeAll, { color: colors.primary }]}>See all</Text>
        </Pressable>
      </View>

      {query.isLoading ? <LoadingState /> : query.isError ? (
        <EmptyState title="Experiences didn’t load" body="Your local opportunities are still there. Try again, or browse the full list." actionLabel="Try again" onAction={() => { void query.refetch(); }} />
      ) : items.length ? items.slice(0, 3).map((item) => (
        <Pressable
          testID="profile-metric-completed"
          accessibilityRole="button"
          accessibilityLabel={`View ${item.title}`}
          key={item.id}
          onPress={() => { triggerHaptic(); go('experience', { id: String(item.id) }); }}
          style={({ pressed }) => [styles.dashboardEventCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 8, opacity: pressed ? 0.94 : 1 }]}
        >
          <View style={styles.dashboardEventPhoto}>
            {item.category === 'community' ? (
              <ImageBackground
                source={require('../assets/images/community-cover.jpg')}
                accessibilityLabel="Community experience category artwork"
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.03)', 'rgba(0,0,0,0.2)']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
              </ImageBackground>
            ) : (
              <LinearGradient
                colors={categoryGradients[item.category] || categoryGradients.community}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Feather name={categoryIcon[item.category]} size={58} color={colors.primaryForeground} style={{ opacity: 0.22 }} />
              </LinearGradient>
            )}
            <View style={styles.dashboardEventPhotoTop}>
              <View style={[styles.dashboardEventCategory, { backgroundColor: colors.card }]}>
                <Feather name={categoryIcon[item.category]} size={13} color={colors.primary} />
                <Text style={[styles.dashboardEventCategoryText, { color: colors.foreground }]}>{categoryLabel[item.category]}</Text>
              </View>
            </View>
          </View>
          <View style={styles.dashboardEventFooter}>
            <View style={[styles.dashboardEventDate, { backgroundColor: colors.muted }]}>
              <Feather name="calendar" size={13} color={colors.primary} />
              <Text style={[styles.dashboardEventDateText, { color: colors.foreground }]} numberOfLines={1}>{dateLabel(item.date)}</Text>
            </View>
            <View style={styles.dashboardEventSummary}>
              <Text style={[styles.dashboardEventCardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
              <View style={styles.dashboardEventLocation}>
                <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                <Text style={[styles.dashboardEventCardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.city}</Text>
              </View>
            </View>
            <View style={[styles.dashboardEventXp, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
              <Text style={[styles.dashboardEventXpText, { color: colors.primary }]} numberOfLines={1}>+{item.xpReward} XP</Text>
            </View>
          </View>
        </Pressable>
      )) : (
        <Pressable accessibilityRole="button" onPress={() => { triggerHaptic(); go('explore'); }} style={[styles.dashboardEmptyEvent, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.dashboardEventIcon, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="compass" size={24} color={colors.primary} />
          </View>
          <View style={styles.dashboardEventCopy}>
            <Text style={[styles.dashboardEventTitle, { color: colors.foreground }]}>Find your next good thing</Text>
            <Text style={[styles.dashboardEventMeta, { color: colors.mutedForeground }]}>Explore experiences happening near you</Text>
          </View>
          <Feather name="arrow-right" size={22} color={colors.primary} />
        </Pressable>
      )}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function Explore({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const routeParams = useLocalSearchParams<{ category?: string }>();
  const initialCategory = categories.find((item) => item.key === routeParams.category)?.key ?? 'all';
  const [category, setCategory] = useState<ExperienceCategory | 'all'>(initialCategory);
  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  const sheetHeight = useRef(new Animated.Value(190)).current;
  const sheetTouchOrigin = useRef({ y: 0, active: false });
  const collapsedSheetHeight = screenHeight > 0
    ? Math.min(208, Math.max(176, screenHeight * 0.34))
    : 190;
  const expandedSheetHeight = screenHeight > 0
    ? Math.max(collapsedSheetHeight, Math.min(screenHeight * 0.72, screenHeight - 212))
    : 390;
  const sheetPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy < -40 || gesture.vy < -0.55) setSheetExpanded(true);
      else if (gesture.dy > 40 || gesture.vy > 0.55) setSheetExpanded(false);
    },
  }), []);
  useEffect(() => {
    if (!screenHeight) return;
    const animation = Animated.spring(sheetHeight, {
      toValue: sheetExpanded ? expandedSheetHeight : collapsedSheetHeight,
      tension: 115,
      friction: 19,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [collapsedSheetHeight, expandedSheetHeight, screenHeight, sheetExpanded, sheetHeight]);
  const query = useListExperiences({ category: category === 'all' ? undefined : category, search: search.trim() || undefined, availableOnly: false });
  const friendsQuery = useListFriends({ query: { queryKey: getListFriendsQueryKey(), enabled: Boolean(user) } });
  const friendLocations = useMemo<GlobeFriend[]>(
    () => (friendsQuery.data ?? []).flatMap((friend) => {
      const city = friend.city?.trim();
      const coordinates = city ? exploreCityCoordinates[normalizeExploreCityName(city)] : undefined;
      if (!city || !coordinates) return [];
      return [{
        id: friend.id,
        name: friend.name,
        avatarUrl: friend.avatarUrl ?? null,
        city,
        ...coordinates,
      }];
    }),
    [friendsQuery.data],
  );
  const globeCities: GlobeCity[] = [];
  const cityAggregates = new Map<string, GlobeCity>();
  (query.data ?? []).forEach((experience) => {
    const cityKey = normalizeExploreCityName(experience.city);
    const coordinates = exploreCityCoordinates[cityKey];
    if (!coordinates) return;
    const aggregate = cityAggregates.get(cityKey) ?? {
      city: experience.city,
      ...coordinates,
      experiences: 0,
      participants: 0,
      places: 0,
      xpOffered: 0,
    };
    aggregate.experiences += 1;
    aggregate.participants += experience.participantCount;
    aggregate.places += experience.availablePlaces;
    aggregate.xpOffered += experience.xpReward;
    cityAggregates.set(cityKey, aggregate);
  });
  globeCities.push(...cityAggregates.values());
  const visibleExperiences = selectedCity
    ? (query.data ?? []).filter((experience) => normalizeExploreCityName(experience.city) === normalizeExploreCityName(selectedCity))
    : (query.data ?? []);
  const toggleSheet = () => setSheetExpanded((current) => !current);
  const selectCity = (city: string) => {
    setSelectedCity(city);
    setSheetExpanded(true);
  };
  const friendMapHint = showFriends
    ? friendsQuery.isLoading
      ? 'Loading friend cities…'
      : friendsQuery.isError
        ? 'Friend locations could not load'
        : friendLocations.length
          ? 'Approximate profile cities · not live locations'
          : 'No friends with a mapped profile city yet'
    : sheetExpanded
      ? 'Swipe down · city locations are approximate'
      : 'Swipe up · city locations are approximate';
  const categoryFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.filterRow, styles.exploreFullscreenFilterRow]}
    >
      {categories.map((item) => {
        const selected = category === item.key;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show ${item.label === 'All' ? 'all' : item.label} experiences`}
            accessibilityState={{ selected }}
            testID={`explore-category-${item.key}`}
            key={item.key}
            onPress={() => { triggerHaptic(); setCategory(item.key); }}
            style={({ pressed }) => [
              styles.filter,
              {
                backgroundColor: selected ? colors.primary : colors.card,
                borderColor: selected ? colors.primary : colors.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Feather name={item.icon} size={15} color={selected ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View
      testID="explore-screen-layout"
      style={[styles.exploreScreen, { backgroundColor: colors.background }]}
      onLayout={(event) => {
        const { height } = event.nativeEvent.layout;
        setScreenHeight((current) => current === height ? current : height);
      }}
    >
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <ExploreGlobe
          fullScreen
          cities={globeCities}
          friends={friendLocations}
          selectedCity={selectedCity}
          status={query.isLoading ? 'loading' : query.isError ? 'error' : 'ready'}
          showFriends={showFriends}
          onSelectCity={selectCity}
          onSelectFriend={(friendId) => go('friend-profile', { id: String(friendId) })}
          onExploreCity={selectCity}
          onResetCity={() => setSelectedCity(null)}
        />
      </View>

      <View pointerEvents="box-none" style={styles.exploreTopOverlay}>
        <View style={[styles.exploreTopBar, styles.exploreFullscreenTopBar]}>
          <View style={styles.exploreTopActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showFriends ? 'Hide friend locations' : 'Show friend locations'}
              accessibilityState={{ selected: showFriends }}
              testID="explore-friends-toggle"
              onPress={() => { triggerHaptic(); setShowFriends((current) => !current); }}
              style={({ pressed }) => [
                styles.exploreFriendsToggle,
                {
                  backgroundColor: showFriends ? colors.primary : colors.welcome.surface,
                  borderColor: showFriends ? colors.primary : colors.welcome.border,
                },
                pressed && styles.exploreTopActionPressed,
              ]}
            >
              <Feather name="users" size={15} color={showFriends ? colors.primaryForeground : colors.welcome.foreground} />
              <Text style={[styles.exploreFriendsToggleText, { color: showFriends ? colors.primaryForeground : colors.welcome.foreground }]}>Friends</Text>
              {friendLocations.length > 0 ? (
                <Text style={[styles.exploreFriendsToggleCount, { color: showFriends ? colors.primaryForeground : colors.welcome.muted }]}>{friendLocations.length}</Text>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
              testID="explore-notifications-button"
              onPress={() => { triggerHaptic(); go('notifications'); }}
              style={({ pressed }) => [styles.exploreTopAction, pressed && styles.exploreTopActionPressed]}
            >
              <Feather name="bell" size={19} color={colors.welcome.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              testID="explore-profile-button"
              onPress={() => { triggerHaptic(); go('profile'); }}
              style={({ pressed }) => [styles.exploreAvatarButton, pressed && styles.exploreTopActionPressed]}
            >
              <UserAvatar
                avatarUrl={user?.avatarUrl}
                name={user?.name ?? 'Your profile'}
                containerStyle={[styles.exploreAvatar, { backgroundColor: colors.muted }]}
                initialStyle={{ color: colors.primary, fontFamily: 'Inter_700Bold' }}
              />
            </Pressable>
          </View>
        </View>

        <View style={[
          styles.searchBox,
          styles.exploreFullscreenSearchBox,
          { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius },
        ]}>
          <Feather name="search" size={19} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel="Search experiences"
            testID="explore-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search experiences"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              testID="explore-clear-search"
              onPress={() => { triggerHaptic(); setSearch(''); }}
              style={styles.exploreClearButton}
            >
              <Feather name="x" size={17} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        {!showFriends ? categoryFilters : null}
      </View>

      <Animated.View
        testID="explore-experience-sheet"
        style={[
          styles.exploreSheet,
          { height: sheetHeight, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          testID="explore-sheet-handle"
          style={styles.exploreSheetHeader}
          {...(Platform.OS === 'web' ? {} : sheetPanResponder.panHandlers)}
          onTouchStart={Platform.OS === 'web' ? (event) => {
            const touch = event.nativeEvent.touches[0];
            if (touch) sheetTouchOrigin.current = { y: touch.pageY, active: true };
          } : undefined}
          onTouchMove={Platform.OS === 'web' ? (event) => {
            const touch = event.nativeEvent.touches[0];
            if (!touch || !sheetTouchOrigin.current.active) return;
            if (Math.abs(touch.pageY - sheetTouchOrigin.current.y) > 8) event.preventDefault();
          } : undefined}
          onTouchEnd={Platform.OS === 'web' ? (event) => {
            const touch = event.nativeEvent.changedTouches[0];
            if (!touch || !sheetTouchOrigin.current.active) return;
            const deltaY = touch.pageY - sheetTouchOrigin.current.y;
            if (deltaY < -40) setSheetExpanded(true);
            else if (deltaY > 40) setSheetExpanded(false);
            sheetTouchOrigin.current.active = false;
          } : undefined}
          onTouchCancel={Platform.OS === 'web' ? () => { sheetTouchOrigin.current.active = false; } : undefined}
        >
          <View style={[styles.exploreSheetGrabber, { backgroundColor: colors.border }]} />
          <View style={styles.exploreSheetHeadingRow}>
            <View style={styles.exploreSheetHeadingCopy}>
              <Text style={[styles.exploreSheetTitle, { color: colors.foreground }]}>
                {selectedCity ? `${selectedCity} experiences` : 'Experiences'}
              </Text>
              <Text style={[styles.exploreSheetHint, { color: colors.mutedForeground }]}>
                {friendMapHint}
              </Text>
            </View>
            <Text testID="explore-results-count" style={[styles.exploreSheetCount, { color: colors.mutedForeground }]}>
              {visibleExperiences.length} {visibleExperiences.length === 1 ? 'experience' : 'experiences'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sheetExpanded ? 'Collapse experience list' : 'Expand experience list'}
              accessibilityState={{ expanded: sheetExpanded }}
              testID="explore-sheet-toggle"
              onPress={toggleSheet}
              style={styles.exploreSheetToggle}
            >
              <Feather name={sheetExpanded ? 'chevron-down' : 'chevron-up'} size={19} color={colors.foreground} />
            </Pressable>
          </View>
          {selectedCity ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${selectedCity} city filter`}
              testID="explore-clear-city"
              onPress={() => setSelectedCity(null)}
              style={[styles.exploreCityFilter, { backgroundColor: colors.muted }]}
            >
              <Feather name="x" size={12} color={colors.mutedForeground} />
              <Text style={[styles.exploreCityFilterText, { color: colors.mutedForeground }]}>{selectedCity}</Text>
            </Pressable>
          ) : null}
        </View>
        {showFriends ? <View style={styles.exploreFriendsFilterSlot}>{categoryFilters}</View> : null}
        <ScrollView
          testID="explore-sheet-list"
          style={styles.exploreSheetScroll}
          contentContainerStyle={styles.exploreSheetScrollContent}
          scrollEnabled={sheetExpanded}
          showsVerticalScrollIndicator={sheetExpanded}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {query.isLoading ? <LoadingState /> : query.isError ? (
            <EmptyState title="Experiences didn’t load" body="Check your connection and try again." actionLabel="Try again" onAction={() => { void query.refetch(); }} />
          ) : visibleExperiences.length ? visibleExperiences.map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title={selectedCity ? `No experiences in ${selectedCity}` : 'No experiences match'} body="Try another category or come back when local hosts publish something new." actionLabel={selectedCity ? 'Clear city filter' : undefined} onAction={selectedCity ? () => setSelectedCity(null) : undefined} />}
          <View style={{ height: 24 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function Detail({ id, go }: { id: number; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const query = useGetExperience(id, { query: { queryKey: getGetExperienceQueryKey(id), enabled: Number.isSafeInteger(id) && id > 0 } });
  const join = useJoinExperience({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const submit = useSubmitCompletion({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const submitMilestone = useSubmitExperienceMilestone({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const [actionError, setActionError] = useState<string | null>(null);
  const item = query.data as ExperienceDetail | undefined;

  const joinExperience = async () => {
    setActionError(null);
    try {
      await join.mutateAsync({ experienceId: id });
    } catch (error) {
      setActionError(requestErrorMessage(error, 'We couldn’t join this experience. Please try again.'));
    }
  };
  const submitCompletion = async (participationId: number) => {
    setActionError(null);
    try {
      await submit.mutateAsync({ participationId });
    } catch (error) {
      setActionError(requestErrorMessage(error, 'Your completion wasn’t submitted. Please try again.'));
    }
  };
  const submitMilestoneCompletion = async (participationId: number, milestoneId: number) => {
    setActionError(null);
    try {
      await submitMilestone.mutateAsync({ participationId, milestoneId });
    } catch (error) {
      setActionError(requestErrorMessage(error, 'This milestone wasn’t submitted. Please try again.'));
    }
  };

  if (!Number.isSafeInteger(id) || id <= 0) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Experience" onBack={() => go('explore')} /><EmptyState title="This experience link is invalid" body="Return to Explore and choose an available experience." actionLabel="Explore experiences" onAction={() => go('explore')} /></View>;
  }
  if (query.isLoading && !item) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Experience" onBack={() => go('explore')} /><LoadingState /></View>;
  }
  if (!item) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Experience" onBack={() => go('explore')} /><EmptyState title={query.isError ? 'Experience couldn’t be loaded' : 'Experience unavailable'} body={query.isError ? 'Check your connection and try again.' : 'This experience may have been archived.'} actionLabel={query.isError ? 'Try again' : 'Explore experiences'} onAction={query.isError ? () => { void query.refetch(); } : () => go('explore')} /></View>;
  }

  const participation = item.participation as Participation | null;
  const isWaitlisted = participation?.status === 'waitlisted';
  const configuredMilestones = item.milestones ?? [];
  const hasConfiguredMilestones = configuredMilestones.length > 0;
  const legacyTimelineStatus = participation?.status === 'verified'
    ? 'verified'
    : participation?.status === 'submitted'
      ? 'submitted'
      : participation?.status === 'rejected'
        ? 'rejected'
        : 'not_started';
  const timelineMilestones = hasConfiguredMilestones
    ? configuredMilestones
    : [{
        id: 0,
        position: 1,
        title: 'Complete this experience',
        description: 'This experience uses a single completion submission. XP is released after the host verifies it.',
        xpReward: item.xpReward,
        status: legacyTimelineStatus,
        submittedAt: participation?.submittedAt ?? null,
        verifiedAt: participation?.verifiedAt ?? null,
      }];
  const acceptsParticipants = item.status === 'published' || item.status === 'full';
  const gradient = categoryGradients[item.category] || categoryGradients.community;

  return (
    <View style={{ flex: 1, backgroundColor: colors.muted }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.muted }}
        contentContainerStyle={styles.detailScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailToolbar}>
          <Pressable
            testID="profile-metric-hosted"
            accessibilityRole="button"
            accessibilityLabel="Go back to experiences"
            onPress={() => { triggerHaptic(); go('explore'); }}
            style={[styles.detailToolbarButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.detailToolbarTitle, { color: colors.foreground }]}>Experience details</Text>
          <View style={styles.detailToolbarSpacer} />
        </View>

        {item.status === 'cancelled' ? (
          <View
            testID="experience-cancelled-notice"
            style={[styles.createTip, { backgroundColor: colors.destructive + '10', borderRadius: colors.radius, marginBottom: 12, padding: 13 }]}
          >
            <Feather name="slash" size={18} color={colors.destructive} />
            <Text style={[styles.createTipText, { color: colors.foreground, flex: 1 }]}>
              This experience was cancelled. New sign-ups are closed.
            </Text>
          </View>
        ) : null}

        <View style={[styles.detailHero, { borderRadius: colors.radius + 8 }]}>
          {item.category === 'community' ? (
            <ImageBackground
              source={require('../assets/images/community-cover.jpg')}
              accessibilityLabel="Community experience category artwork"
              resizeMode="cover"
              style={styles.detailCoverFill}
            >
              <LinearGradient
                colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.5)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
              <View style={styles.detailCoverBottom}>
                <View style={styles.detailCoverPill}>
                  <Feather name={categoryIcon[item.category]} size={14} color={colors.primary} />
                  <Text style={[styles.detailCoverPillText, { color: colors.primary }]}>{categoryLabel[item.category]}</Text>
                </View>
              </View>
            </ImageBackground>
          ) : (
            <LinearGradient colors={gradient} style={styles.detailCoverFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.detailCategoryFallback}>
                <View style={styles.detailHeroIcon}>
                  <Feather name={categoryIcon[item.category]} size={26} color="#ffffff" />
                </View>
                <Text style={styles.detailCategoryText}>{categoryLabel[item.category]}</Text>
              </View>
            </LinearGradient>
          )}
        </View>

        <View
          style={[
            styles.detailIntro,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius + 8,
            },
          ]}
        >
          <View style={styles.detailOrganisationLine}>
            <Text style={[styles.detailOrgText, { color: colors.foreground }]} numberOfLines={1}>{item.organisation.name}</Text>
            {item.organisation.verified ? (
              <View style={[styles.detailVerifiedBadge, { backgroundColor: colors.success + '12' }]}>
                <Feather name="check-circle" size={13} color={colors.success} />
                <Text style={[styles.detailVerifiedText, { color: colors.success }]}>Verified host</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.detailTitleText, { color: colors.foreground }]}>{item.title}</Text>
          <View style={[styles.detailAboutBlock, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
            <View style={[styles.detailAboutAccent, { backgroundColor: colors.primary }]} />
            <View style={styles.detailAboutCopy}>
              <Text style={[styles.detailAboutTitle, { color: colors.mutedForeground }]}>About this experience</Text>
              <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.description}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailMetaGrid}>
          <View style={[styles.metaBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
            <View style={styles.metaIconLabel}>
              <Feather name="calendar" size={15} color={colors.primary} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHEN</Text>
            </View>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>{dateLabel(item.date)}</Text>
            <Text style={[styles.metaSub, { color: colors.mutedForeground }]}>{item.startTime} – {item.endTime}</Text>
          </View>
          <View style={[styles.metaBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
            <View style={styles.metaIconLabel}>
              <Feather name="map-pin" size={15} color={colors.primary} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHERE</Text>
            </View>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>{item.city}</Text>
            <Text style={[styles.metaSub, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location}</Text>
          </View>
        </View>

        <View style={[styles.detailHostCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
          <View style={[styles.detailHostAvatar, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.detailHostInitial, { color: colors.primary }]}>{item.organisation.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailHostLabel, { color: colors.mutedForeground }]}>HOSTED BY</Text>
            <Text style={[styles.detailHostName, { color: colors.foreground }]}>{item.organisation.name}</Text>
          </View>
          {item.organisation.verified ? <Feather name="check-circle" size={19} color={colors.success} /> : null}
        </View>

        <View
          style={[
            styles.rewardPanel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius + 6,
            },
          ]}
        >
          <View style={styles.rewardCol}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]} numberOfLines={1}>YOU'LL EARN</Text>
            <Text style={[styles.detailReward, { color: colors.primary }]} numberOfLines={1}>+{item.xpReward} XP</Text>
          </View>
          {money(item.monetaryRewardPence) ? (
            <>
              <View style={[styles.rewardDivider, { backgroundColor: colors.border }]} />
              <View style={styles.rewardCol}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]} numberOfLines={1}>REWARD</Text>
                <Text style={[styles.detailReward, { color: colors.teal }]} numberOfLines={1}>{money(item.monetaryRewardPence)}</Text>
              </View>
            </>
          ) : null}
          <View style={[styles.rewardDivider, { backgroundColor: colors.border }]} />
          <View style={styles.rewardCol}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]} numberOfLines={1}>PLACES LEFT</Text>
            <Text style={[styles.detailReward, { color: colors.foreground }]} numberOfLines={1}>{item.availablePlaces}</Text>
          </View>
        </View>

        <View style={[styles.infoBlock, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
          <View style={styles.infoBlockHeading}>
            <View style={[styles.infoBlockIcon, { backgroundColor: colors.primary + '12' }]}>
              <Feather name="list" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>Completion timeline</Text>
              <Text style={[styles.detailBody, { color: colors.mutedForeground, fontSize: 12, marginTop: 3 }]}>
                {hasConfiguredMilestones
                  ? 'Each reward is released after its milestone is submitted and verified by the host.'
                  : 'XP is released after the host verifies your completion.'}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            {timelineMilestones.map((milestone, index) => {
              const verified = milestone.status === 'verified';
              const awaitingReview = milestone.status === 'submitted';
              const rejected = milestone.status === 'rejected';
              const milestoneStatusColor = verified
                ? colors.success
                : awaitingReview
                  ? colors.secondary
                  : rejected
                    ? colors.destructive
                    : colors.mutedForeground;
              const canSubmitMilestone = milestone.id > 0
                && user?.userType === 'participant'
                && Boolean(participation)
                && ['joined', 'attended'].includes(participation?.status ?? '')
                && (milestone.status === 'not_started' || milestone.status === 'rejected');
              const activityTime = awaitingReview
                ? milestone.submittedAt
                : verified
                  ? milestone.verifiedAt
                  : null;
              return (
                <View key={`timeline-${milestone.id || 'legacy'}`} style={{ flexDirection: 'row', gap: 11 }}>
                  <View style={{ alignItems: 'center', width: 18 }}>
                    <View style={{ alignItems: 'center', backgroundColor: milestoneStatusColor + '16', borderColor: milestoneStatusColor, borderRadius: 12, borderWidth: 1.5, height: 22, justifyContent: 'center', width: 22 }}>
                      <Feather
                        name={verified ? 'check' : awaitingReview ? 'clock' : rejected ? 'rotate-ccw' : 'circle'}
                        size={12}
                        color={milestoneStatusColor}
                      />
                    </View>
                    {index < timelineMilestones.length - 1 ? (
                      <View style={{ backgroundColor: colors.border, flex: 1, minHeight: 16, width: 2 }} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: index < timelineMilestones.length - 1 ? 12 : 0 }}>
                    <View style={{ backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius - 6, borderWidth: 1, gap: 7, padding: 12 }}>
                      <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
                            STEP {milestone.position}
                          </Text>
                          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700', marginTop: 3 }}>
                            {milestone.title}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: colors.primary + '12', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>+{milestone.xpReward} XP</Text>
                        </View>
                      </View>
                      {milestone.description ? (
                        <Text style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 19 }}>{milestone.description}</Text>
                      ) : null}
                      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                        <Feather name={verified ? 'check-circle' : awaitingReview ? 'clock' : rejected ? 'alert-circle' : 'circle'} size={13} color={milestoneStatusColor} />
                        <Text style={{ color: milestoneStatusColor, flex: 1, fontSize: 12, fontWeight: '600' }}>
                          {verified
                            ? 'Verified · XP ready to redeem'
                            : awaitingReview
                              ? 'Submitted · awaiting host review'
                              : rejected
                                ? 'Update requested · submit again when ready'
                                : 'Not submitted'}
                          {activityTime ? ` · ${new Date(activityTime).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                      {canSubmitMilestone ? (
                        <Button
                          testID={`submit-milestone-${milestone.id}`}
                          label={submitMilestone.isPending ? 'Submitting…' : rejected ? 'Resubmit milestone' : 'Submit milestone'}
                          icon="send"
                          disabled={submitMilestone.isPending}
                          onPress={() => void submitMilestoneCompletion(participation!.id, milestone.id)}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          {!item.joined && user?.userType !== 'organisation' ? (
            <Text style={[styles.createHint, { color: colors.mutedForeground, marginTop: 12 }]}>
              Join this experience to track and submit milestone progress.
            </Text>
          ) : null}
        </View>

        {item.whatYouWillDo ? (
          <View style={[styles.infoBlock, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
            <View style={styles.infoBlockHeading}>
              <View style={[styles.infoBlockIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="check-circle" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>What you&apos;ll do</Text>
            </View>
            <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.whatYouWillDo}</Text>
          </View>
        ) : null}

        {item.whatToBring ? (
          <View style={[styles.infoBlock, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
            <View style={styles.infoBlockHeading}>
              <View style={[styles.infoBlockIcon, { backgroundColor: colors.teal + '14' }]}>
                <Feather name="briefcase" size={16} color={colors.teal} />
              </View>
              <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>What to bring</Text>
            </View>
            <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.whatToBring}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.ctaWrap,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 12),
          },
        ]}
      >
        {query.isError ? <InlineError message="We couldn’t refresh this experience. Your current details are still shown." /> : null}
        {actionError ? <InlineError message={actionError} /> : null}
        {user?.userType === 'organisation' ? (
          <View style={[styles.joinedBanner, { backgroundColor: colors.primary + '12', borderRadius: colors.radius }]}>
            <Feather name="briefcase" size={26} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.joinedTitle, { color: colors.primary }]}>Viewing as an Organisation</Text>
              <Text style={[styles.joinedSub, { color: colors.mutedForeground }]}>Participant accounts can join this experience. Use your organisation account to host experiences.</Text>
            </View>
          </View>
        ) : item.joined && participation ? (
          <View>
            <View style={[styles.joinedBanner, { backgroundColor: (isWaitlisted ? colors.secondary : colors.success) + '15', borderRadius: colors.radius }]}>
              <Feather name={isWaitlisted ? 'clock' : 'check-circle'} size={28} color={isWaitlisted ? colors.secondary : colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.joinedTitle, { color: isWaitlisted ? colors.secondary : colors.success }]}>{isWaitlisted ? "You're on the waitlist" : "You're participating"}</Text>
                <Text style={[styles.joinedSub, { color: isWaitlisted ? colors.mutedForeground : colors.success }]}>
                  {isWaitlisted
                    ? 'Your place is not confirmed. The host will promote you when a place opens.'
                    : participation.status === 'verified'
                      ? hasConfiguredMilestones
                        ? 'All milestones are verified. Their XP awards are ready to redeem.'
                        : 'Completion verified and reward issued.'
                      : participation.status === 'submitted'
                        ? 'Awaiting host verification.'
                        : hasConfiguredMilestones
                          ? 'Complete each step above and submit it for host verification.'
                          : 'Show up, then submit your completion.'}
                </Text>
              </View>
            </View>
            {participation.status === 'waitlisted' ? (
              <Button
                label={query.isRefetching ? 'Checking…' : 'Check waitlist status'}
                disabled={query.isRefetching}
                onPress={() => void query.refetch()}
              />
            ) : hasConfiguredMilestones && ['joined', 'attended'].includes(participation.status) ? (
              <Text style={[styles.joinedSub, { color: colors.mutedForeground, marginTop: 10 }]}>
                Submit milestones from the timeline above. Each verified step releases its XP award.
              </Text>
            ) : ['joined', 'attended'].includes(participation.status) ? (
              <Button
                label={participation.status === 'attended'
                  ? (submit.isPending ? 'Submitting…' : 'Submit completion')
                  : (query.isRefetching ? 'Refreshing…' : 'Refresh status')}
                disabled={participation.status === 'attended' ? submit.isPending : query.isRefetching}
                onPress={() => {
                  if (participation.status === 'attended') void submitCompletion(participation.id);
                  else void query.refetch();
                }}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.detailActionRow}>
            <View style={styles.detailActionSummary}>
              <Text style={[styles.detailActionLabel, { color: colors.mutedForeground }]}>YOU&apos;LL EARN</Text>
              <Text style={[styles.detailActionReward, { color: colors.primary }]}>+{item.xpReward} XP</Text>
            </View>
            <Button
              label={join.isPending
                ? 'Joining…'
                : !acceptsParticipants
                  ? 'Registration closed'
                  : item.availablePlaces === 0
                    ? 'Join waitlist'
                    : 'Join experience'}
              disabled={join.isPending || !acceptsParticipants}
              onPress={() => void joinExperience()}
              style={styles.detailActionButton}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function Experiences({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const upcoming = useListMyParticipations({ status: 'upcoming' });
  const completed = useListMyParticipations({ status: 'completed' });
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming');
  const data = tab === 'upcoming' ? upcoming.data : completed.data;
  const activeQuery = tab === 'upcoming' ? upcoming : completed;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      <Header title="My journey" subtitle="Your contribution, in progress." />
      <View style={[styles.segment, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
        {(['upcoming', 'completed'] as const).map((key) => (
          <Pressable key={key} onPress={() => { triggerHaptic(); setTab(key); }} style={[styles.segmentItem, tab === key && { backgroundColor: colors.card, borderRadius: colors.radius - 4 }]}>
            <Text style={[styles.segmentText, { color: tab === key ? colors.foreground : colors.mutedForeground }]}>{key === 'upcoming' ? 'Upcoming' : 'Completed'}</Text>
          </Pressable>
        ))}
      </View>

      {activeQuery.isLoading ? <LoadingState /> : activeQuery.isError ? (
        <EmptyState title="Your journey didn’t load" body="Your bookings and completed experiences are saved. Try loading them again." actionLabel="Try again" onAction={() => { void activeQuery.refetch(); }} />
      ) : data?.length ? data.map((item) => (
        <Pressable key={item.id} onPress={() => { triggerHaptic(); go('experience', { id: String(item.experience.id) }); }} style={[styles.participationCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.cardTop}>
            <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name={categoryIcon[item.experience.category]} size={24} color={colors.primary} />
            </View>
            <View style={styles.cardCategory}>
              <Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{dateLabel(item.experience.date)}</Text>
              <Text style={[styles.cardTitleSmall, { color: colors.foreground }]}>{item.experience.title}</Text>
            </View>
            <Feather name="chevron-right" size={24} color={colors.mutedForeground} />
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: item.status === 'verified' ? colors.success + '15' : colors.secondary + '15' }]}>
              <Text style={[styles.statusText, { color: item.status === 'verified' ? colors.success : colors.secondary }]}>
                {item.status === 'verified'
                  ? 'Verified'
                  : item.status === 'submitted'
                    ? 'Awaiting verification'
                    : item.status === 'waitlisted'
                      ? 'Waitlisted · no place confirmed'
                      : item.status}
              </Text>
            </View>
            <Text style={[styles.places, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>+{item.experience.xpReward} XP</Text>
          </View>
        </Pressable>
      )) : (
        <EmptyState
          title={tab === 'upcoming' ? 'Nothing booked yet' : 'Your impact history starts here'}
          body={tab === 'upcoming' ? 'Find an experience that fits your time and interests.' : 'Once a host verifies your contribution, it will show up here.'}
          icon={tab === 'upcoming' ? 'calendar' : 'award'}
          actionLabel={tab === 'upcoming' ? 'Explore experiences' : undefined}
          onAction={tab === 'upcoming' ? () => { triggerHaptic(); go('explore'); } : undefined}
        />
      )}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function ContributionDashboard({ user, completed }: { user: User; completed: Participation[] | undefined }) {
  const colors = useColors();
  const weeks = 16;
  const days = 7;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() - end.getDay());
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * days - 1));

  const activityByDate = new Map<string, number>();
  completed?.forEach((item) => {
    const key = item.experience.date;
    activityByDate.set(key, (activityByDate.get(key) ?? 0) + 1);
  });

  const cells = Array.from({ length: weeks }, (_, weekIndex) =>
    Array.from({ length: days }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(start.getDate() + weekIndex * days + dayIndex);
      const key = date.toISOString().slice(0, 10);
      const count = activityByDate.get(key) ?? 0;
      return { key, count, date };
    }),
  );
  const total = completed?.length ?? user.completedCount;
  const monthLabels = cells.map((week) => {
    const first = week[0].date;
    return first.getDate() <= 7 ? first.toLocaleDateString(undefined, { month: 'short' }) : '';
  });
  const levelColors = [
    colors.muted,
    colors.primary + '35',
    colors.primary + '70',
    colors.primary + 'A8',
    colors.primary,
  ];

  return (
    <View style={[styles.contributionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.contributionHeader}>
        <View style={styles.contributionHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contribution activity</Text>
          <Text style={[styles.contributionSummary, { color: colors.mutedForeground }]}>
            {total} {total === 1 ? 'contribution' : 'contributions'} in the last 16 weeks
          </Text>
        </View>
        <Feather name="activity" size={20} color={colors.primary} />
      </View>

      <View style={styles.contributionChart}>
        <View style={styles.contributionDayLabels}>
          <Text style={[styles.contributionDayLabel, { color: colors.mutedForeground }]}>Mon</Text>
          <Text style={[styles.contributionDayLabel, { color: colors.mutedForeground }]}>Wed</Text>
          <Text style={[styles.contributionDayLabel, { color: colors.mutedForeground }]}>Fri</Text>
        </View>
        <View style={styles.contributionGridWrap}>
          <View style={styles.contributionMonthLabels}>
            {monthLabels.map((label, index) => (
              <Text key={`${label}-${index}`} style={[styles.contributionMonthLabel, { color: colors.mutedForeground }]}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.contributionGrid}>
            {cells.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.contributionWeek}>
                {week.map((cell) => (
                  <View
                    key={cell.key}
                    style={[
                      styles.contributionCell,
                      {
                        backgroundColor: levelColors[Math.min(cell.count, levelColors.length - 1)],
                        borderColor: cell.count ? colors.primary + '25' : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.contributionLegend}>
        <Text style={[styles.contributionLegendText, { color: colors.mutedForeground }]}>Less</Text>
        {levelColors.map((backgroundColor, index) => (
          <View key={index} style={[styles.contributionLegendCell, { backgroundColor, borderColor: colors.border }]} />
        ))}
        <Text style={[styles.contributionLegendText, { color: colors.mutedForeground }]}>More</Text>
      </View>
    </View>
  );
}

type ProfileMetricKey = 'completed' | 'hosted' | 'friends' | 'xp';

const socialLinkFields = [
  { key: 'website', label: 'Website', icon: 'globe', placeholder: 'https://yourwebsite.org', domains: [] },
  { key: 'instagram', label: 'Instagram', icon: 'instagram', placeholder: 'instagram.com/yourname', domains: ['instagram.com'] },
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin', placeholder: 'linkedin.com/in/yourname', domains: ['linkedin.com'] },
  { key: 'x', label: 'X', icon: 'twitter', placeholder: 'x.com/yourname', domains: ['x.com', 'twitter.com'] },
  { key: 'youtube', label: 'YouTube', icon: 'youtube', placeholder: 'youtube.com/@yourname', domains: ['youtube.com', 'youtu.be'] },
] as const;

type SocialLinkKey = typeof socialLinkFields[number]['key'];
type SocialLinksFormState = Record<SocialLinkKey, string>;

function socialLinksFormState(links?: Partial<Record<SocialLinkKey, string>> | null): SocialLinksFormState {
  return Object.fromEntries(
    socialLinkFields.map(({ key }) => [key, links?.[key] ?? '']),
  ) as SocialLinksFormState;
}

function normalizeSocialLink(key: SocialLinkKey, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const field = socialLinkFields.find((item) => item.key === key);
    if (!field || url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
    if (
      field.domains.length > 0 &&
      !field.domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

type SocialProfileUser = Pick<
  User,
  'name' | 'username' | 'avatarUrl' | 'createdAt' | 'level' | 'completedCount' | 'hostedCount' | 'xp' | 'bio' | 'city' | 'interests' | 'socialLinks'
>;

function ProfileDashboardMetric({
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  children,
}: {
  style: React.ComponentProps<typeof View>['style'];
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  children: React.ReactNode;
}) {
  if (!onPress) {
    return <View testID={testID} style={style}>{children}</View>;
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={() => { triggerHaptic(); onPress(); }}
      style={({ pressed }) => [style, { opacity: pressed ? 0.76 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

function SocialProfileHeader({
  user,
  friendsCount,
  onMetricPress,
  isEditing,
  onEditPress,
}: {
  user: SocialProfileUser;
  friendsCount: number;
  onMetricPress?: (metric: ProfileMetricKey) => void;
  isEditing?: boolean;
  onEditPress?: () => void;
}) {
  const colors = useColors();
  const interests = user.interests?.map((interest) => categoryLabel[interest]).join(' · ');
  const joinedIn2026 = Boolean(user.createdAt && new Date(user.createdAt).getUTCFullYear() === 2026);
  const profileBadges: Array<{ key: string; label: string; icon: IconName }> = [
    { key: 'level', label: user.level, icon: 'award' },
    ...(joinedIn2026 ? [{ key: 'early', label: 'Early', icon: 'star' as IconName }] : []),
  ];
  const visibleSocialLinks = socialLinkFields.flatMap((field) => {
    const url = normalizeSocialLink(field.key, user.socialLinks?.[field.key] ?? '');
    return url ? [{ ...field, url }] : [];
  });

  return (
    <View style={styles.profileFeatureCard}>
      <View style={[styles.profileIdentityCard, { backgroundColor: colors.primary, borderRadius: colors.radius + 4 }]}>
        <View style={[styles.profileAvatarRing, { backgroundColor: colors.primaryForeground, borderColor: colors.primary + '75' }]}>
          <UserAvatar
            avatarUrl={user.avatarUrl}
            name={user.name}
            containerStyle={[styles.profileAvatar, { backgroundColor: colors.primary + '12' }]}
            initialStyle={[styles.profileAvatarText, { color: colors.primary }]}
          />
        </View>
        <View style={styles.profileIdentity}>
          <View style={styles.profileNameRow}>
            <Text numberOfLines={1} style={[styles.profileName, { color: colors.primaryForeground }]}>{user.name}</Text>
            <Feather name="check-circle" size={16} color={colors.primaryForeground} />
          </View>
          <Text numberOfLines={1} style={[styles.profileHandle, { color: colors.primaryForeground }]}>
            {user.username ? `@${user.username}` : 'Telegram member'}
          </Text>
          <View style={styles.profileIdentityFooter}>
            {profileBadges.map((badge) => (
              <View key={badge.key} style={[styles.profileBadge, { backgroundColor: colors.primaryForeground, borderColor: colors.primaryForeground }]}>
                <Feather name={badge.icon} size={12} color={colors.primary} />
                <Text numberOfLines={1} style={[styles.profileBadgeText, { color: colors.primary }]}>{badge.label}</Text>
              </View>
            ))}
          </View>
          {visibleSocialLinks.length ? (
            <View style={styles.profileSocialLinks}>
              {visibleSocialLinks.map((field) => (
                <Pressable
                  key={field.key}
                  testID={`profile-social-link-${field.key}`}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${field.label} profile`}
                  accessibilityHint="Opens an external link."
                  onPress={() => {
                    void Linking.openURL(field.url).catch(() => {
                      Alert.alert('Could not open link', `The ${field.label} link could not be opened.`);
                    });
                  }}
                  style={({ pressed }) => [
                    styles.profileSocialLink,
                    { backgroundColor: colors.primaryForeground + '20', opacity: pressed ? 0.72 : 1 },
                  ]}
                >
                  <Feather name={field.icon} size={18} color={colors.primaryForeground} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {onEditPress ? (
        <Pressable
          testID="profile-edit-toggle"
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Close edit form' : 'Edit profile'}
          accessibilityHint={isEditing ? 'Closes the profile editor.' : 'Opens the profile editor.'}
          onPress={() => { triggerHaptic(); onEditPress(); }}
          style={({ pressed }) => [
            styles.profileEditButton,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Feather name={isEditing ? 'x' : 'edit-2'} size={16} color={colors.primary} />
          <Text style={[styles.profileEditButtonText, { color: colors.foreground }]}>
            {isEditing ? 'Close edit form' : 'Edit profile'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.profileBentoRow}>
        <ProfileDashboardMetric
          accessibilityLabel={`View ${user.completedCount} completed experiences`}
          accessibilityHint="Opens a summary of completed experiences."
          onPress={onMetricPress ? () => onMetricPress('completed') : undefined}
          style={[
            styles.profileCompletedTile,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <View style={styles.profileMetricTopRow}>
            <View style={[styles.profileMetricIcon, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="check-circle" size={16} color={colors.primary} />
            </View>
            {onMetricPress ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null}
          </View>
          <Text style={[styles.profileFeatureMetricValue, { color: colors.primary }]}>{user.completedCount}</Text>
          <Text style={[styles.profileTileLabel, { color: colors.mutedForeground }]}>Completed</Text>
        </ProfileDashboardMetric>
        <View style={styles.profileBentoStack}>
          <ProfileDashboardMetric
            testID="profile-metric-friends"
            accessibilityLabel={`View ${user.hostedCount} hosted experiences`}
            accessibilityHint="Opens a summary of hosted experiences."
            onPress={onMetricPress ? () => onMetricPress('hosted') : undefined}
            style={[
              styles.profileCompactTile,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={[styles.profileMetricIconSmall, { backgroundColor: colors.primary + '12' }]}>
              <Feather name="calendar" size={13} color={colors.primary} />
            </View>
            <View style={styles.profileCompactMetricCopy}>
              <Text style={[styles.profileCompactMetricValue, { color: colors.primary }]}>{user.hostedCount}</Text>
              <Text style={[styles.profileTileLabel, { color: colors.mutedForeground }]}>Hosted</Text>
            </View>
            {onMetricPress ? <Feather name="chevron-right" size={14} color={colors.mutedForeground} /> : null}
          </ProfileDashboardMetric>
          <ProfileDashboardMetric
            accessibilityLabel={`View ${friendsCount} friends`}
            accessibilityHint="Opens the friends list."
            onPress={onMetricPress ? () => onMetricPress('friends') : undefined}
            style={[
              styles.profileCompactTile,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={[styles.profileMetricIconSmall, { backgroundColor: colors.primary + '12' }]}>
              <Feather name="users" size={13} color={colors.primary} />
            </View>
            <View style={styles.profileCompactMetricCopy}>
              <Text style={[styles.profileCompactMetricValue, { color: colors.primary }]}>{friendsCount}</Text>
              <Text style={[styles.profileTileLabel, { color: colors.mutedForeground }]}>Friends</Text>
            </View>
            {onMetricPress ? <Feather name="chevron-right" size={14} color={colors.mutedForeground} /> : null}
          </ProfileDashboardMetric>
        </View>
      </View>

      <ProfileDashboardMetric
        testID="profile-metric-xp"
        accessibilityLabel={`View ${user.xp} experience points`}
        accessibilityHint="Opens your experience points summary."
        onPress={onMetricPress ? () => onMetricPress('xp') : undefined}
        style={[styles.profileXpTile, { backgroundColor: colors.muted, borderRadius: colors.radius }]}
      >
        <View style={styles.profileXpCopy}>
          <View style={[styles.profileMetricIconSmall, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="zap" size={14} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.profileXpTitle, { color: colors.foreground }]}>Experience points</Text>
            <Text style={[styles.profileXpCaption, { color: colors.mutedForeground }]}>Redeem awards to add to your profile</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={[styles.profileXpValue, { color: colors.primary }]}>{user.xp}<Text style={[styles.profileXpUnit, { color: colors.primary }]}> XP</Text></Text>
          {onMetricPress ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null}
        </View>
      </ProfileDashboardMetric>

      {user.bio ? (
        <View style={[styles.profileBioTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.profileTileOverline, { color: colors.mutedForeground }]}>ABOUT</Text>
          <Text style={[styles.profileBio, { color: colors.foreground }]}>{user.bio}</Text>
        </View>
      ) : null}

      {(user.city || interests) ? (
        <View style={styles.profileBentoRow}>
          {user.city ? (
            <View style={[styles.profileDetailTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.profileMetricIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="map-pin" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.profileTileOverline, { color: colors.mutedForeground }]}>BASED IN</Text>
              <Text numberOfLines={2} style={[styles.profileDetailText, { color: colors.foreground }]}>{user.city}</Text>
            </View>
          ) : null}
          {interests ? (
            <View style={[styles.profileDetailTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.profileMetricIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="heart" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.profileTileOverline, { color: colors.mutedForeground }]}>CARES ABOUT</Text>
              <Text numberOfLines={2} style={[styles.profileDetailText, { color: colors.foreground }]}>{interests}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type ProfileMetricFriend = { id: number; name: string; username: string | null; avatarUrl?: string | null };

function ProfileMetricDetailsSheet({
  metric,
  user,
  completed,
  hosted,
  friends,
  authenticated,
  authError,
  isLoading,
  hasError,
  onRetry,
  onLogin,
  onClose,
  onOpenExperience,
  onOpenFriendProfile,
}: {
  metric: ProfileMetricKey | null;
  user: User;
  completed?: Participation[];
  hosted?: Experience[];
  friends?: ProfileMetricFriend[];
  authenticated: boolean;
  authError: string | null;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onLogin: () => void;
  onClose: () => void;
  onOpenExperience: (id: number) => void;
  onOpenFriendProfile: (id: number) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const xpAwards = useGetMyXpAwards({
    query: {
      queryKey: getGetMyXpAwardsQueryKey(),
      enabled: metric === 'xp' && authenticated,
    },
  });
  const redeemXp = useRedeemMyXpAwards({
    mutation: {
      onSuccess: () => {
        invalidateAppQueries(queryClient);
        triggerHaptic();
      },
    },
  });

  if (!metric) return null;

  const detailsIsLoading = metric === 'xp' ? xpAwards.isLoading : isLoading;
  const detailsHasError = metric === 'xp' ? xpAwards.isError : hasError;
  const retryDetails = metric === 'xp'
    ? () => { void xpAwards.refetch(); }
    : onRetry;
  const title = {
    completed: 'Completed experiences',
    hosted: 'Hosted experiences',
    friends: 'Friends',
    xp: 'Experience points',
  }[metric];
  const count = metric === 'completed'
    ? user.completedCount
    : metric === 'hosted'
      ? user.hostedCount
      : metric === 'friends'
        ? friends?.length ?? 0
        : user.xp;
  const countLabel = {
    completed: `completed ${count === 1 ? 'experience' : 'experiences'}`,
    hosted: `hosted ${count === 1 ? 'experience' : 'experiences'}`,
    friends: count === 1 ? 'friend' : 'friends',
    xp: 'XP in profile',
  }[metric];
  const description = {
    completed: 'Your participation history',
    hosted: 'Experiences you have organised',
    friends: 'People connected with you',
    xp: 'Redeem awards to add them to your non-cash profile balance',
  }[metric];
  const emptyTitle = count > 0 ? 'Summary count saved' : {
    completed: 'No completed experiences yet',
    hosted: 'No hosted experiences yet',
    friends: 'No friends yet',
    xp: 'Take part to earn Experience points',
  }[metric];
  const emptyBody = count > 0
    ? metric === 'xp'
      ? 'Experience XP recognises meaningful participation. It is a non-cash profile balance; Community XP is tracked separately.'
      : 'The profile total is available, but detailed records are not available right now.'
    : {
      completed: 'Completed experiences will appear here.',
      hosted: 'Experiences you host will appear here.',
      friends: 'Accepted friend connections will appear here.',
      xp: 'Earn Experience points by participating in experiences and supporting your community.',
    }[metric];

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileMetricOverlay}>
        <Pressable
          testID="profile-metric-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close profile summary"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.profileMetricSheet,
            { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={[styles.profileMetricHandle, { backgroundColor: colors.border }]} />
          <View style={styles.profileMetricSheetHeader}>
            <View style={styles.profileMetricSheetTitleWrap}>
              <Text style={[styles.profileMetricEyebrow, { color: colors.primary }]}>PASSPORT SUMMARY</Text>
              <Text style={[styles.profileMetricSheetTitle, { color: colors.foreground }]}>{title}</Text>
            </View>
            <Pressable
              testID="profile-metric-close"
              accessibilityRole="button"
              accessibilityLabel="Close summary"
              onPress={onClose}
              style={({ pressed }) => [styles.profileMetricClose, { backgroundColor: colors.muted, opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={[styles.profileMetricSummary, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
            <Text style={[styles.profileMetricSummaryCount, { color: colors.primary }]}>{count}</Text>
            <View style={styles.profileMetricSummaryCopy}>
              <Text style={[styles.profileMetricSummaryLabel, { color: colors.foreground }]}>{countLabel}</Text>
              <Text style={[styles.profileMetricSummaryDescription, { color: colors.mutedForeground }]}>{description}</Text>
            </View>
            <Feather
              name={metric === 'completed' ? 'check-circle' : metric === 'hosted' ? 'calendar' : metric === 'friends' ? 'users' : 'zap'}
              size={20}
              color={colors.primary}
            />
          </View>

          <ScrollView
            style={styles.profileMetricScroll}
            contentContainerStyle={styles.profileMetricScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {!authenticated ? (
              <View style={styles.profileMetricState}>
                <View style={[styles.profileMetricStateIcon, { backgroundColor: colors.primary + '12' }]}>
                  <Feather name="lock" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.profileMetricStateTitle, { color: colors.foreground }]}>Log in to see your summary</Text>
                <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>
                  Connect your account to view your {metric === 'friends' ? 'friends' : 'experience'} records.
                </Text>
                {authError ? <Text accessibilityRole="alert" style={[styles.profileMetricError, { color: colors.destructive }]}>{authError}</Text> : null}
                <Button testID="profile-metric-login" label="Log in with Telegram" icon="send" onPress={onLogin} style={styles.profileMetricStateButton} />
              </View>
            ) : detailsIsLoading ? (
              <View style={styles.profileMetricState}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>Loading your records…</Text>
              </View>
            ) : detailsHasError ? (
              <View style={styles.profileMetricState}>
                <View style={[styles.profileMetricStateIcon, { backgroundColor: colors.destructive + '12' }]}>
                  <Feather name="alert-circle" size={20} color={colors.destructive} />
                </View>
                <Text style={[styles.profileMetricStateTitle, { color: colors.foreground }]}>Couldn’t load this summary</Text>
                <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>Your profile is unchanged. Try again to reload these records.</Text>
                <Button testID="profile-metric-retry" label="Try again" variant="secondary" icon="refresh-cw" onPress={retryDetails} style={styles.profileMetricStateButton} />
              </View>
            ) : metric === 'completed' && completed?.length ? (
              completed.map((item) => (
                <Pressable
                  testID={`profile-metric-completed-record-${item.id}`}
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.experience.title}`}
                  accessibilityHint="Opens experience details."
                  onPress={() => onOpenExperience(item.experience.id)}
                  style={({ pressed }) => [
                    styles.profileMetricRecord,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.68 : 1 },
                  ]}
                >
                  <View style={styles.profileMetricRecordCopy}>
                    <Text numberOfLines={2} style={[styles.profileMetricRecordTitle, { color: colors.foreground }]}>{item.experience.title}</Text>
                    <Text style={[styles.profileMetricRecordMeta, { color: colors.mutedForeground }]}>
                      {dateLabel(item.experience.date)} · {item.experience.city}
                    </Text>
                  </View>
                  <View style={[styles.profileMetricReward, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.profileMetricRewardText, { color: colors.primary }]}>+{item.experience.xpReward} XP</Text>
                  </View>
                </Pressable>
              ))
            ) : metric === 'hosted' && hosted?.length ? (
              hosted.map((item) => (
                <Pressable
                  testID={`profile-metric-hosted-record-${item.id}`}
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                  accessibilityHint="Opens experience details."
                  onPress={() => onOpenExperience(item.id)}
                  style={({ pressed }) => [
                    styles.profileMetricRecord,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.68 : 1 },
                  ]}
                >
                  <View style={styles.profileMetricRecordCopy}>
                    <Text numberOfLines={2} style={[styles.profileMetricRecordTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <Text style={[styles.profileMetricRecordMeta, { color: colors.mutedForeground }]}>
                      {dateLabel(item.date)} · {item.city}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))
            ) : metric === 'friends' && friends?.length ? (
              friends.map((friend) => (
                <Pressable
                  key={friend.id}
                  testID={`profile-metric-friend-${friend.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${friend.name}'s profile`}
                  accessibilityHint="Opens their Experiences.fun profile."
                  onPress={() => {
                    triggerHaptic();
                    onOpenFriendProfile(friend.id);
                  }}
                  style={({ pressed }) => [
                    styles.profileMetricFriend,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.68 : 1 },
                  ]}
                >
                  <UserAvatar
                    avatarUrl={friend.avatarUrl}
                    name={friend.name}
                    containerStyle={[styles.profileMetricFriendAvatar, { backgroundColor: colors.primary + '12' }]}
                    initialStyle={[styles.profileMetricFriendInitial, { color: colors.primary }]}
                  />
                  <View style={styles.profileMetricRecordCopy}>
                    <Text numberOfLines={1} style={[styles.profileMetricRecordTitle, { color: colors.foreground }]}>{friend.name}</Text>
                    <Text style={[styles.profileMetricRecordMeta, { color: colors.mutedForeground }]}>
                      {friend.username ? `@${friend.username}` : 'Experiences.fun friend'}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                </Pressable>
              ))
            ) : metric === 'xp' ? (
              <View style={styles.profileXpAwardsList}>
                <View
                  style={[
                    styles.profileXpRedeemCard,
                    { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
                  ]}
                >
                  <View style={styles.profileXpRedeemHeading}>
                    <View style={[styles.profileMetricStateIcon, { backgroundColor: colors.primary + '12' }]}>
                      <Feather name="zap" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.profileMetricRecordCopy}>
                      <Text style={[styles.profileMetricRecordTitle, { color: colors.foreground }]}>
                        {xpAwards.data?.pendingXp ?? 0} XP ready to redeem
                      </Text>
                      <Text style={[styles.profileMetricRecordMeta, { color: colors.mutedForeground }]}>
                        Redeeming adds these points to your Experience XP profile balance.
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.profileXpNotice, { color: colors.mutedForeground }]}>
                    Experience XP is a non-cash record of your participation.
                  </Text>
                  {(xpAwards.data?.pendingXp ?? 0) > 0 ? (
                    <Button
                      testID="xp-awards-redeem"
                      label={redeemXp.isPending ? 'Redeeming…' : `Redeem ${xpAwards.data?.pendingXp ?? 0} XP`}
                      disabled={redeemXp.isPending}
                      onPress={() => redeemXp.mutate()}
                    />
                  ) : null}
                  {redeemXp.isError ? (
                    <InlineError message={requestErrorMessage(redeemXp.error, 'Your XP could not be redeemed. Please try again.')} />
                  ) : null}
                </View>
                {xpAwards.data?.awards.length ? (
                  xpAwards.data.awards.map((award) => (
                    <View
                      key={award.id}
                      testID={`xp-award-${award.id}`}
                      style={[styles.profileXpAwardRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={[styles.profileXpAwardIcon, { backgroundColor: award.status === 'pending' ? colors.primary + '12' : colors.success + '12' }]}>
                        <Feather
                          name={award.status === 'pending' ? 'clock' : 'check'}
                          size={15}
                          color={award.status === 'pending' ? colors.primary : colors.success}
                        />
                      </View>
                      <View style={styles.profileMetricRecordCopy}>
                        <Text numberOfLines={2} style={[styles.profileMetricRecordTitle, { color: colors.foreground }]}>
                          {award.title}
                        </Text>
                        <Text style={[styles.profileMetricRecordMeta, { color: colors.mutedForeground }]}>
                          {award.sourceType === 'experience'
                            ? 'Verified experience'
                            : award.sourceType === 'email_signup'
                              ? 'Email sign-up'
                              : 'Previous profile balance'} · {hostTimestampLabel(award.awardedAt) ?? 'Date unavailable'}
                        </Text>
                        <Text style={[styles.profileXpAwardStatus, { color: award.status === 'pending' ? colors.primary : colors.success }]}>
                          {award.status === 'pending' ? 'Ready to redeem' : 'Redeemed'}
                        </Text>
                      </View>
                      <Text style={[styles.profileMetricRewardText, { color: colors.primary }]}>+{award.amount} XP</Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.profileMetricState}>
                    <View style={[styles.profileMetricStateIcon, { backgroundColor: colors.primary + '12' }]}>
                      <Feather name="zap" size={20} color={colors.primary} />
                    </View>
                    <Text style={[styles.profileMetricStateTitle, { color: colors.foreground }]}>No XP awards yet</Text>
                    <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>
                      Take part in an experience to build your Experience XP history.
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.profileMetricState}>
                <View style={[styles.profileMetricStateIcon, { backgroundColor: colors.primary + '12' }]}>
                  <Feather name={metric === 'completed' ? 'check-circle' : metric === 'hosted' ? 'calendar' : 'users'} size={20} color={colors.primary} />
                </View>
                <Text style={[styles.profileMetricStateTitle, { color: colors.foreground }]}>{emptyTitle}</Text>
                <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>{emptyBody}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FriendProfileScreen({
  friendId,
  onBack,
}: {
  friendId: number;
  onBack: () => void;
}) {
  const colors = useColors();
  const isValidFriendId = Number.isSafeInteger(friendId) && friendId > 0;
  const profile = useGetFriendProfile(friendId, {
    query: {
      queryKey: getGetFriendProfileQueryKey(friendId),
      enabled: isValidFriendId,
    },
  });
  const friend = profile.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Header
        title={friend?.userType === 'organisation' ? 'Organisation profile' : 'Passport'}
        subtitle={friend
          ? friend.userType === 'organisation'
            ? friend.organisation?.name ?? 'Organisation account'
            : `Friend profile · ${friend.username ? `@${friend.username}` : 'Experiences.fun'}`
          : 'Friend profile'}
        onBack={onBack}
      />

      {!isValidFriendId ? (
        <EmptyState
          title="Friend profile not found"
          body="Go back to your friends list and choose a connected friend."
          actionLabel="Back to friends"
          onAction={onBack}
        />
      ) : profile.isLoading ? (
        <View style={styles.friendProfileLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>Loading friend profile…</Text>
        </View>
      ) : profile.isError ? (
        <EmptyState
          title="Couldn’t load this profile"
          body="Friend profiles are available while you’re connected. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => { void profile.refetch(); }}
        />
      ) : friend ? (
        <SocialProfileHeader
          user={{
            name: friend.name,
            username: friend.username,
            avatarUrl: friend.avatarUrl,
            createdAt: friend.memberSince,
            level: friend.level,
            completedCount: friend.completedCount,
            hostedCount: friend.hostedCount,
            xp: friend.xp,
            bio: friend.bio,
            city: friend.city,
            interests: friend.interests,
            socialLinks: friend.socialLinks,
          }}
          friendsCount={friend.friendsCount}
        />
      ) : null}
    </ScrollView>
  );
}

function FriendsOverviewScreen({
  go,
  onBack,
}: {
  go: (screen: Screen, params?: Record<string, string>) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const friends = useListFriends({
    query: { queryKey: getListFriendsQueryKey(), enabled: Boolean(user) },
  });
  const topFriends = useListTopFriends({
    query: {
      queryKey: [...getListTopFriendsQueryKey(), user?.id],
      enabled: Boolean(user),
    },
  });
  const requests = useListFriendRequests({
    query: { queryKey: getListFriendRequestsQueryKey(), refetchInterval: 5_000, enabled: Boolean(user) },
  });
  const sentRequests = useListSentFriendRequests({
    query: { queryKey: getListSentFriendRequestsQueryKey(), refetchInterval: 5_000, enabled: Boolean(user) },
  });
  const createFriend = useCreateFriendRequest({
    mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } },
  });
  const createSocialInvitation = useCreateSocialInvite();
  const accept = useAcceptFriendRequest({
    mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } },
  });
  const decline = useDeclineFriendRequest({
    mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } },
  });
  const saveTopFriends = useSaveTopFriends({
    mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } },
  });
  const [username, setUsername] = useState('');
  const [friendFeedback, setFriendFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [respondingRequest, setRespondingRequest] = useState<{ id: number; action: 'accept' | 'decline' } | null>(null);
  const [friendInvitePending, setFriendInvitePending] = useState(false);
  const [friendNotFound, setFriendNotFound] = useState(false);
  const normalizedFriendUsername = username.trim().replace(/^@+/, '').trim();
  const combinedFriendRequests = [
    ...(requests.data ?? []).map((request) => ({ ...request, direction: 'incoming' as const })),
    ...(sentRequests.data ?? []).map((request) => ({ ...request, direction: 'sent' as const })),
  ];

  const sendFriendRequest = () => {
    if (!normalizedFriendUsername || createFriend.isPending) return;
    setFriendFeedback(null);
    setFriendNotFound(false);
    void createFriend.mutateAsync({ data: { username: normalizedFriendUsername } })
      .then(() => {
        setUsername('');
        Keyboard.dismiss();
        setFriendFeedback({ message: 'Friend request sent.', tone: 'success' });
      })
      .catch((requestError: unknown) => {
        const message = (requestError as { data?: { message?: string } })?.data?.message;
        const status = (requestError as { status?: number; response?: { status?: number } })?.status
          ?? (requestError as { response?: { status?: number } })?.response?.status;
        setFriendNotFound(status === 404 || /not found|does not exist|couldn.t find/i.test(message ?? ''));
        setFriendFeedback({
          message: message ?? 'Could not send that request. Check the username or try again.',
          tone: 'error',
        });
      });
  };

  const shareFriendInvite = async () => {
    if (!normalizedFriendUsername || friendInvitePending) return;
    setFriendInvitePending(true);
    setFriendFeedback(null);
    try {
      const invitation = await createSocialInvitation.mutateAsync({
        data: { username: normalizedFriendUsername, kind: 'friend' },
      });
      const shareContent = createSocialInviteShareContent(
        'friend',
        normalizedFriendUsername,
        invitation.url,
        Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
          ? Platform.OS
          : 'other',
      );
      const webNavigator = typeof navigator !== 'undefined'
        ? navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> }
        : null;
      if (Platform.OS === 'web' && webNavigator?.share) {
        await webNavigator.share({
          title: shareContent.title,
          text: shareContent.text,
          url: invitation.url,
        });
      } else {
        try {
          await Share.share({
            message: shareContent.message,
            url: shareContent.url,
            title: shareContent.title,
          });
        } catch (shareError) {
          if (Platform.OS !== 'web') throw shareError;
          await Linking.openURL(
            `https://t.me/share/url?url=${encodeURIComponent(invitation.url)}&text=${encodeURIComponent(shareContent.text)}`,
          );
        }
      }
      setFriendFeedback({ message: 'Invite ready to share.', tone: 'success' });
    } catch (shareError: unknown) {
      if ((shareError as { name?: string })?.name !== 'AbortError') {
        const message = (shareError as { data?: { message?: string } })?.data?.message;
        setFriendFeedback({ message: message ?? 'Could not create that invite. Please try again.', tone: 'error' });
      }
    } finally {
      setFriendInvitePending(false);
    }
  };

  const respondToFriendRequest = async (requestId: number, action: 'accept' | 'decline') => {
    setFriendFeedback(null);
    setRespondingRequest({ id: requestId, action });
    try {
      if (action === 'accept') {
        await accept.mutateAsync({ requestId });
        setFriendFeedback({ message: 'Friend request accepted.', tone: 'success' });
      } else {
        await decline.mutateAsync({ requestId });
        setFriendFeedback({ message: 'Friend request declined.', tone: 'success' });
      }
    } catch (requestError) {
      const message = (requestError as { data?: { message?: string } })?.data?.message;
      setFriendFeedback({ message: message ?? 'That request could not be updated. Please try again.', tone: 'error' });
      void requests.refetch();
      void sentRequests.refetch();
    } finally {
      setRespondingRequest(null);
    }
  };

  const savePinnedFriendOrder = async (friendIds: number[]) => {
    if (!user || saveTopFriends.isPending) return;
    setFriendFeedback(null);
    try {
      await saveTopFriends.mutateAsync({ data: { friendIds } });
      setFriendFeedback({ message: 'My Top Friend list saved.', tone: 'success' });
    } catch (saveError: unknown) {
      const message = (saveError as { data?: { message?: string } })?.data?.message;
      setFriendFeedback({
        message: message ?? 'Could not update My Top Friend. Please try again.',
        tone: 'error',
      });
    }
  };

  const togglePinnedFriend = (friendId: number) => {
    if (topFriends.isLoading || topFriends.isError || saveTopFriends.isPending) return;
    const currentIds = (topFriends.data ?? []).map((friend) => friend.id);
    const nextIds = currentIds.includes(friendId)
      ? currentIds.filter((id) => id !== friendId)
      : currentIds.length < 3
        ? [...currentIds, friendId]
        : null;
    if (!nextIds) {
      setFriendFeedback({
        message: 'My Top Friend is full. Remove one before pinning another.',
        tone: 'error',
      });
      return;
    }
    void savePinnedFriendOrder(nextIds);
  };

  const movePinnedFriend = (friendId: number, direction: -1 | 1) => {
    if (topFriends.isLoading || topFriends.isError || saveTopFriends.isPending) return;
    const nextIds = (topFriends.data ?? []).map((friend) => friend.id);
    const index = nextIds.indexOf(friendId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= nextIds.length) return;
    [nextIds[index], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[index]];
    void savePinnedFriendOrder(nextIds);
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      bottomOffset={72}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      showsVerticalScrollIndicator={false}
    >
      <Header
        title="My Connections"
        subtitle="Your circle, requests, and connections."
        onBack={onBack}
      />
      <View style={styles.socialHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your circle</Text>
          <Text style={[styles.friendsSubtitle, { color: colors.mutedForeground }]}>Connect with people to explore and contribute together.</Text>
        </View>
        <View style={[styles.friendCountPill, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="users" size={15} color={colors.primary} />
          <Text style={[styles.friendCountText, { color: colors.primary }]}>{friends.data?.length ?? 0}</Text>
        </View>
      </View>

      {user ? (
        <View testID="friends-top-section" style={{ gap: 11, marginBottom: 18 }}>
          <View style={{ gap: 4 }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
              <Feather name="star" size={17} color={colors.primary} />
              <Text style={[styles.friendSectionTitle, { color: colors.foreground }]}>My Top Friend</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>· {topFriends.data?.length ?? 0}/3</Text>
            </View>
            <Text style={[styles.friendsSubtitle, { color: colors.mutedForeground }]}>
              Pin up to three friends and choose the order they appear in.
            </Text>
          </View>
          {topFriends.isLoading ? (
            <View style={[styles.friendInlineState, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.friendInlineStateText, { color: colors.mutedForeground }]}>Loading pinned friends…</Text>
            </View>
          ) : topFriends.isError ? (
            <Pressable
              testID="friends-top-retry"
              accessibilityRole="button"
              accessibilityLabel="Retry loading My Top Friend"
              onPress={() => void topFriends.refetch()}
              style={[styles.friendInlineState, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}
            >
              <Feather name="refresh-cw" size={16} color={colors.primary} />
              <Text style={[styles.friendInlineStateText, { color: colors.foreground }]}>Pinned friends couldn’t load. Tap to retry.</Text>
            </Pressable>
          ) : topFriends.data?.length ? (
            topFriends.data.map((friend, index) => (
              <View
                key={friend.id}
                testID={`friends-top-friend-${friend.id}`}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  borderWidth: 1,
                  flexDirection: 'row',
                  gap: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View ${friend.name}'s profile`}
                  onPress={() => go('friend-profile', { friendId: String(friend.id) })}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    flex: 1,
                    flexDirection: 'row',
                    gap: 10,
                    minWidth: 0,
                    opacity: pressed ? 0.72 : 1,
                  })}
                >
                  <UserAvatar
                    avatarUrl={friend.avatarUrl}
                    name={friend.name}
                    containerStyle={[styles.friendAvatar, { backgroundColor: colors.primary + '12' }]}
                    initialStyle={[styles.friendAvatarInitial, { color: colors.primary }]}
                  />
                  <View style={styles.friendPersonCopy}>
                    <Text numberOfLines={1} style={[styles.friendPersonName, { color: colors.foreground }]}>{friend.name}</Text>
                    <Text numberOfLines={1} style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>
                      {friend.username ? `@${friend.username}` : 'Experiences.fun friend'}
                    </Text>
                  </View>
                </Pressable>
                <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                  <Pressable
                    testID={`friends-top-move-up-${friend.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${friend.name} up`}
                    accessibilityState={{ disabled: index === 0 || saveTopFriends.isPending }}
                    disabled={index === 0 || saveTopFriends.isPending}
                    onPress={() => movePinnedFriend(friend.id, -1)}
                    style={({ pressed }) => ({ alignItems: 'center', height: 38, justifyContent: 'center', opacity: index === 0 || saveTopFriends.isPending ? 0.35 : pressed ? 0.65 : 1, width: 34 })}
                  >
                    <Feather name="arrow-up" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  <Pressable
                    testID={`friends-top-move-down-${friend.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${friend.name} down`}
                    accessibilityState={{ disabled: index === (topFriends.data?.length ?? 0) - 1 || saveTopFriends.isPending }}
                    disabled={index === (topFriends.data?.length ?? 0) - 1 || saveTopFriends.isPending}
                    onPress={() => movePinnedFriend(friend.id, 1)}
                    style={({ pressed }) => ({ alignItems: 'center', height: 38, justifyContent: 'center', opacity: index === (topFriends.data?.length ?? 0) - 1 || saveTopFriends.isPending ? 0.35 : pressed ? 0.65 : 1, width: 34 })}
                  >
                    <Feather name="arrow-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  <Pressable
                    testID={`friends-top-remove-${friend.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${friend.name} from My Top Friend`}
                    accessibilityState={{ disabled: saveTopFriends.isPending }}
                    disabled={saveTopFriends.isPending}
                    onPress={() => togglePinnedFriend(friend.id)}
                    style={({ pressed }) => ({ alignItems: 'center', height: 38, justifyContent: 'center', opacity: saveTopFriends.isPending ? 0.35 : pressed ? 0.65 : 1, width: 34 })}
                  >
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <View style={[styles.friendEmpty, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.friendEmptyIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="star" size={16} color={colors.primary} />
              </View>
              <View style={styles.friendPersonCopy}>
                <Text style={[styles.friendPersonName, { color: colors.foreground }]}>Choose your three favourites</Text>
                <Text style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>Pin friends from your list below. You can change their order at any time.</Text>
              </View>
            </View>
          )}
        </View>
      ) : null}

      {!user ? <TelegramConnectCard /> : (
        <>
          <View style={[styles.friendComposer, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 4 }]}>
            <View style={styles.friendComposerHeader}>
              <View style={[styles.friendComposerIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="user-plus" size={18} color={colors.primary} />
              </View>
              <View style={styles.friendComposerCopy}>
                <Text style={[styles.friendComposerTitle, { color: colors.foreground }]}>Add a friend</Text>
                <Text style={[styles.friendComposerSubtitle, { color: colors.mutedForeground }]}>Send a request using their username.</Text>
              </View>
            </View>
            <View style={styles.friendAdd}>
              <View style={[styles.friendInputWrap, { backgroundColor: colors.background, borderColor: colors.input, borderRadius: colors.radius - 4 }]}>
                <Feather name="at-sign" size={17} color={colors.mutedForeground} />
                <TextInput
                  testID="friends-add-username"
                  accessibilityLabel="Friend username"
                  value={username}
                  onChangeText={(value) => { setUsername(value); setFriendFeedback(null); setFriendNotFound(false); }}
                  onSubmitEditing={sendFriendRequest}
                  placeholder="username"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  style={[styles.friendInput, { color: colors.foreground }]}
                />
              </View>
              <Pressable
                testID="friends-send-request"
                accessibilityRole="button"
                accessibilityLabel="Send friend request"
                accessibilityState={{ disabled: !normalizedFriendUsername || createFriend.isPending }}
                disabled={!normalizedFriendUsername || createFriend.isPending}
                onPress={sendFriendRequest}
                style={({ pressed }) => [
                  styles.addButton,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius - 4,
                    opacity: !normalizedFriendUsername || createFriend.isPending ? 0.55 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                {createFriend.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                  <>
                    <Feather name="send" size={15} color={colors.primaryForeground} />
                    <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Send</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={[styles.friendInputHint, { color: colors.mutedForeground }]}>Enter a username with or without @.</Text>
            {friendNotFound && normalizedFriendUsername ? (
              <Pressable
                testID="friends-invite-to-sign-up"
                accessibilityRole="button"
                accessibilityLabel={`Invite ${normalizedFriendUsername} to sign up`}
                accessibilityState={{ disabled: friendInvitePending }}
                disabled={friendInvitePending}
                onPress={shareFriendInvite}
                style={({ pressed }) => [{
                  alignItems: 'center',
                  borderColor: colors.primary,
                  borderRadius: colors.radius - 4,
                  borderWidth: 1,
                  flexDirection: 'row',
                  gap: 7,
                  justifyContent: 'center',
                  marginTop: 4,
                  paddingVertical: 10,
                  opacity: friendInvitePending ? 0.55 : pressed ? 0.8 : 1,
                }]}
              >
                {friendInvitePending ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="share-2" size={15} color={colors.primary} />}
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Invite to sign up</Text>
              </Pressable>
            ) : null}
          </View>

          {friendFeedback ? (
            <View style={[
              styles.friendFeedbackRow,
              {
                backgroundColor: friendFeedback.tone === 'success' ? colors.success + '12' : colors.destructive + '12',
                borderColor: friendFeedback.tone === 'success' ? colors.success + '35' : colors.destructive + '35',
              },
            ]}>
              <Feather
                name={friendFeedback.tone === 'success' ? 'check-circle' : 'alert-circle'}
                size={16}
                color={friendFeedback.tone === 'success' ? colors.success : colors.destructive}
              />
              <Text accessibilityRole="alert" style={[styles.friendFeedback, { color: friendFeedback.tone === 'success' ? colors.success : colors.destructive }]}>
                {friendFeedback.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.friendSection}>
            <View style={styles.friendSectionHeader}>
              <Text style={[styles.friendSectionTitle, { color: colors.foreground }]}>Friend requests</Text>
              <View style={[styles.friendSectionCount, { backgroundColor: colors.teal + '18' }]}>
                <Text style={[styles.friendSectionCountText, { color: colors.foreground }]}>{combinedFriendRequests.length}</Text>
              </View>
            </View>
            {requests.isLoading || sentRequests.isLoading ? (
              <View style={styles.friendInlineState}>
                <ActivityIndicator size="small" color={colors.teal} />
                <Text style={[styles.friendInlineStateText, { color: colors.mutedForeground }]}>Loading friend requests…</Text>
              </View>
            ) : null}
            {requests.isError || sentRequests.isError ? (
              <Pressable
                testID="friends-requests-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading friend requests"
                onPress={() => {
                  if (requests.isError) void requests.refetch();
                  if (sentRequests.isError) void sentRequests.refetch();
                }}
                style={[styles.friendInlineState, { backgroundColor: colors.card, borderColor: colors.teal + '65', borderWidth: 1, borderRadius: colors.radius }]}
              >
                <Feather name="refresh-cw" size={16} color={colors.teal} />
                <Text style={[styles.friendInlineStateText, { color: colors.foreground }]}>Some requests couldn’t be loaded. Tap to retry.</Text>
              </Pressable>
            ) : null}
            {combinedFriendRequests.map((request) => {
              const incoming = request.direction === 'incoming';
              const directionColor = incoming ? colors.teal : colors.secondary;
              const responding = accept.isPending || decline.isPending;
              const actionIsPending = respondingRequest?.id === request.id;
              return (
                <View
                  key={`${request.direction}-${request.id}`}
                  testID={`friends-request-${request.direction}-${request.id}`}
                  style={[styles.friendRequestCard, { backgroundColor: colors.card, borderColor: directionColor + '55', borderRadius: colors.radius }]}
                >
                  <View style={styles.friendPersonHeader}>
                    <UserAvatar
                      avatarUrl={request.user.avatarUrl}
                      name={request.user.name}
                      containerStyle={[styles.friendAvatar, { backgroundColor: directionColor + '18' }]}
                      initialStyle={[styles.friendAvatarInitial, { color: directionColor }]}
                    />
                    <View style={styles.friendPersonCopy}>
                      <Text numberOfLines={1} style={[styles.friendPersonName, { color: colors.foreground }]}>{request.user.name}</Text>
                      <Text numberOfLines={1} style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>
                        {request.user.username ? `@${request.user.username}` : 'Experiences.fun member'}
                      </Text>
                    </View>
                    <View style={[styles.friendRequestDirection, { backgroundColor: directionColor + '18' }]}>
                      <Text style={[styles.friendRequestDirectionText, { color: colors.foreground }]}>{incoming ? 'Incoming' : 'Sent'}</Text>
                    </View>
                  </View>
                  {incoming ? (
                    <View style={styles.friendRequestActions}>
                      <Pressable
                        testID={`friends-request-decline-${request.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Decline ${request.user.name}'s friend request`}
                        accessibilityState={{ disabled: responding }}
                        disabled={responding}
                        onPress={() => void respondToFriendRequest(request.id, 'decline')}
                        style={[styles.friendRequestButton, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 4, opacity: responding ? 0.6 : 1 }]}
                      >
                        {actionIsPending && respondingRequest.action === 'decline' ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
                        <Text style={[styles.friendRequestButtonText, { color: colors.mutedForeground }]}>
                          {actionIsPending && respondingRequest.action === 'decline' ? 'Declining…' : 'Decline'}
                        </Text>
                      </Pressable>
                      <Pressable
                        testID={`friends-request-accept-${request.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Accept ${request.user.name}'s friend request`}
                        accessibilityState={{ disabled: responding }}
                        disabled={responding}
                        onPress={() => void respondToFriendRequest(request.id, 'accept')}
                        style={[styles.friendRequestButton, { backgroundColor: colors.teal + '18', borderColor: colors.teal, borderRadius: colors.radius - 4, opacity: responding ? 0.6 : 1 }]}
                      >
                        {actionIsPending && respondingRequest.action === 'accept'
                          ? <ActivityIndicator size="small" color={colors.teal} />
                          : <Feather name="check" size={15} color={colors.teal} />}
                        <Text style={[styles.friendRequestButtonText, { color: colors.foreground }]}>
                          {actionIsPending && respondingRequest.action === 'accept' ? 'Accepting…' : 'Accept'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.friendRequestActions}>
                      <View style={[styles.friendPendingPill, { backgroundColor: directionColor + '18' }]}>
                        <Feather name="clock" size={12} color={directionColor} />
                        <Text style={[styles.friendPendingText, { color: colors.foreground }]}>Waiting for reply</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {!combinedFriendRequests.length && !requests.isLoading && !sentRequests.isLoading && !requests.isError && !sentRequests.isError ? (
              <View style={[styles.friendEmpty, { backgroundColor: colors.card, borderColor: colors.teal + '55', borderRadius: colors.radius }]}>
                <View style={[styles.friendEmptyIcon, { backgroundColor: colors.teal + '18' }]}>
                  <Feather name="users" size={16} color={colors.teal} />
                </View>
                <View style={styles.friendPersonCopy}>
                  <Text style={[styles.friendPersonName, { color: colors.foreground }]}>No friend requests yet</Text>
                  <Text style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>Incoming and sent requests will appear here.</Text>
                </View>
              </View>
            ) : null}
          </View>

          {user.userType === 'participant' ? (
            <AccountabilitySection friends={friends.data ?? []} />
          ) : user.userType === 'organisation' ? (
            <OrganisationPartnershipsSection />
          ) : null}

          <View style={styles.friendSection}>
            <View style={styles.friendSectionHeader}>
              <Text style={[styles.friendSectionTitle, { color: colors.foreground }]}>Your friends</Text>
              <View style={[styles.friendSectionCount, { backgroundColor: colors.success + '12' }]}>
                <Text style={[styles.friendSectionCountText, { color: colors.success }]}>{friends.data?.length ?? 0}</Text>
              </View>
            </View>
            {friends.isLoading ? (
              <View style={styles.friendInlineState}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.friendInlineStateText, { color: colors.mutedForeground }]}>Loading your friends…</Text>
              </View>
            ) : friends.isError ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading friends"
                onPress={() => void friends.refetch()}
                style={[styles.friendInlineState, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}
              >
                <Feather name="refresh-cw" size={16} color={colors.primary} />
                <Text style={[styles.friendInlineStateText, { color: colors.foreground }]}>Couldn’t load your friends. Tap to retry.</Text>
              </Pressable>
            ) : friends.data?.length ? (
              friends.data.map((friend) => {
                const isPinned = (topFriends.data ?? []).some((pinned) => pinned.id === friend.id);
                const canPin = isPinned || (topFriends.data?.length ?? 0) < 3;
                return (
                  <View
                    key={friend.id}
                    style={[
                      styles.friendPersonRow,
                      { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                    ]}
                  >
                    <Pressable
                      testID={`friends-profile-${friend.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${friend.name}'s profile`}
                      accessibilityHint="Opens their Experiences.fun profile."
                      onPress={() => {
                        triggerHaptic();
                        go('friend-profile', { friendId: String(friend.id) });
                      }}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        flex: 1,
                        flexDirection: 'row',
                        gap: 12,
                        minWidth: 0,
                        opacity: pressed ? 0.72 : 1,
                      })}
                    >
                      <UserAvatar
                        avatarUrl={friend.avatarUrl}
                        name={friend.name}
                        containerStyle={[styles.friendAvatar, { backgroundColor: colors.primary + '12' }]}
                        initialStyle={[styles.friendAvatarInitial, { color: colors.primary }]}
                      />
                      <View style={styles.friendPersonCopy}>
                        <Text numberOfLines={1} style={[styles.friendPersonName, { color: colors.foreground }]}>{friend.name}</Text>
                        <Text numberOfLines={1} style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>
                          {friend.username ? `@${friend.username}` : 'Experiences.fun friend'}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    </Pressable>
                    <Pressable
                      testID={`friends-pin-${friend.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={isPinned ? `Remove ${friend.name} from My Top Friend` : `Pin ${friend.name} in My Top Friend`}
                      accessibilityHint={!isPinned && !canPin ? 'Remove a pinned friend before adding another.' : undefined}
                      accessibilityState={{ disabled: saveTopFriends.isPending || topFriends.isLoading || topFriends.isError || !canPin }}
                      disabled={saveTopFriends.isPending || topFriends.isLoading || topFriends.isError || !canPin}
                      onPress={() => togglePinnedFriend(friend.id)}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        height: 42,
                        justifyContent: 'center',
                        opacity: saveTopFriends.isPending || topFriends.isLoading || topFriends.isError || !canPin ? 0.35 : pressed ? 0.65 : 1,
                        width: 38,
                      })}
                    >
                      <Feather name="star" size={18} color={isPinned ? colors.primary : colors.mutedForeground} />
                    </Pressable>
                  </View>
                );
              })
            ) : (
              <View style={[styles.friendEmpty, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={[styles.friendEmptyIcon, { backgroundColor: colors.primary + '12' }]}>
                  <Feather name="users" size={16} color={colors.primary} />
                </View>
                <View style={styles.friendPersonCopy}>
                  <Text style={[styles.friendPersonName, { color: colors.foreground }]}>Your circle starts here</Text>
                  <Text style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>Add a friend by username to connect on Experiences.fun.</Text>
                </View>
              </View>
            )}
          </View>
        </>
      )}
      <View style={{ height: 120 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

function Profile({ user, go }: { user: User; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const { user: authenticatedUser, authError, login, refresh, signOut } = useAuth();
  const queryClient = useQueryClient();
  const profile = useGetMe();
  const completed = useListMyParticipations(
    { status: 'completed' },
    { query: { enabled: authenticatedUser?.userType === 'participant', queryKey: getListMyParticipationsQueryKey({ status: 'completed' }) } },
  );
  const hosted = useListHostExperiences({ query: { enabled: authenticatedUser?.userType === 'organisation', queryKey: getListHostExperiencesQueryKey() } });
  const hostOverview = useGetHostOverview({
    query: {
      queryKey: getGetHostOverviewQueryKey(),
      enabled: authenticatedUser?.userType === 'organisation',
    },
  });
  const friends = useListFriends({ query: { queryKey: getListFriendsQueryKey(), enabled: Boolean(authenticatedUser) } });
  const accountabilityNotifications = useGetAccountabilityDashboard({
    query: {
      queryKey: [...getGetAccountabilityDashboardQueryKey(), authenticatedUser?.id],
      enabled: authenticatedUser?.userType === 'participant',
      refetchInterval: 30_000,
    },
  });
  const friendNotifications = useListFriendNotifications({
    query: {
      queryKey: [...getListFriendNotificationsQueryKey(), authenticatedUser?.id],
      enabled: Boolean(authenticatedUser),
      refetchInterval: 30_000,
    },
  });
  const update = useUpdateMe({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [city, setCity] = useState(user.city ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [interests, setInterests] = useState<ExperienceCategory[]>(user.interests ?? []);
  const [socialLinks, setSocialLinks] = useState<SocialLinksFormState>(() => socialLinksFormState(user.socialLinks));
  const [organisationName, setOrganisationName] = useState(user.organisation?.name ?? '');
  const [organisationDescription, setOrganisationDescription] = useState(user.organisation?.description ?? '');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileMenuError, setProfileMenuError] = useState<string | null>(null);
  const [selectedProfileMetric, setSelectedProfileMetric] = useState<ProfileMetricKey | null>(null);
  const current = profile.data ?? user;

  const toggleProfileEditor = () => {
    if (!editing) {
      setName(current.name ?? '');
      setCity(current.city ?? '');
      setBio(current.bio ?? '');
      setInterests(current.interests ?? []);
      setSocialLinks(socialLinksFormState(current.socialLinks));
      setOrganisationName(current.organisation?.name ?? '');
      setOrganisationDescription(current.organisation?.description ?? '');
      setProfileSaveError(null);
    }
    setEditing((value) => !value);
  };

  const saveProfile = async () => {
    setProfileSaveError(null);
    try {
      const normalizedSocialLinks: Partial<Record<SocialLinkKey, string>> = {};
      for (const field of socialLinkFields) {
        const value = socialLinks[field.key].trim();
        if (!value) continue;
        const normalized = normalizeSocialLink(field.key, value);
        if (!normalized) {
          setProfileSaveError(`Enter a valid HTTPS link for ${field.label}.`);
          return;
        }
        normalizedSocialLinks[field.key] = normalized;
      }
      const baseData = {
        name: name.trim(),
        city: city.trim(),
        bio: bio.trim() || null,
        interests,
        socialLinks: normalizedSocialLinks,
      };
      const data = current.userType === 'organisation'
        ? {
            ...baseData,
            organisation: {
              name: organisationName.trim(),
              description: organisationDescription.trim(),
              city: city.trim(),
              categories: interests,
            },
          }
        : baseData;
      await update.mutateAsync({ data });
      await refresh();
      setEditing(false);
    } catch (error) {
      setProfileSaveError(requestErrorMessage(error, 'Your profile could not be saved. Your edits are still here—please try again.'));
    }
  };

  const openHostTools = () => {
    setProfileMenuError(null);
    go('host');
  };

  const handleSignOut = async () => {
    setProfileMenuError(null);
    try {
      await signOut();
      go('home');
    } catch {
      setProfileMenuError('Could not sign out. Please try again.');
    }
  };
  const invalidSocialLink = socialLinkFields.find(
    ({ key }) => socialLinks[key].trim() && !normalizeSocialLink(key, socialLinks[key]),
  );

  return (
    <KeyboardAwareScrollViewCompat
      testID="profile-edit-scroll"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      bottomOffset={24}
      showsVerticalScrollIndicator={false}
    >
      <Header
        title={current.userType === 'organisation' ? 'Organisation profile' : 'Passport'}
        subtitle={current.userType === 'organisation' ? (current.organisation?.name ?? 'Organisation account') : 'Participant account · Your contribution identity.'}
        menuItems={[
          {
            key: 'notifications',
            label: 'Notifications',
            icon: 'bell',
            badge:
              (friendNotifications.data?.unreadCount ?? 0) +
              (authenticatedUser?.userType === 'participant'
                ? accountabilityNotifications.data?.unreadCount ?? 0
                : 0),
            onPress: () => go('notifications'),
          },
          {
            key: 'friends',
            label: 'My Connections',
            icon: 'users',
            onPress: () => go('friends'),
          },
          {
            key: 'accounts-center',
            label: 'Accounts Centre',
            icon: 'users',
            onPress: () => go('accounts'),
          },
          {
            key: 'edit-profile',
            label: editing ? 'Close edit form' : 'Edit profile',
            icon: editing ? 'x' : 'edit-2',
            onPress: toggleProfileEditor,
          },
          ...(current.userType === 'organisation'
            ? [{
                key: 'host-tools',
                label: 'Organisation tools',
                icon: 'briefcase' as IconName,
                onPress: openHostTools,
              }]
            : []),
          {
            key: 'sign-out',
            label: 'Sign out',
            icon: 'log-out',
            onPress: () => { void handleSignOut(); },
          },
        ]}
      />
      {profileMenuError ? <InlineError message={profileMenuError} /> : null}

      {profile.isError && !profile.data ? (
        <EmptyState title="Profile details didn’t load" body="Your saved profile is still available. Try again." actionLabel="Try again" onAction={() => { void profile.refetch(); }} />
      ) : null}
      <ProfileMetricDetailsSheet
        metric={selectedProfileMetric}
        user={current}
        completed={completed.data}
        hosted={hosted.data}
        friends={friends.data}
        authenticated={Boolean(authenticatedUser)}
        authError={authError ?? null}
        isLoading={selectedProfileMetric === 'completed' ? completed.isLoading : selectedProfileMetric === 'hosted' ? hosted.isLoading : selectedProfileMetric === 'friends' ? friends.isLoading : false}
        hasError={selectedProfileMetric === 'completed' ? completed.isError : selectedProfileMetric === 'hosted' ? hosted.isError : selectedProfileMetric === 'friends' ? friends.isError : false}
        onRetry={() => {
          if (selectedProfileMetric === 'completed') void completed.refetch();
          else if (selectedProfileMetric === 'hosted') void hosted.refetch();
          else if (selectedProfileMetric === 'friends') void friends.refetch();
        }}
        onLogin={() => { void login(); }}
        onClose={() => setSelectedProfileMetric(null)}
        onOpenExperience={(id) => {
          triggerHaptic();
          setSelectedProfileMetric(null);
          go('experience', { id: String(id) });
        }}
        onOpenFriendProfile={(id) => {
          setSelectedProfileMetric(null);
          go('friend-profile', { friendId: String(id) });
        }}
      />

      {editing ? (
        <View
          testID="profile-edit-panel"
          style={[styles.editPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <View style={styles.profileEditorTitleRow}>
            <Text style={[styles.profileEditorTitle, { color: colors.foreground }]}>Edit your profile</Text>
            <Pressable
              testID="profile-edit-close"
              accessibilityRole="button"
              accessibilityLabel="Close edit form"
              onPress={() => setEditing(false)}
              style={({ pressed }) => [styles.profileEditorClose, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {current.userType === 'organisation' ? (
            <>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Organisation</Text>
              <TextInput value={organisationName} onChangeText={setOrganisationName} placeholder="Organisation name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
              <TextInput value={organisationDescription} onChangeText={setOrganisationDescription} multiline maxLength={600} placeholder="What your organisation does" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
            </>
          ) : null}
          <TextInput value={name} onChangeText={setName} placeholder={current.userType === 'organisation' ? 'Contact name' : 'Display name'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
          <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
          <TextInput value={bio} onChangeText={setBio} multiline placeholder={current.userType === 'organisation' ? 'Short contact bio' : 'Short bio'} placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
          <Text style={[styles.formLabel, { color: colors.foreground }]}>{current.userType === 'organisation' ? 'Causes your organisation supports' : 'Interests'}</Text>
          <View style={styles.onboardingChoices}>
            {categories.slice(1).map((item) => {
              const selected = interests.includes(item.key as ExperienceCategory);
              return (
                <Pressable key={item.key} onPress={() => setInterests((currentInterests) => selected ? currentInterests.filter((value) => value !== item.key) : [...currentInterests, item.key as ExperienceCategory])} style={[styles.choiceCard, { backgroundColor: selected ? colors.primary + '10' : colors.background, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                  <Feather name={item.icon} size={20} color={selected ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.choiceTitle, { color: selected ? colors.primary : colors.foreground }]}>{item.label}</Text>
                  <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.primary : colors.border} />
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Social links</Text>
          <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>
            Add secure HTTPS links. These appear as icons below your profile badges.
          </Text>
          {socialLinkFields.map((field) => {
            const value = socialLinks[field.key];
            const hasInvalidValue = Boolean(value.trim() && !normalizeSocialLink(field.key, value));
            return (
              <View key={field.key}>
                <TextInput
                  testID={`profile-social-input-${field.key}`}
                  accessibilityLabel={`${field.label} profile link`}
                  value={value}
                  onChangeText={(text) => setSocialLinks((currentLinks) => ({ ...currentLinks, [field.key]: text }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  maxLength={500}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: hasInvalidValue ? colors.destructive : colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]}
                />
                {hasInvalidValue ? (
                  <Text style={[styles.inputHint, { color: colors.destructive }]}>
                    Enter a valid HTTPS {field.label} link.
                  </Text>
                ) : null}
              </View>
            );
          })}
          {!name.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add a display name to save your profile.</Text> : null}
          {!city.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add a city to save your profile.</Text> : null}
          {!interests.length ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Choose at least one interest to save your profile.</Text> : null}
          {current.userType === 'organisation' && !organisationName.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add an organisation name.</Text> : null}
          {current.userType === 'organisation' && !organisationDescription.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add an organisation description.</Text> : null}
          {profileSaveError ? <InlineError message={profileSaveError} /> : null}
          <Button
            label={update.isPending ? 'Saving…' : 'Save profile'}
            disabled={update.isPending || !name.trim() || !city.trim() || interests.length === 0 || Boolean(invalidSocialLink) || (current.userType === 'organisation' && (!organisationName.trim() || !organisationDescription.trim()))}
            onPress={() => void saveProfile()}
          />
        </View>
      ) : null}

      <SocialProfileHeader
        user={current}
        friendsCount={friends.data?.length ?? 0}
        isEditing={editing}
        onEditPress={toggleProfileEditor}
        onMetricPress={(metric) => {
          if (metric === 'friends') {
            go('friends');
            return;
          }
          setSelectedProfileMetric(metric);
        }}
      />

      {current.userType === 'participant' ? (
        <>
          <ContributionDashboard user={current} completed={completed.data} />
          <CommunityXpPanel />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent impact</Text>
          {completed.isLoading ? <LoadingState /> : completed.isError ? (
            <View>
              <InlineError message="Your impact history couldn’t be loaded." />
              <Button label="Try again" variant="secondary" onPress={() => { void completed.refetch(); }} />
            </View>
          ) : completed.data?.length ? completed.data.slice(0, 3).map((item) => (
            <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.historyDot, { backgroundColor: colors.primary }]} />
              <View style={styles.historyCopy}>
                <Text style={[styles.historyTitle, { color: colors.foreground }]}>{item.experience.title}</Text>
                <Text style={[styles.historySub, { color: colors.mutedForeground }]}>{dateLabel(item.experience.date)}</Text>
              </View>
              <View style={[styles.historyRewardPill, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.historyRewardText, { color: colors.primary }]}>+{item.experience.xpReward} XP</Text>
              </View>
            </View>
          )) : <Text style={[styles.mutedParagraph, { color: colors.mutedForeground }]}>Verified contributions will appear here.</Text>}
        </>
      ) : (
        <View style={[styles.editPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About your organisation</Text>
          <Text
            style={[
              styles.mutedParagraph,
              { color: colors.mutedForeground, marginTop: 0, marginBottom: 0, lineHeight: 21 },
            ]}
          >
            {current.organisation?.description ?? 'Complete your organisation details to introduce your work to participants.'}
          </Text>
          <View style={styles.organisationLocation}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text numberOfLines={1} style={[styles.organisationLocationText, { color: colors.mutedForeground }]}>
              {current.organisation?.city ?? current.city ?? 'Location not set'}
            </Text>
          </View>
          <View
            testID="organisation-overview-stats"
            style={[styles.organisationStats, { borderColor: colors.border }]}
          >
            {[
              { label: 'Experiences', value: hostOverview.data?.totalExperiences },
              { label: 'Upcoming', value: hostOverview.data?.upcomingExperiences },
              { label: 'Participants', value: hostOverview.data?.participantCount },
            ].map((stat, index) => (
              <View
                key={stat.label}
                style={[
                  styles.organisationStat,
                  index < 2 && styles.organisationStatDivider,
                  index < 2 && { borderRightColor: colors.border },
                ]}
              >
                <Text style={[styles.organisationStatValue, { color: colors.foreground }]}>
                  {stat.value ?? '—'}
                </Text>
                <Text style={[styles.organisationStatLabel, { color: colors.mutedForeground }]}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
          <Button label="Open organisation tools" icon="briefcase" onPress={() => go('host')} />
        </View>
      )}

      <Pressable
        testID="profile-friends-overview"
        accessibilityRole="button"
        accessibilityLabel="Open My Connections"
        accessibilityHint="Manage friend requests and view your friends."
        onPress={() => { triggerHaptic(); go('friends'); }}
        style={({ pressed }) => [
          styles.friendPersonRow,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <View style={[styles.friendAvatar, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="users" size={20} color={colors.primary} />
        </View>
        <View style={styles.friendPersonCopy}>
          <Text numberOfLines={1} style={[styles.friendPersonName, { color: colors.foreground }]}>My Connections</Text>
          <Text numberOfLines={2} style={[styles.friendPersonMeta, { color: colors.mutedForeground }]}>Manage requests and view your circle.</Text>
        </View>
        <View style={[styles.friendCountPill, { backgroundColor: colors.primary + '12' }]}>
          <Text style={[styles.friendCountText, { color: colors.primary }]}>{friends.data?.length ?? 0}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>

      <View style={{ height: 120 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

function Host({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const overview = useGetHostOverview();
  const experiences = useListHostExperiences();
  const [experienceSearch, setExperienceSearch] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<HostExperienceFilter>('all');
  const allExperiences = experiences.data ?? [];
  const searchTerm = experienceSearch.trim().toLowerCase();
  const filteredExperiences = allExperiences.filter((item) => {
    const matchesSearch = !searchTerm || [item.title, item.city, item.location, categoryLabel[item.category]]
      .some((value) => value.toLowerCase().includes(searchTerm));
    return matchesSearch && (experienceFilter === 'all' || item.status === experienceFilter);
  });
  const isRefreshing = overview.isRefetching || experiences.isRefetching;
  const refreshHostData = () => {
    triggerHaptic();
    void Promise.all([overview.refetch(), experiences.refetch()]);
  };

  if (user?.userType !== 'organisation') {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Organisation tools" onBack={() => go('profile')} /><EmptyState title="Organisation account required" body="Participant accounts can explore and join experiences. Only Organisation accounts can create and manage experiences." actionLabel="Go home" onAction={() => go('home')} /></View>;
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshHostData} tintColor={colors.primary} />}
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="handled"
    >
      <Header title="Host tools" subtitle={overview.data?.organisation?.name ?? 'Create your first opportunity'} onBack={() => go('home')} />

      <View style={[styles.hostHero, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
        <View style={styles.hostHeroMark}>
          <Feather name="briefcase" size={17} color={colors.primaryForeground} />
          <Text style={[styles.hostHeroEyebrow, { color: colors.primaryForeground }]}>ORGANISATION SPACE</Text>
        </View>
        <Text style={[styles.hostHeroTitle, { color: colors.primaryForeground }]}>Bring your next experience to life.</Text>
        <Text style={[styles.hostHeroBody, { color: colors.primaryForeground }]}>Keep your listings moving and recognise the people who take part.</Text>
        <Button
          label="Create experience"
          icon="plus"
          color={colors.primaryForeground}
          textColor={colors.secondary}
          testID="host-create-experience"
          onPress={() => { triggerHaptic(); go('create'); }}
        />
      </View>

      <View style={styles.hostStats}>
        {[
          { label: 'Live', value: overview.data?.upcomingExperiences ?? 0, icon: 'calendar' as const },
          { label: 'Participants', value: overview.data?.participantCount ?? 0, icon: 'users' as const },
          { label: 'Waitlist', value: overview.data?.waitlistCount ?? 0, icon: 'clock' as const },
          { label: 'Completion reviews', value: overview.data?.pendingCompletionReviews ?? 0, icon: 'check-circle' as const },
          { label: 'Milestone reviews', value: overview.data?.pendingMilestoneReviews ?? 0, icon: 'award' as const },
        ].map((item) => (
          <View key={item.label} style={[styles.hostStat, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.hostStatTop}>
              <Feather name={item.icon} size={15} color={colors.primary} />
              <Text style={[styles.hostStatValue, { color: colors.foreground }]}>
                {overview.isLoading ? '…' : overview.isError ? '—' : item.value}
              </Text>
            </View>
            <Text style={[styles.hostStatLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {overview.isError ? <EmptyState title="Host statistics couldn’t be loaded" body="Check your connection and try again." actionLabel="Try again" onAction={() => { void overview.refetch(); }} /> : null}

      <View style={styles.hostSectionHeader}>
        <View style={styles.hostSectionCopy}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your experiences</Text>
          <Text style={[styles.hostSectionHint, { color: colors.mutedForeground }]}>
            {experiences.isLoading ? 'Loading your listings…' : `${filteredExperiences.length} of ${allExperiences.length} listings`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh host tools"
          testID="host-refresh"
          onPress={refreshHostData}
          style={[styles.hostRefreshButton, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}
        >
          <Feather name="refresh-cw" size={17} color={colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.hostSearchBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Search experiences"
          testID="host-experience-search"
          value={experienceSearch}
          onChangeText={setExperienceSearch}
          placeholder="Search title, place or category"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.hostSearchInput, { color: colors.foreground }]}
        />
        {experienceSearch ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear experience search" onPress={() => setExperienceSearch('')} hitSlop={8}>
            <Feather name="x-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hostFilterList}>
        {hostExperienceFilters.map((option) => {
          const active = experienceFilter === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              testID={`host-experience-filter-${option.key}`}
              onPress={() => setExperienceFilter(option.key)}
              style={[styles.hostFilterChip, { backgroundColor: active ? colors.secondary : colors.card, borderColor: active ? colors.secondary : colors.border, borderRadius: colors.radius }]}
            >
              <Text style={[styles.hostFilterText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {experiences.isLoading ? <LoadingState /> : experiences.isError ? (
        <EmptyState title="Your experiences didn’t load" body="Try again to see your published opportunities." actionLabel="Try again" onAction={() => { void experiences.refetch(); }} />
      ) : allExperiences.length === 0 ? (
        <EmptyState title="No experience published" body="Create a real volunteering opportunity and it will appear here." icon="edit-3" actionLabel="Create experience" onAction={() => go('create')} />
      ) : filteredExperiences.length ? filteredExperiences.map((item) => {
        const statusColor = item.status === 'published' ? colors.success : item.status === 'full' ? colors.secondary : colors.mutedForeground;
        const filledCapacity = item.capacity > 0 ? Math.min(100, Math.round((item.participantCount / item.capacity) * 100)) : 0;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Open management for ${item.title}. ${hostExperienceStatusLabels[item.status]}, ${item.participantCount} of ${item.capacity} places filled, ${item.waitlistCount} waitlisted.`}
            testID={`host-experience-${item.id}`}
            onPress={() => { triggerHaptic(); go('host-detail', { id: String(item.id) }); }}
            style={[styles.hostExperienceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <View style={styles.hostExperienceTop}>
              <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
                <Feather name={categoryIcon[item.category]} size={22} color={colors.primary} />
              </View>
              <View style={styles.hostExperienceTitleBlock}>
                <Text style={[styles.hostExperienceEyebrow, { color: colors.mutedForeground }]}>{categoryLabel[item.category]} · {dateLabel(item.date)}</Text>
                <Text numberOfLines={2} style={[styles.hostExperienceTitle, { color: colors.foreground }]}>{item.title}</Text>
              </View>
              <View style={[styles.hostStatusPill, { backgroundColor: statusColor + '14' }]}>
                <Text style={[styles.hostStatusText, { color: statusColor }]}>{hostExperienceStatusLabels[item.status]}</Text>
              </View>
            </View>

            <View style={styles.hostExperienceBody}>
              <View style={styles.hostMetaLine}>
                <Feather name="map-pin" size={15} color={colors.mutedForeground} />
                <Text numberOfLines={1} style={[styles.hostMetaText, { color: colors.mutedForeground }]}>{item.location}, {item.city}</Text>
              </View>
              <View style={styles.hostMetaLine}>
                <Feather name="clock" size={15} color={colors.mutedForeground} />
                <Text style={[styles.hostMetaText, { color: colors.mutedForeground }]}>{item.startTime} – {item.endTime}</Text>
              </View>
              <View style={styles.hostCapacityHeader}>
                <Text style={[styles.hostCapacityLabel, { color: colors.mutedForeground }]}>Places filled</Text>
                <Text style={[styles.hostCapacityCount, { color: colors.foreground }]}>{item.participantCount} / {item.capacity}</Text>
              </View>
              <View style={[styles.hostCapacityTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.hostCapacityFill, { width: `${filledCapacity}%`, backgroundColor: colors.primary }]} />
              </View>
              <View style={styles.hostExperienceFooter}>
                <View style={styles.hostRewardRow}>
                  <Feather name="award" size={14} color={colors.secondary} />
                  <Text style={[styles.hostRewardText, { color: colors.secondary }]}>{item.xpReward} XP</Text>
                  {item.monetaryRewardPence ? <Text style={[styles.hostRewardText, { color: colors.mutedForeground }]}>· {money(item.monetaryRewardPence)}</Text> : null}
                </View>
                <Text style={[styles.hostPlacesText, { color: item.availablePlaces === 0 ? colors.primary : colors.mutedForeground }]}>
                  {item.availablePlaces === 0 ? 'No places left' : `${item.availablePlaces} places left`}
                </Text>
              </View>
              <View style={styles.hostManageRow}>
                <Text style={[styles.hostManageText, { color: colors.primary }]}>Manage experience</Text>
                <Feather name="arrow-right" size={16} color={colors.primary} />
              </View>
            </View>
          </Pressable>
        );
      }) : (
        <EmptyState
          title="No matching experiences"
          body="Try another search or status filter."
          icon="search"
          actionLabel="Clear filters"
          onAction={() => { setExperienceSearch(''); setExperienceFilter('all'); }}
        />
      )}

      <View style={{ height: 120 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

function HostExperienceDetail({
  experienceId,
  go,
}: {
  experienceId: number;
  go: (screen: Screen, params?: Record<string, string>) => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const validExperienceId = Number.isSafeInteger(experienceId) && experienceId > 0;
  const experiences = useListHostExperiences({
    query: {
      queryKey: getListHostExperiencesQueryKey(),
      enabled: user?.userType === 'organisation',
    },
  });
  const participantExperienceId = validExperienceId ? experienceId : 0;
  const participants = useListExperienceParticipants(participantExperienceId, {
    query: {
      queryKey: getListExperienceParticipantsQueryKey(participantExperienceId),
      enabled: validExperienceId && user?.userType === 'organisation',
    },
  });
  const milestoneTracking = useGetHostExperienceMilestones(participantExperienceId, {
    query: {
      queryKey: getGetHostExperienceMilestonesQueryKey(participantExperienceId),
      enabled: validExperienceId && user?.userType === 'organisation',
    },
  });
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantFilter, setParticipantFilter] = useState<HostParticipantFilter>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const attend = useMarkAttendance({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const verify = useVerifyParticipation({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const reject = useRejectParticipation({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const reviewMilestone = useReviewExperienceMilestoneSubmission({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const promoteNext = usePromoteNextWaitlistedParticipant({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const cancelExperience = useCancelHostExperience({
    mutation: {
      onSuccess: (cancelledExperience) => {
        queryClient.setQueryData<Experience[]>(
          getListHostExperiencesQueryKey(),
          (current) => current?.map((item) => item.id === cancelledExperience.id
            ? {
                ...cancelledExperience,
                waitlistCount: 'waitlistCount' in item && typeof item.waitlistCount === 'number' ? item.waitlistCount : 0,
              }
            : item),
        );
        void queryClient.invalidateQueries({ queryKey: getListHostExperiencesQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetHostOverviewQueryKey() });
        setConfirmingCancellation(false);
        triggerHaptic();
      },
    },
  });

  const experience = validExperienceId
    ? experiences.data?.find((item) => item.id === experienceId)
    : undefined;
  const allParticipants = participants.data ?? [];
  const milestoneDefinitions = milestoneTracking.data?.milestones ?? [];
  const pendingMilestoneSubmissions: ExperienceMilestoneSubmission[] = milestoneTracking.data?.submissions ?? [];
  const waitlistedParticipants = allParticipants
    .filter((item) => item.status === 'waitlisted')
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() || a.id - b.id);
  const waitlistPosition = new Map<number, number>(waitlistedParticipants.map((item, index) => [item.id, index + 1] as const));
  const pendingReviewCount = allParticipants.filter((item) => item.status === 'submitted').length;
  const participantCount = allParticipants.filter((item) => item.status !== 'waitlisted').length;
  const filterCounts: Record<HostParticipantFilter, number> = {
    all: allParticipants.length,
    participants: participantCount,
    review: pendingReviewCount,
    waitlisted: waitlistedParticipants.length,
  };
  const participantTerm = participantSearch.trim().toLowerCase();
  const filteredParticipants = allParticipants.filter((item) => {
    const matchesSearch = !participantTerm || [item.participant.name, item.participant.username ?? '']
      .some((value) => value.toLowerCase().includes(participantTerm));
    const matchesFilter = participantFilter === 'all'
      || (participantFilter === 'participants' && item.status !== 'waitlisted')
      || (participantFilter === 'review' && item.status === 'submitted')
      || (participantFilter === 'waitlisted' && item.status === 'waitlisted');
    return matchesSearch && matchesFilter;
  });
  const isRefreshing = experiences.isRefetching || participants.isRefetching || milestoneTracking.isRefetching;
  const refreshHostData = () => {
    triggerHaptic();
    void Promise.all([
      experiences.refetch(),
      validExperienceId ? participants.refetch() : Promise.resolve(),
      validExperienceId ? milestoneTracking.refetch() : Promise.resolve(),
    ]);
  };
  const runHostAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(requestErrorMessage(error, 'That host action could not be completed. Please try again.'));
    }
  };
  const reviewMilestoneSubmission = (submissionId: number, action: 'verify' | 'reject') => runHostAction(
    () => reviewMilestone.mutateAsync({ submissionId, data: { action } }),
  );
  const statusColor = experience?.status === 'published'
    ? colors.success
    : experience?.status === 'full'
      ? colors.secondary
      : colors.mutedForeground;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshHostData} tintColor={colors.primary} />}
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="handled"
    >
      <Header title="Manage experience" subtitle="Host tools" onBack={() => go('host')} />
      {experiences.isLoading && !experience ? <LoadingState /> : null}
      {experiences.isError && !experience ? (
        <EmptyState
          title="This experience couldn’t be loaded"
          body="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => { void experiences.refetch(); }}
        />
      ) : null}
      {!experiences.isLoading && !experiences.isError && !experience ? (
        <EmptyState
          title="Experience not found"
          body="It may have been removed. Return to your experience list to continue."
          actionLabel="Back to host tools"
          onAction={() => go('host')}
        />
      ) : null}

      {experience ? (
        <>
          <View style={[styles.hostDetailCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.hostDetailTopline}>
              <View style={[styles.hostDetailCategoryBadge, { backgroundColor: colors.primary + '12' }]}>
                <Feather name={categoryIcon[experience.category]} size={13} color={colors.primary} />
                <Text style={[styles.hostDetailCategoryText, { color: colors.primary }]}>{categoryLabel[experience.category]}</Text>
              </View>
              <View style={[styles.hostStatusPill, { backgroundColor: statusColor + '14' }]}>
                <Text style={[styles.hostStatusText, { color: statusColor }]}>{hostExperienceStatusLabels[experience.status]}</Text>
              </View>
            </View>
            <Text style={[styles.hostDetailTitle, { color: colors.foreground }]}>{experience.title}</Text>
            <Text style={[styles.hostDetailDescription, { color: colors.mutedForeground }]}>
              {experience.description || 'No description added yet.'}
            </Text>

            <View style={styles.hostDetailFacts}>
              <View style={[styles.hostDetailFact, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: Math.max(8, colors.radius - 6) }]}>
                <View style={styles.hostDetailFactHeader}>
                  <View style={[styles.hostDetailFactIcon, { backgroundColor: colors.card }]}>
                    <Feather name="calendar" size={13} color={colors.primary} />
                  </View>
                  <Text style={[styles.hostDetailFactLabel, { color: colors.mutedForeground }]}>WHEN</Text>
                </View>
                <Text style={[styles.hostDetailFactValue, { color: colors.foreground }]}>{dateLabel(experience.date)}</Text>
                <Text style={[styles.hostDetailFactSecondary, { color: colors.mutedForeground }]}>
                  {experience.startTime} – {experience.endTime}
                </Text>
              </View>
              <View style={[styles.hostDetailFact, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: Math.max(8, colors.radius - 6) }]}>
                <View style={styles.hostDetailFactHeader}>
                  <View style={[styles.hostDetailFactIcon, { backgroundColor: colors.card }]}>
                    <Feather name="map-pin" size={13} color={colors.primary} />
                  </View>
                  <Text style={[styles.hostDetailFactLabel, { color: colors.mutedForeground }]}>WHERE</Text>
                </View>
                <Text style={[styles.hostDetailFactValue, { color: colors.foreground }]}>{experience.location}</Text>
                <Text style={[styles.hostDetailFactSecondary, { color: colors.mutedForeground }]}>{experience.city}</Text>
              </View>
            </View>

            <View style={styles.hostDetailCapacity}>
              <View style={styles.hostCapacityHeader}>
                <Text style={[styles.hostCapacityLabel, { color: colors.mutedForeground }]}>Places filled</Text>
                <Text style={[styles.hostCapacityCount, { color: colors.foreground }]}>{experience.participantCount} / {experience.capacity}</Text>
              </View>
              <View style={[styles.hostDetailProgressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.hostDetailProgressFill,
                    {
                      width: `${experience.capacity > 0 ? Math.min(100, Math.round((experience.participantCount / experience.capacity) * 100)) : 0}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.hostDetailFooter}>
              <View style={styles.hostDetailRewards}>
                <View style={[styles.hostDetailRewardPill, { backgroundColor: colors.secondary + '12' }]}>
                  <Feather name="award" size={13} color={colors.secondary} />
                  <Text style={[styles.hostDetailRewardText, { color: colors.secondary }]}>{experience.xpReward} XP</Text>
                </View>
                {experience.monetaryRewardPence ? (
                  <Text style={[styles.hostDetailMoneyReward, { color: colors.mutedForeground }]}>{money(experience.monetaryRewardPence)}</Text>
                ) : null}
              </View>
              <Text style={[styles.hostPlacesText, { color: experience.availablePlaces === 0 ? colors.primary : colors.mutedForeground }]}>
                {experience.availablePlaces === 0 ? 'No places left' : `${experience.availablePlaces} places left`}
              </Text>
            </View>
          </View>

          {experience.status === 'cancelled' ? (
            <View
              testID="host-cancelled-notice"
              style={[styles.createTip, { backgroundColor: colors.destructive + '10', borderRadius: colors.radius, marginBottom: 14, padding: 13 }]}
            >
              <Feather name="slash" size={18} color={colors.destructive} />
              <Text style={[styles.createTipText, { color: colors.foreground, flex: 1 }]}>
                This experience is cancelled. New sign-ups are closed. Existing participant and milestone records are kept.
              </Text>
            </View>
          ) : null}

          {['published', 'full'].includes(experience.status) ? (
            <View style={{ flexDirection: 'row', gap: 9, marginBottom: 14 }}>
              <Button
                testID="host-edit-experience"
                label="Edit experience"
                icon="edit-2"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => go('create', { id: String(experience.id), step: String(createExperienceQuestions.length + 1) })}
              />
              <Button
                testID="host-cancel-experience"
                label="Cancel"
                icon="x-circle"
                color={colors.destructive + '12'}
                textColor={colors.destructive}
                style={{ flex: 1 }}
                onPress={() => setConfirmingCancellation(true)}
              />
            </View>
          ) : null}

          {confirmingCancellation && ['published', 'full'].includes(experience.status) ? (
            <View
              testID="host-cancel-confirmation"
              style={[styles.createReviewCard, { backgroundColor: colors.card, borderColor: colors.destructive + '55', borderRadius: colors.radius, marginBottom: 14 }]}
            >
              <Text style={[styles.createReviewSectionTitle, { color: colors.destructive }]}>CANCEL THIS EXPERIENCE?</Text>
              <Text style={[styles.mutedParagraph, { color: colors.mutedForeground, marginTop: 4 }]}>
                This closes sign-ups. Participant and milestone records will remain available. Participants are not notified automatically.
              </Text>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
                <Button
                  testID="host-cancel-confirm"
                  label={cancelExperience.isPending ? 'Cancelling…' : 'Confirm cancellation'}
                  icon="x-circle"
                  color={colors.destructive}
                  disabled={cancelExperience.isPending}
                  style={{ flex: 1 }}
                  onPress={() => void runHostAction(() => cancelExperience.mutateAsync({ experienceId: experience.id }))}
                />
                <Button
                  testID="host-cancel-dismiss"
                  label="Keep active"
                  variant="secondary"
                  disabled={cancelExperience.isPending}
                  style={{ flex: 1 }}
                  onPress={() => setConfirmingCancellation(false)}
                />
              </View>
            </View>
          ) : null}

          <View style={[styles.infoBlock, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
            <View style={styles.infoBlockHeading}>
              <View style={[styles.infoBlockIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="list" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>Milestone timeline</Text>
                <Text style={[styles.hostSectionHint, { color: colors.mutedForeground, marginTop: 3 }]}>
                  Each verified milestone releases its XP award to the participant.
                </Text>
              </View>
            </View>
            {milestoneTracking.isLoading && !milestoneTracking.data ? (
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.hostSectionHint, { color: colors.mutedForeground }]}>Loading milestones…</Text>
              </View>
            ) : milestoneTracking.isError ? (
              <View style={{ marginTop: 12 }}>
                <InlineError message="Milestone details couldn’t be loaded. Refresh to try again." />
              </View>
            ) : milestoneDefinitions.length ? (
              <View style={{ gap: 8, marginTop: 12 }}>
                {milestoneDefinitions.map((milestone) => (
                  <View
                    key={milestone.id}
                    testID={`host-milestone-${milestone.id}`}
                    style={{ alignItems: 'flex-start', backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius - 6, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 }}
                  >
                    <View style={{ alignItems: 'center', backgroundColor: colors.primary + '13', borderRadius: 18, height: 30, justifyContent: 'center', width: 30 }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{milestone.position}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{milestone.title}</Text>
                      {milestone.description ? (
                        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>{milestone.description}</Text>
                      ) : null}
                    </View>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>+{milestone.xpReward} XP</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.hostSectionHint, { color: colors.mutedForeground, marginTop: 12 }]}>
                This experience uses a single completion submission instead of milestones.
              </Text>
            )}

            {pendingMilestoneSubmissions.length ? (
              <View style={{ borderTopColor: colors.border, borderTopWidth: 1, gap: 10, marginTop: 14, paddingTop: 14 }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }}>Milestones to review</Text>
                  <View style={{ backgroundColor: colors.secondary + '18', borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 }}>
                    <Text style={{ color: colors.secondary, fontSize: 12, fontWeight: '700' }}>{pendingMilestoneSubmissions.length}</Text>
                  </View>
                </View>
                {pendingMilestoneSubmissions.map((submission) => (
                  <View
                    key={submission.id}
                    testID={`host-milestone-submission-${submission.id}`}
                    style={{ backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 6, borderWidth: 1, gap: 9, padding: 12 }}
                  >
                    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 9 }}>
                      <View style={[styles.participantAvatar, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={[styles.participantInitial, { color: colors.primary }]}>{submission.participant.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{submission.participant.name}</Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                          {submission.milestoneTitle} · +{submission.xpReward} XP
                        </Text>
                      </View>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                        {hostTimestampLabel(submission.submittedAt) ?? 'Submitted'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        testID={`host-verify-milestone-${submission.id}`}
                        label={reviewMilestone.isPending ? 'Saving…' : 'Verify'}
                        icon="check"
                        color={colors.secondary}
                        disabled={reviewMilestone.isPending}
                        style={styles.hostActionButton}
                        onPress={() => void reviewMilestoneSubmission(submission.id, 'verify')}
                      />
                      <Button
                        testID={`host-reject-milestone-${submission.id}`}
                        label={reviewMilestone.isPending ? 'Saving…' : 'Request update'}
                        icon="x"
                        variant="secondary"
                        disabled={reviewMilestone.isPending}
                        style={styles.hostActionButton}
                        onPress={() => void reviewMilestoneSubmission(submission.id, 'reject')}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.hostDetailMetrics}>
            {[
              { key: 'participants' as const, filter: 'participants' as const, label: 'Participants', value: experience.participantCount, icon: 'users' as const },
              { key: 'waitlist' as const, filter: 'waitlisted' as const, label: 'Waitlist', value: experience.waitlistCount, icon: 'clock' as const },
              {
                key: 'review' as const,
                filter: 'review' as const,
                label: 'Completions',
                value: participants.isLoading ? '…' : participants.isError ? '—' : pendingReviewCount,
                icon: 'check-circle' as const,
              },
            ].map((metric) => (
              <Pressable
                key={metric.key}
                accessibilityRole="button"
                accessibilityLabel={`${metric.label}: ${metric.value}. Show ${metric.label.toLowerCase()}.`}
                accessibilityState={{ selected: participantFilter === metric.filter }}
                testID={`host-detail-metric-${metric.key}`}
                onPress={() => setParticipantFilter(metric.filter)}
                style={[
                  styles.hostDetailMetric,
                  {
                    backgroundColor: colors.card,
                    borderColor: participantFilter === metric.filter ? colors.primary : colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <View style={styles.hostDetailMetricTop}>
                  <Feather name={metric.icon} size={15} color={colors.primary} />
                  <Text style={[styles.hostDetailMetricValue, { color: colors.foreground }]}>{metric.value}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.hostDetailMetricLabel, { color: colors.mutedForeground }]}>{metric.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.hostSectionHeader}>
            <View style={styles.hostSectionCopy}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Participants & reviews</Text>
              <Text style={[styles.hostSectionHint, { color: colors.mutedForeground }]}>
                Manage sign-ups, the waitlist, attendance and completion checks.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh experience participants"
              testID="host-detail-refresh"
              onPress={refreshHostData}
              style={[styles.hostRefreshButton, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}
            >
              <Feather name="refresh-cw" size={17} color={colors.primary} />
            </Pressable>
          </View>
          {actionError ? <InlineError message={actionError} /> : null}

          <View style={[styles.hostSearchBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Feather name="search" size={17} color={colors.mutedForeground} />
            <TextInput
              accessibilityLabel="Search participants"
              testID="host-participant-search"
              value={participantSearch}
              onChangeText={setParticipantSearch}
              placeholder="Search name or username"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[styles.hostSearchInput, { color: colors.foreground }]}
            />
            {participantSearch ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear participant search" onPress={() => setParticipantSearch('')} hitSlop={8}>
                <Feather name="x-circle" size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hostFilterList}>
            {hostParticipantFilters.map((option) => {
              const active = participantFilter === option.key;
              const count = participants.isLoading ? '…' : participants.isError ? '—' : filterCounts[option.key];
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`host-detail-filter-${option.key}`}
                  onPress={() => setParticipantFilter(option.key)}
                  style={[
                    styles.hostFilterChip,
                    styles.hostDetailFilterChip,
                    { backgroundColor: active ? colors.secondary : colors.card, borderColor: active ? colors.secondary : colors.border, borderRadius: colors.radius },
                  ]}
                >
                  <Text style={[styles.hostFilterText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{option.label}</Text>
                  <Text style={[styles.hostDetailFilterCount, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[styles.hostSectionHint, styles.hostParticipantCount, { color: colors.mutedForeground }]}>
            {participants.isLoading ? 'Loading people…' : participants.isError ? 'People could not be loaded' : `${filteredParticipants.length} of ${allParticipants.length} people`}
          </Text>

          {!participants.isLoading && !participants.isError && waitlistedParticipants.length > 0
            && (participantFilter === 'all' || participantFilter === 'waitlisted') ? (
              <View style={[styles.hostWaitlistPanel, { backgroundColor: colors.secondary + '0C', borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={styles.hostWaitlistCopy}>
                  <View style={[styles.hostWaitlistIcon, { backgroundColor: colors.secondary + '15' }]}>
                    <Feather name="clock" size={16} color={colors.secondary} />
                  </View>
                  <View style={styles.hostWaitlistTextBlock}>
                    <Text style={[styles.hostWaitlistTitle, { color: colors.foreground }]}>
                      {waitlistedParticipants.length} {waitlistedParticipants.length === 1 ? 'person is' : 'people are'} waiting
                    </Text>
                    <Text style={[styles.hostWaitlistText, { color: colors.mutedForeground }]}>
                      {experience.availablePlaces > 0
                        ? `${experience.availablePlaces} ${experience.availablePlaces === 1 ? 'place is' : 'places are'} open. The oldest person is next.`
                        : 'The oldest person is promoted first when a place opens.'}
                    </Text>
                  </View>
                </View>
                <Button
                  label={promoteNext.isPending
                    ? 'Promoting…'
                    : experience.availablePlaces > 0
                      ? 'Promote next'
                      : 'Open a place & promote next'}
                  icon="user-plus"
                  variant="secondary"
                  disabled={promoteNext.isPending || !['published', 'full'].includes(experience.status)}
                  testID="host-promote-next"
                  onPress={() => void runHostAction(() => promoteNext.mutateAsync({ experienceId: experience.id }))}
                />
              </View>
            ) : null}

          {participants.isLoading ? <LoadingState /> : participants.isError ? (
            <EmptyState
              title="People couldn’t be loaded"
              body="Try again to check attendance and completion."
              actionLabel="Try again"
              onAction={() => { void participants.refetch(); }}
            />
          ) : allParticipants.length === 0 ? (
            <EmptyState title="No participants yet" body="When people join, you’ll manage attendance and completion here." icon="users" />
          ) : filteredParticipants.length ? filteredParticipants.map((item) => {
            const participantStatusColor = item.status === 'verified' || item.status === 'attended'
              ? colors.success
              : item.status === 'waitlisted' || item.status === 'submitted'
                ? colors.secondary
                : item.status === 'rejected'
                  ? colors.destructive
                  : colors.mutedForeground;
            const activityDate = hostTimestampLabel(item.status === 'submitted' ? item.submittedAt : item.joinedAt);
            return (
              <View key={item.id} style={[styles.hostParticipantCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={styles.hostParticipantTop}>
                  <View style={[styles.participantAvatar, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.participantInitial, { color: colors.primary }]}>{item.participant.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.participantCopy}>
                    <Text numberOfLines={1} style={[styles.participantName, { color: colors.foreground }]}>{item.participant.name}</Text>
                    <Text numberOfLines={1} style={[styles.participantStatus, { color: colors.mutedForeground }]}>{item.participant.username ? `@${item.participant.username}` : 'Experiences.fun participant'}</Text>
                  </View>
                  <View style={[styles.hostStatusPill, { backgroundColor: participantStatusColor + '14' }]}>
                    <Text style={[styles.hostStatusText, { color: participantStatusColor }]}>{hostParticipationStatusLabels[item.status]}</Text>
                  </View>
                </View>
                <View style={styles.hostParticipantMeta}>
                  <Feather name={item.status === 'submitted' ? 'clock' : 'calendar'} size={13} color={colors.mutedForeground} />
                  <Text style={[styles.hostParticipantMetaText, { color: colors.mutedForeground }]}>
                    {item.status === 'submitted'
                      ? 'Submitted'
                      : item.status === 'waitlisted'
                        ? 'Waitlisted'
                        : 'Joined'}{activityDate ? ` · ${activityDate}` : ''}
                  </Text>
                </View>
                {item.status === 'submitted' ? (
                  <>
                    <View style={[styles.hostReviewNote, { backgroundColor: colors.primary + '0C' }]}>
                      <Feather name="award" size={16} color={colors.primary} />
                      <Text style={[styles.hostReviewText, { color: colors.foreground }]}>
                        Verify this completion to award {item.experience.xpReward} XP.
                      </Text>
                    </View>
                    <View style={styles.hostActionPair}>
                      <Button
                        label={verify.isPending ? 'Saving…' : 'Verify'}
                        icon="check"
                        color={colors.secondary}
                        disabled={verify.isPending || reject.isPending}
                        style={styles.hostActionButton}
                        testID={`host-verify-${item.id}`}
                        onPress={() => void runHostAction(() => verify.mutateAsync({ participationId: item.id }))}
                      />
                      <Button
                        label={reject.isPending ? 'Saving…' : 'Reject'}
                        icon="x"
                        variant="secondary"
                        disabled={verify.isPending || reject.isPending}
                        style={styles.hostActionButton}
                        testID={`host-reject-${item.id}`}
                        onPress={() => void runHostAction(() => reject.mutateAsync({ participationId: item.id }))}
                      />
                    </View>
                  </>
                ) : item.status === 'joined' ? (
                  <Button
                    label={attend.isPending ? 'Saving…' : 'Mark attended'}
                    icon="check"
                    variant="secondary"
                    disabled={attend.isPending}
                    style={styles.hostFullActionButton}
                    testID={`host-attend-${item.id}`}
                    onPress={() => void runHostAction(() => attend.mutateAsync({ participationId: item.id }))}
                  />
                ) : item.status === 'waitlisted' ? (
                  <View style={[styles.hostParticipantOutcome, { backgroundColor: colors.secondary + '12' }]}>
                    <Feather name="clock" size={15} color={colors.secondary} />
                    <Text style={[styles.hostParticipantOutcomeText, { color: colors.secondary }]}>
                      {waitlistPosition.get(item.id) ? `Waitlist position ${waitlistPosition.get(item.id)}` : 'Waiting for an open place'}
                    </Text>
                  </View>
                ) : item.status === 'verified' ? (
                  <View style={[styles.hostParticipantOutcome, { backgroundColor: colors.success + '12' }]}>
                    <Feather name="check-circle" size={15} color={colors.success} />
                    <Text style={[styles.hostParticipantOutcomeText, { color: colors.success }]}>Completion approved · XP ready to redeem</Text>
                  </View>
                ) : item.status === 'attended' ? (
                  <View style={[styles.hostParticipantOutcome, { backgroundColor: colors.success + '12' }]}>
                    <Feather name="check-circle" size={15} color={colors.success} />
                    <Text style={[styles.hostParticipantOutcomeText, { color: colors.success }]}>Attendance recorded</Text>
                  </View>
                ) : (
                  <View style={[styles.hostParticipantOutcome, { backgroundColor: colors.muted }]}>
                    <Feather name="info" size={15} color={colors.mutedForeground} />
                    <Text style={[styles.hostParticipantOutcomeText, { color: colors.mutedForeground }]}>Completion was rejected</Text>
                  </View>
                )}
              </View>
            );
          }) : (
            <EmptyState
              title="No matching people"
              body="Try another name or management filter."
              icon="search"
              actionLabel="Clear filters"
              onAction={() => { setParticipantSearch(''); setParticipantFilter('all'); }}
            />
          )}
        </>
      ) : null}
      <View style={{ height: 120 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

type CreateExperienceQuestion = {
  key: keyof ExperienceCreateInput;
  prompt: string;
  description: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
  optional?: boolean;
  kind?: 'category' | 'milestones';
  hint?: string;
};

type MilestoneDraft = {
  title: string;
  description: string;
  xpReward: string;
};

const createExperienceQuestions: CreateExperienceQuestion[] = [
  { key: 'organisationName', prompt: 'Who is hosting?', description: 'Participants will see this name on your experience.', label: 'Organisation name', placeholder: 'e.g. The Good Gym' },
  { key: 'organisationDescription', prompt: 'What does your organisation do?', description: 'A short introduction helps people understand who you are.', label: 'About your organisation', placeholder: 'A sentence or two about your community', multiline: true, optional: true },
  { key: 'title', prompt: 'What should participants call it?', description: 'Choose a clear, welcoming title for your experience.', label: 'Experience title', placeholder: 'e.g. Make a river wild again' },
  { key: 'description', prompt: 'What is the experience about?', description: 'Tell people what makes this worth showing up for.', label: 'Experience description', placeholder: 'Give your experience a warm, inviting introduction', multiline: true },
  { key: 'category', prompt: 'What kind of experience is it?', description: 'Choose the category that best fits what people will do.', label: 'Category', placeholder: '', kind: 'category' },
  { key: 'date', prompt: 'What day will it happen?', description: 'Choose the day, month and year in UK date order.', label: 'Date', placeholder: 'DD/MM/YYYY', hint: 'Drag a slider or use +/− to set each part.' },
  { key: 'startTime', prompt: 'What time does it start?', description: 'Use 24-hour time so the schedule is clear.', label: 'Start time', placeholder: '10:00', hint: 'For example, 09:30.' },
  { key: 'endTime', prompt: 'When will it finish?', description: 'Choose an end time that comes after the start time.', label: 'End time', placeholder: '13:00', hint: 'For example, 12:30.' },
  { key: 'city', prompt: 'What city is it in?', description: 'This helps people find experiences close to them.', label: 'City', placeholder: 'London' },
  { key: 'location', prompt: 'Where will everyone meet?', description: 'Add a venue, street, or landmark people can find.', label: 'Meeting point', placeholder: 'A clear place people can find' },
  { key: 'capacity', prompt: 'How many people can join?', description: 'Set the number of confirmed places available.', label: 'Places available', placeholder: '12', keyboardType: 'number-pad', hint: 'You can manage a waitlist if all places fill.' },
  { key: 'xpReward', prompt: 'How will you recognise participants?', description: 'Choose the XP reward people earn after their participation is verified.', label: 'XP reward', placeholder: '', hint: 'Slide to select the XP reward.' },
  { key: 'milestones', prompt: 'What milestones will participants complete?', description: 'Split the XP reward across clear steps. Each step is submitted by the participant and verified by you before its XP is released.', label: 'Experience milestones', placeholder: '', kind: 'milestones' },
  { key: 'monetaryRewardPence', prompt: 'Will you offer a cash reward?', description: 'This is optional. Enter the amount in pence.', label: 'Cash reward in pence', placeholder: '2000', keyboardType: 'number-pad', optional: true, hint: 'For example, enter 2000 for a £20 reward.' },
  { key: 'whatYouWillDo', prompt: 'What will participants do?', description: 'Help people picture the activity before they sign up.', label: 'What participants will do', placeholder: 'Walk, make, chat, discover…', multiline: true, optional: true },
  { key: 'whatToBring', prompt: 'What should people bring?', description: 'Share anything participants should have with them.', label: 'What to bring', placeholder: 'Comfortable shoes and a curious mind', multiline: true, optional: true },
];

const createExperienceReviewSections: Array<{ title: string; keys: Array<keyof ExperienceCreateInput> }> = [
  { title: 'Host', keys: ['organisationName', 'organisationDescription'] },
  { title: 'Experience', keys: ['title', 'description', 'category'] },
  { title: 'When', keys: ['date', 'startTime', 'endTime'] },
  { title: 'Where', keys: ['city', 'location'] },
  { title: 'Places and rewards', keys: ['capacity', 'xpReward', 'milestones', 'monetaryRewardPence'] },
  { title: 'What to expect', keys: ['whatYouWillDo', 'whatToBring'] },
];

function Create({
  go,
  initialStep = 1,
  editExperienceId,
}: {
  go: (screen: Screen, params?: Record<string, string>) => void;
  initialStep?: number;
  editExperienceId?: number;
}) {
  const colors = useColors();
  const { user } = useAuth();
  const validEditId = Number.isSafeInteger(editExperienceId) && (editExperienceId ?? 0) > 0;
  const id = validEditId ? editExperienceId! : 0;
  const experience = useGetExperience(id, {
    query: {
      queryKey: getGetExperienceQueryKey(id),
      enabled: validEditId && user?.userType === 'organisation',
    },
  });
  const milestones = useGetHostExperienceMilestones(id, {
    query: {
      queryKey: getGetHostExperienceMilestonesQueryKey(id),
      enabled: validEditId && user?.userType === 'organisation',
    },
  });

  if (!validEditId) {
    return <CreateExperienceForm go={go} initialStep={initialStep} />;
  }
  if (experience.isLoading || milestones.isLoading) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Edit experience" onBack={() => go('host')} /><LoadingState /></View>;
  }
  if (experience.isError || milestones.isError || !experience.data || !milestones.data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Edit experience" onBack={() => go('host-detail', { id: String(id) })} />
        <EmptyState
          title="Experience details couldn’t be loaded"
          body="Check your connection and try again. Only the organisation that owns this experience can edit it."
          actionLabel="Try again"
          onAction={() => { void Promise.all([experience.refetch(), milestones.refetch()]); }}
        />
      </View>
    );
  }
  if (!['published', 'full'].includes(experience.data.status)) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Edit experience" onBack={() => go('host-detail', { id: String(id) })} />
        <EmptyState
          title="This experience can’t be edited"
          body="Only active experiences can be changed."
          actionLabel="Back to experience"
          onAction={() => go('host-detail', { id: String(id) })}
        />
      </View>
    );
  }
  return (
    <CreateExperienceForm
      key={`edit-${id}`}
      go={go}
      initialStep={initialStep}
      editingExperienceId={id}
      initialExperience={experience.data}
      initialMilestones={milestones.data.milestones}
      milestonesEditable={milestones.data.milestonesEditable}
    />
  );
}

function CreateExperienceForm({
  go,
  initialStep = 1,
  editingExperienceId,
  initialExperience,
  initialMilestones = [],
  milestonesEditable = true,
}: {
  go: (screen: Screen, params?: Record<string, string>) => void;
  initialStep?: number;
  editingExperienceId?: number;
  initialExperience?: ExperienceDetail;
  initialMilestones?: Array<{ title: string; description: string | null; xpReward: number }>;
  milestonesEditable?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const create = useCreateExperience();
  const update = useUpdateHostExperience();
  const isEditing = editingExperienceId !== undefined;
  const inputStepCount = createExperienceQuestions.length;
  const totalSteps = inputStepCount + 1;
  const [step, setStep] = useState(() => Math.min(totalSteps, Math.max(1, initialStep)));
  const [publishError, setPublishError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [returnToReview, setReturnToReview] = useState(false);
  const [form, setForm] = useState<Partial<ExperienceCreateInput>>({
    organisationName: initialExperience?.organisation.name ?? user?.organisation?.name ?? '',
    organisationDescription: initialExperience?.organisation.description ?? user?.organisation?.description ?? '',
    title: initialExperience?.title,
    description: initialExperience?.description,
    category: initialExperience?.category ?? 'community',
    date: initialExperience?.date,
    startTime: initialExperience?.startTime,
    endTime: initialExperience?.endTime,
    location: initialExperience?.location,
    city: initialExperience?.city ?? user?.city ?? 'London',
    capacity: initialExperience?.capacity ?? 12,
    xpReward: initialExperience?.xpReward ?? 150,
    monetaryRewardPence: initialExperience?.monetaryRewardPence ?? null,
    whatToBring: initialExperience?.whatToBring ?? null,
    whatYouWillDo: initialExperience?.whatYouWillDo ?? null,
  });
  const [milestoneDrafts, setMilestoneDrafts] = useState<MilestoneDraft[]>(() => initialMilestones.length
    ? initialMilestones.map((milestone) => ({
        title: milestone.title,
        description: milestone.description ?? '',
        xpReward: String(milestone.xpReward),
      }))
    : isEditing
      ? []
      : [{ title: '', description: '', xpReward: '150' }]);

  const set = (key: Exclude<keyof ExperienceCreateInput, 'milestones'>, value: string | number | null) => {
    const numeric = key === 'capacity' || key === 'xpReward' || key === 'monetaryRewardPence';
    const nextValue = numeric ? (value === '' || value === null ? null : Number(value)) : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
    setInputError(null);
    setPublishError(null);
  };
  const updateMilestoneDraft = (index: number, field: keyof MilestoneDraft, value: string) => {
    setMilestoneDrafts((current) => current.map((milestone, itemIndex) => (
      itemIndex === index ? { ...milestone, [field]: value } : milestone
    )));
    setInputError(null);
    setPublishError(null);
  };
  const addMilestoneDraft = () => {
    setMilestoneDrafts((current) => current.length >= 12
      ? current
      : [...current, { title: '', description: '', xpReward: '0' }]);
    setInputError(null);
  };

  useEffect(() => {
    Keyboard.dismiss();
  }, [step]);

  const isValidDateValue = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  const isValidTimeValue = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  const timeInMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const validateQuestion = (question: CreateExperienceQuestion) => {
    if (question.key === 'milestones') {
      if (milestoneDrafts.length === 0 && isEditing && initialMilestones.length === 0) {
        return null;
      }
      if (milestoneDrafts.length < 1 || milestoneDrafts.length > 12) {
        return 'Add between 1 and 12 milestones.';
      }
      for (const [index, milestone] of milestoneDrafts.entries()) {
        if (!milestone.title.trim()) return `Add a title for milestone ${index + 1}.`;
        if (!Number.isInteger(Number(milestone.xpReward)) || Number(milestone.xpReward) < 0) {
          return `Enter a whole-number XP reward for milestone ${index + 1}.`;
        }
      }
      const allocatedXp = milestoneDrafts.reduce((sum, milestone) => sum + Number(milestone.xpReward), 0);
      return allocatedXp === Number(form.xpReward)
        ? null
        : `Milestone rewards total ${allocatedXp} XP. Make them add up to ${form.xpReward ?? 0} XP.`;
    }
    const value = form[question.key];
    const text = typeof value === 'string' ? value.trim() : '';
    const empty = value == null || (typeof value === 'string' && !text);
    if (question.optional && empty) return null;

    if (question.key === 'category') return value ? null : 'Choose a category to continue.';
    if (question.key === 'date') return isValidDateValue(text) ? null : 'Choose a real date using the day, month and year sliders.';
    if (question.key === 'startTime') return isValidTimeValue(text) ? null : 'Enter a time in 24-hour HH:MM format.';
    if (question.key === 'endTime') {
      if (!isValidTimeValue(text)) return 'Enter a time in 24-hour HH:MM format.';
      const startTime = form.startTime?.trim() ?? '';
      return isValidTimeValue(startTime) && timeInMinutes(text) > timeInMinutes(startTime)
        ? null
        : 'Choose an end time after the start time.';
    }
    if (question.key === 'capacity') {
      return Number.isInteger(Number(value)) && Number(value) >= 1
        ? null
        : 'Enter a whole number of places, at least 1.';
    }
    if (question.key === 'xpReward') {
      return value != null
        && Number.isInteger(Number(value))
        && Number(value) >= 0
        && Number(value) <= 1000
        ? null
        : 'Choose a whole-number XP reward from 0 to 1,000.';
    }
    if (question.key === 'monetaryRewardPence') {
      return value == null || (Number.isInteger(Number(value)) && Number(value) >= 0)
        ? null
        : 'Enter a whole number of pence.';
    }
    return text ? null : `${question.label} is required.`;
  };
  const valid = createExperienceQuestions.every((question) => validateQuestion(question) === null);
  const activeQuestion = step <= inputStepCount ? createExperienceQuestions[step - 1] : undefined;

  const goToStep = (nextStep: number) => {
    Keyboard.dismiss();
    triggerHaptic();
    setInputError(null);
    setPublishError(null);
    setStep(nextStep);
  };

  const continueToNextStep = () => {
    if (step <= inputStepCount) {
      const question = createExperienceQuestions[step - 1];
      const error = question ? validateQuestion(question) : 'This step is unavailable.';
      if (error) {
        setInputError(error);
        triggerHaptic();
        return;
      }
    }
    const nextStep = returnToReview ? totalSteps : Math.min(totalSteps, step + 1);
    setReturnToReview(false);
    goToStep(nextStep);
  };

  const publish = async () => {
    triggerHaptic();
    if (!valid || create.isPending || update.isPending) return;
    setPublishError(null);
    if (!user) {
      setPublishError(isEditing ? 'Sign in to save these changes.' : 'Open Experiences.fun from Telegram to publish an experience.');
      return;
    }
    try {
      const data: ExperienceCreateInput = {
        organisationName: form.organisationName!.trim(),
        organisationDescription: form.organisationDescription?.trim() || null,
        title: form.title!.trim(),
        description: form.description!.trim(),
        category: form.category!,
        date: form.date!.trim(),
        startTime: form.startTime!.trim(),
        endTime: form.endTime!.trim(),
        location: form.location!.trim(),
        city: form.city!.trim(),
        capacity: Number(form.capacity),
        xpReward: Number(form.xpReward),
        monetaryRewardPence: form.monetaryRewardPence == null ? null : Number(form.monetaryRewardPence),
        whatToBring: form.whatToBring?.trim() || null,
        whatYouWillDo: form.whatYouWillDo?.trim() || null,
        ...(milestoneDrafts.length > 0
          ? {
              milestones: milestoneDrafts.map((milestone) => ({
                title: milestone.title.trim(),
                description: milestone.description.trim() || null,
                xpReward: Number(milestone.xpReward),
              })),
            }
          : {}),
      };
      const savedExperience = isEditing
        ? await update.mutateAsync({ experienceId: editingExperienceId, data })
        : await create.mutateAsync({ data });
      if (!isEditing) {
        const hostExperiencesQueryKey = getListHostExperiencesQueryKey();
        const cachedExperiences = queryClient.getQueryData<Experience[]>(hostExperiencesQueryKey);
        if (cachedExperiences) {
          queryClient.setQueryData<Experience[]>(hostExperiencesQueryKey, [
            savedExperience,
            ...cachedExperiences.filter((experience) => experience.id !== savedExperience.id),
          ]);
        }
      } else {
        queryClient.setQueryData<Experience[]>(
          getListHostExperiencesQueryKey(),
          (current) => current?.map((experience) => experience.id === savedExperience.id
            ? {
                ...savedExperience,
                waitlistCount: 'waitlistCount' in experience && typeof experience.waitlistCount === 'number' ? experience.waitlistCount : 0,
              }
            : experience),
        );
      }
      void queryClient.invalidateQueries({ queryKey: getListHostExperiencesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetHostOverviewQueryKey() });
      if (isEditing) {
        void queryClient.invalidateQueries({ queryKey: getGetExperienceQueryKey(savedExperience.id) });
        void queryClient.invalidateQueries({ queryKey: getGetHostExperienceMilestonesQueryKey(savedExperience.id) });
      }
      go('host-detail', { id: String(savedExperience.id) });
    } catch (publishRequestError: unknown) {
      const responseMessage = (publishRequestError as { data?: { message?: string } })?.data?.message;
      setPublishError(responseMessage ?? (isEditing
        ? 'We couldn’t save these changes. Your edits are still here—please try again.'
        : 'We couldn’t publish this experience. Please try again.'));
    }
  };

  const field = (key: Exclude<keyof ExperienceCreateInput, 'milestones'>, label: string, placeholder: string, multiline = false, keyboardType: 'default' | 'number-pad' = 'default') => (
    <View style={styles.createField}>
      <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={`create-field-${key}`}
        value={form[key] == null ? '' : String(form[key])}
        onChangeText={(value) => set(key, value)}
        onSubmitEditing={multiline ? undefined : continueToNextStep}
        returnKeyType={multiline ? 'default' : 'done'}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          styles.createInput,
          multiline && styles.createTextArea,
          { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius - 8 },
        ]}
      />
    </View>
  );

  const reviewValue = (key: keyof ExperienceCreateInput) => {
    if (key === 'milestones') {
      const total = milestoneDrafts.reduce((sum, milestone) => sum + (Number(milestone.xpReward) || 0), 0);
      return `${milestoneDrafts.length} ${milestoneDrafts.length === 1 ? 'milestone' : 'milestones'} · ${total} XP allocated`;
    }
    const value = form[key];
    if (value == null || value === '') return 'Not added';
    if (key === 'category') return categoryLabel[value as ExperienceCategory];
    if (key === 'date') return formatExperienceDateUk(String(value));
    if (key === 'capacity') return `${value} places`;
    if (key === 'xpReward') return `${value} XP`;
    if (key === 'monetaryRewardPence') return Number(value) > 0 ? money(Number(value)) ?? `${value}p` : 'No cash reward';
    return String(value);
  };
  const milestoneXpTotal = milestoneDrafts.reduce(
    (sum, milestone) => sum + (Number(milestone.xpReward) || 0),
    0,
  );

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.createContent,
        { flexGrow: 1, paddingTop: 12, paddingBottom: insets.bottom + 40 },
      ]}
      testID="create-experience-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      bottomOffset={72}
      showsVerticalScrollIndicator={false}
    >
        <View style={styles.createTopBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={returnToReview ? 'Back to overview' : step === 1 ? (isEditing ? 'Close edit experience' : 'Close create experience') : 'Previous step'}
            onPress={() => {
              if (returnToReview) {
                setReturnToReview(false);
                goToStep(totalSteps);
              } else if (step > 1) goToStep(step - 1);
              else { Keyboard.dismiss(); triggerHaptic(); go(isEditing ? 'host-detail' : 'host', isEditing ? { id: String(editingExperienceId) } : undefined); }
            }}
            style={[styles.createRoundButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
          >
            <Feather name={step === 1 ? 'x' : 'arrow-left'} size={22} color={colors.foreground} />
          </Pressable>
          <View
            accessibilityLabel={step <= inputStepCount ? `Question ${step} of ${inputStepCount}` : 'Review experience details'}
            style={[styles.createProgressTrack, { backgroundColor: colors.muted }]}
          >
            <View style={[styles.createProgressFill, { width: `${Math.round((step / totalSteps) * 100)}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.createStepCount, { color: colors.mutedForeground }]}>{step <= inputStepCount ? `${step}/${inputStepCount}` : 'Review'}</Text>
        </View>

        <View style={styles.createHeading}>
          <Text style={[styles.createEyebrow, { color: colors.primary }]}>
            {step === totalSteps ? (isEditing ? 'REVIEW CHANGES' : 'FINAL CHECK') : returnToReview ? 'EDIT DETAIL' : isEditing ? 'EDIT EXPERIENCE' : 'CREATE EXPERIENCE'}
          </Text>
          <Text
            testID={step === totalSteps ? 'create-review-heading' : 'create-question-heading'}
            style={[styles.createTitle, { color: colors.foreground }]}
          >
            {activeQuestion?.prompt ?? 'Review your experience'}
          </Text>
          <Text style={[styles.createDescription, { color: colors.mutedForeground }]}>
            {activeQuestion?.description ?? (isEditing
              ? 'Check the changes below. Tap any row to make an edit before saving.'
              : 'Check the details below. Tap any row to make an edit before publishing.')}
          </Text>
        </View>

        {!user ? <TelegramConnectCard /> : null}

        <View style={styles.createFields}>
          {activeQuestion ? (
            <>
              {activeQuestion.key === 'organisationName' ? (
                <View style={[styles.createTip, { backgroundColor: colors.secondary + '15' }]}>
                  <Feather name="star" size={20} color={colors.secondary} />
                  <Text style={[styles.createTipText, { color: colors.secondary }]}>
                    <Text style={styles.createTipStrong}>People join people.</Text> Tell participants who is behind this experience.
                  </Text>
                </View>
              ) : null}
              {activeQuestion.kind === 'category' ? (
                <View style={styles.createCategoryGrid}>
                  {categories.slice(1).map((item) => {
                    const selected = form.category === item.key;
                    const tint = item.key === 'environmental' ? colors.teal + '15' : item.key === 'community' ? colors.primary + '15' : colors.secondary + '15';
                    const iconColor = item.key === 'environmental' ? colors.teal : item.key === 'community' ? colors.primary : colors.secondary;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Choose ${item.label} category`}
                        testID={`create-category-${item.key}`}
                        onPress={() => { triggerHaptic(); set('category', item.key); }}
                        style={[
                          styles.createCategory,
                          {
                            backgroundColor: colors.card,
                            borderColor: selected ? iconColor : colors.border,
                            borderRadius: colors.radius - 8,
                          },
                        ]}
                      >
                        <View style={[styles.createCategoryIcon, { backgroundColor: tint }]}>
                          <Feather name={item.icon} size={22} color={selected ? iconColor : colors.mutedForeground} />
                        </View>
                        <Text style={[styles.createCategoryText, { color: selected ? iconColor : colors.mutedForeground }]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : activeQuestion.kind === 'milestones' ? (
                <View style={{ gap: 12 }}>
                  <View style={[styles.createTip, { backgroundColor: colors.primary + '0D' }]}>
                    <Feather name="award" size={19} color={colors.primary} />
                    <Text style={[styles.createTipText, { color: colors.foreground }]}>
                      Participants submit each step separately. You verify it before its XP becomes available to redeem.
                    </Text>
                  </View>
                  {isEditing && !milestonesEditable ? (
                    <View style={[styles.createTip, { backgroundColor: colors.secondary + '15' }]}>
                      <Feather name="lock" size={17} color={colors.secondary} />
                      <Text style={[styles.createTipText, { color: colors.foreground }]}>
                        Milestone steps are locked because a participant has submitted one. You can still edit the other experience details.
                      </Text>
                    </View>
                  ) : isEditing && initialMilestones.length === 0 && milestoneDrafts.length === 0 ? (
                    <View style={[styles.createTip, { backgroundColor: colors.muted }]}>
                      <Feather name="info" size={17} color={colors.primary} />
                      <Text style={[styles.createTipText, { color: colors.foreground }]}>
                        This experience uses one completion submission and has no milestones. Leave the list empty to keep it that way, or add steps if you want milestone tracking.
                      </Text>
                    </View>
                  ) : null}
                  {milestoneDrafts.map((milestone, index) => (
                    <View
                      key={`milestone-${index}`}
                      testID={`create-milestone-${index + 1}`}
                      style={{
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderRadius: colors.radius,
                        borderWidth: 1,
                        gap: 10,
                        padding: 14,
                      }}
                    >
                      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 }}>
                          MILESTONE {index + 1}
                        </Text>
                        {milestoneDrafts.length > 1 && milestonesEditable ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove milestone ${index + 1}`}
                            testID={`create-milestone-remove-${index + 1}`}
                            onPress={() => {
                              setMilestoneDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
                              setInputError(null);
                            }}
                            hitSlop={8}
                            style={{ padding: 4 }}
                          >
                            <Feather name="trash-2" size={16} color={colors.destructive} />
                          </Pressable>
                        ) : null}
                      </View>
                      <View style={styles.createField}>
                        <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>TITLE</Text>
                        <TextInput
                          accessibilityLabel={`Milestone ${index + 1} title`}
                          testID={`create-milestone-title-${index + 1}`}
                          value={milestone.title}
                          onChangeText={(value) => updateMilestoneDraft(index, 'title', value)}
                          editable={milestonesEditable}
                          placeholder="e.g. Complete the community garden"
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.createInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius - 8 }]}
                        />
                      </View>
                      <View style={styles.createField}>
                        <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>DETAILS · OPTIONAL</Text>
                        <TextInput
                          accessibilityLabel={`Milestone ${index + 1} details`}
                          testID={`create-milestone-description-${index + 1}`}
                          value={milestone.description}
                          onChangeText={(value) => updateMilestoneDraft(index, 'description', value)}
                          editable={milestonesEditable}
                          placeholder="Explain what counts as complete"
                          placeholderTextColor={colors.mutedForeground}
                          multiline
                          style={[styles.createInput, styles.createTextArea, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius - 8 }]}
                        />
                      </View>
                      <View style={styles.createField}>
                        <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>XP FOR THIS MILESTONE</Text>
                        <TextInput
                          accessibilityLabel={`Milestone ${index + 1} XP reward`}
                          testID={`create-milestone-xp-${index + 1}`}
                          value={milestone.xpReward}
                          onChangeText={(value) => updateMilestoneDraft(index, 'xpReward', value)}
                          editable={milestonesEditable}
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="number-pad"
                          style={[styles.createInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius - 8 }]}
                        />
                      </View>
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: milestoneDrafts.length >= 12 || !milestonesEditable }}
                    accessibilityLabel={milestonesEditable ? 'Add a milestone' : 'Milestones are locked'}
                    testID="create-milestone-add"
                    disabled={milestoneDrafts.length >= 12 || !milestonesEditable}
                    onPress={() => { triggerHaptic(); addMilestoneDraft(); }}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      backgroundColor: colors.card,
                      borderColor: colors.primary,
                      borderRadius: colors.radius - 8,
                      borderStyle: 'dashed',
                      borderWidth: 1,
                      flexDirection: 'row',
                      gap: 8,
                      justifyContent: 'center',
                      opacity: milestoneDrafts.length >= 12 || !milestonesEditable ? 0.5 : pressed ? 0.75 : 1,
                      paddingVertical: 13,
                    })}
                  >
                    <Feather name="plus" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                      {!milestonesEditable
                        ? 'Milestones are locked'
                        : milestoneDrafts.length >= 12
                          ? 'Maximum of 12 milestones'
                          : 'Add another milestone'}
                    </Text>
                  </Pressable>
                  <View style={[styles.createTip, { backgroundColor: colors.muted }]}>
                    <Feather name="zap" size={17} color={colors.secondary} />
                    <Text style={[styles.createTipText, { color: colors.foreground }]}>
                      XP allocated: {milestoneXpTotal} / {Number(form.xpReward ?? 0)} XP
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  {activeQuestion.key === 'xpReward' ? (
                    <ExperienceXpSlider
                      value={Number(form.xpReward ?? 0)}
                      onChange={(value) => set('xpReward', value)}
                    />
                  ) : activeQuestion.key === 'date' ? (
                    <View style={styles.createField}>
                      <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>DATE</Text>
                      <DateSliderPicker
                        value={form.date ?? ''}
                        onChange={(value) => set('date', value)}
                      />
                    </View>
                  ) : field(activeQuestion.key as Exclude<keyof ExperienceCreateInput, 'milestones'>, activeQuestion.label, activeQuestion.placeholder, activeQuestion.multiline, activeQuestion.keyboardType)}
                  {activeQuestion.optional ? (
                    <Text style={[styles.createOptionalNote, { color: colors.mutedForeground }]}>Optional · leave this blank if it doesn’t apply.</Text>
                  ) : null}
                  {activeQuestion.hint ? (
                    <Text style={[styles.createHint, { color: colors.mutedForeground }]}>{activeQuestion.hint}</Text>
                  ) : null}
                </>
              )}
              {inputError ? <Text accessibilityRole="alert" style={[styles.createError, { color: colors.destructive }]}>{inputError}</Text> : null}
            </>
          ) : (
            <View style={styles.createReviewList}>
              {createExperienceReviewSections.map((section) => (
                <View key={section.title} style={[styles.createReviewCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={[styles.createReviewSectionTitle, { color: colors.mutedForeground }]}>{section.title.toUpperCase()}</Text>
                  {section.keys.map((key) => {
                    const question = createExperienceQuestions.find((item) => item.key === key);
                    if (!question) return null;
                    const questionStep = createExperienceQuestions.findIndex((item) => item.key === key) + 1;
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${question.label}: ${reviewValue(key)}`}
                        accessibilityHint="Opens this detail so you can change it."
                        testID={`create-review-${key}`}
                        onPress={() => {
                          setReturnToReview(true);
                          goToStep(questionStep);
                        }}
                        style={({ pressed }) => [styles.createReviewRow, pressed && { opacity: 0.65 }]}
                      >
                        <View style={styles.createReviewCopy}>
                          <Text style={[styles.createReviewLabel, { color: colors.mutedForeground }]}>
                            {question.label}{question.optional ? ' · optional' : ''}
                          </Text>
                          <Text numberOfLines={2} style={[styles.createReviewValue, { color: colors.foreground }]}>{reviewValue(key)}</Text>
                        </View>
                        <Feather name="edit-2" size={16} color={colors.primary} />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>

        {(publishError || create.isError || update.isError) && (
          <Text accessibilityRole="alert" style={[styles.createError, { color: colors.destructive }]}>
            {publishError ?? (isEditing
              ? 'We couldn’t save these changes. Please try again.'
              : 'We couldn’t publish this experience. Please try again.')}
          </Text>
        )}

        <View style={styles.createActions}>
          <Pressable
            accessibilityRole="button"
            testID="create-primary"
            accessibilityState={{ disabled: create.isPending || update.isPending || (step === totalSteps && !valid) }}
            disabled={create.isPending || update.isPending || (step === totalSteps && !valid)}
            onPress={() => {
              Keyboard.dismiss();
              if (step === totalSteps) void publish();
              else continueToNextStep();
            }}
            style={({ pressed }) => [
              styles.createPrimary,
              { backgroundColor: (step !== totalSteps || valid) && !create.isPending && !update.isPending ? colors.primary : colors.muted, borderRadius: colors.radius - 8 },
              pressed && (step !== totalSteps || valid) && !create.isPending && !update.isPending && styles.createPrimaryPressed,
            ]}
          >
            {create.isPending || update.isPending
              ? <ActivityIndicator color={colors.primaryForeground} />
              : (
                <>
                  <Text style={[styles.createPrimaryText, { color: (step !== totalSteps || valid) ? colors.primaryForeground : colors.mutedForeground }]}>
                    {step === totalSteps
                      ? isEditing ? 'Save changes' : 'Publish experience'
                      : returnToReview ? 'Save changes' : step === inputStepCount ? 'Review details' : 'Continue'}
                  </Text>
                  <Feather name={step === totalSteps ? isEditing ? 'save' : 'send' : returnToReview ? 'check' : 'arrow-right'} size={20} color={(step !== totalSteps || valid) ? colors.primaryForeground : colors.mutedForeground} />
                </>
              )}
          </Pressable>
        </View>
        <Text style={[styles.createFooterNote, { color: colors.mutedForeground }]}>
          {step === totalSteps
            ? isEditing ? 'Your changes are saved when you tap Save changes.' : 'Nothing is published until you tap Publish experience.'
            : returnToReview
              ? 'Save this answer to return to your overview.'
            : activeQuestion?.optional
              ? 'This detail is optional. You can review everything before publishing.'
              : 'You can review and edit every detail before publishing.'}
        </Text>
    </KeyboardAwareScrollViewCompat>
  );
}

function BottomNav({
  active,
  go,
  userType,
  onQuickAction,
}: {
  active: Screen;
  go: (screen: Screen) => void;
  userType: UserType;
  onQuickAction: (action: BottomNavQuickAction) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useMotionPreferences();
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const liquidGlassAvailable =
    Platform.OS === 'ios' &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  const items: Array<{ key: Screen; label: string; icon: IconName }> = userType === 'organisation'
    ? [
        { key: 'home', label: 'Home', icon: 'home' },
        { key: 'explore', label: 'Explore', icon: 'compass' },
        { key: 'host', label: 'Host', icon: 'briefcase' },
        { key: 'profile', label: 'Organisation', icon: 'user' },
      ]
    : [
        { key: 'home', label: 'Home', icon: 'home' },
        { key: 'explore', label: 'Explore', icon: 'compass' },
        { key: 'activity', label: 'Activity', icon: 'activity' },
        { key: 'profile', label: 'Profile', icon: 'user' },
      ];
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const selectionProgressRef = useRef<Partial<Record<Screen, Animated.Value>>>({});
  const navBarRef = useRef<View>(null);
  const navWidthRef = useRef(0);
  const navLeftRef = useRef(0);
  const itemLayoutsRef = useRef<Partial<Record<Screen, { x: number; width: number }>>>({});
  const dragOriginXRef = useRef<number | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const pointerStartYRef = useRef<number | null>(null);
  const slideClaimedRef = useRef(false);
  const suppressTapUntilRef = useRef(0);
  const itemsRef = useRef(items);
  const activeRef = useRef(active);
  const goRef = useRef(go);
  itemsRef.current = items;
  activeRef.current = active;
  goRef.current = go;

  const activeIndex = Math.max(0, items.findIndex((item) => item.key === active));
  items.forEach((item) => {
    if (!selectionProgressRef.current[item.key]) {
      selectionProgressRef.current[item.key] = new Animated.Value(item.key === active ? 1 : 0);
    }
  });
  const selectionKey = items[dragIndex ?? activeIndex]?.key ?? active;
  useEffect(() => {
    Object.entries(selectionProgressRef.current).forEach(([key, progress]) => {
      if (!progress) return;
      progress.stopAnimation();
      if (reduceMotion) {
        progress.setValue(key === selectionKey ? 1 : 0);
        return;
      }
      Animated.timing(progress, {
        toValue: key === selectionKey ? 1 : 0,
        duration: 140,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [reduceMotion, selectionKey, userType]);

  const getItemIndexAtX = (x: number) => {
    const currentItems = itemsRef.current;
    const fallbackWidth = navWidthRef.current / Math.max(currentItems.length, 1);
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    currentItems.forEach((item, index) => {
      const layout = itemLayoutsRef.current[item.key];
      const left = layout?.x ?? index * fallbackWidth;
      const right = left + (layout?.width ?? fallbackWidth);
      const distance = x < left ? left - x : x > right ? x - right : 0;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  };
  const clearDrag = () => {
    dragOriginXRef.current = null;
    dragStartIndexRef.current = null;
    dragIndexRef.current = null;
    setDragIndex(null);
  };
  const beginWebSlide = (pageX: number, pageY: number) => {
    const originX = pageX - navLeftRef.current;
    dragOriginXRef.current = originX;
    dragStartIndexRef.current = getItemIndexAtX(originX);
    dragIndexRef.current = dragStartIndexRef.current;
    pointerStartXRef.current = pageX;
    pointerStartYRef.current = pageY;
    slideClaimedRef.current = false;
  };
  const moveWebSlide = (
    pageX: number,
    pageY: number,
    event: { preventDefault: () => void },
  ) => {
    if (pointerStartXRef.current === null || pointerStartYRef.current === null) return;

    const dx = pageX - pointerStartXRef.current;
    const dy = pageY - pointerStartYRef.current;
    if (!slideClaimedRef.current) {
      if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      slideClaimedRef.current = true;
      setDragIndex(dragStartIndexRef.current);
    }

    if (dragOriginXRef.current !== null) {
      const nextIndex = getItemIndexAtX(dragOriginXRef.current + dx);
      if (nextIndex !== dragIndexRef.current) {
        dragIndexRef.current = nextIndex;
        setDragIndex(nextIndex);
      }
    }
    event.preventDefault();
  };
  const finishWebSlide = (pageX?: number, pageY?: number) => {
    if (pageX !== undefined && pageY !== undefined) {
      moveWebSlide(pageX, pageY, { preventDefault: () => {} });
    }
    const didSlide = slideClaimedRef.current;
    const destination = itemsRef.current[dragIndexRef.current ?? -1];
    if (didSlide) suppressTapUntilRef.current = Date.now() + 350;
    pointerStartXRef.current = null;
    pointerStartYRef.current = null;
    slideClaimedRef.current = false;
    clearDrag();
    if (didSlide && destination && destination.key !== activeRef.current) {
      triggerHaptic();
      goRef.current(destination.key);
    }
  };
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      dragOriginXRef.current !== null
      && Math.abs(gesture.dx) > 8
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
    onPanResponderGrant: () => {
      slideClaimedRef.current = true;
      const startIndex = dragStartIndexRef.current
        ?? Math.max(0, itemsRef.current.findIndex((item) => item.key === activeRef.current));
      dragIndexRef.current = startIndex;
      setDragIndex(startIndex);
    },
    onPanResponderMove: (_event, gesture) => {
      if (dragOriginXRef.current === null) return;
      const nextIndex = getItemIndexAtX(dragOriginXRef.current + gesture.dx);
      if (nextIndex !== dragIndexRef.current) {
        dragIndexRef.current = nextIndex;
        setDragIndex(nextIndex);
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (dragOriginXRef.current !== null) {
        dragIndexRef.current = getItemIndexAtX(dragOriginXRef.current + gesture.dx);
      }
      const destination = itemsRef.current[dragIndexRef.current ?? -1];
      suppressTapUntilRef.current = Date.now() + 350;
      slideClaimedRef.current = false;
      clearDrag();
      if (destination && destination.key !== activeRef.current) {
        triggerHaptic();
        goRef.current(destination.key);
      }
    },
    onPanResponderTerminate: () => {
      slideClaimedRef.current = false;
      clearDrag();
    },
  })).current;

  const quickActions: Array<{
    id: BottomNavQuickAction;
    label: string;
    description: string;
    icon: IconName;
  }> = [
    ...(userType === 'participant'
      ? [
          {
            id: 'assistant' as const,
            label: 'Assistant',
            description: 'Find local experiences and plan what to do next.',
            icon: 'message-square' as const,
          },
          {
            id: 'challenges' as const,
            label: 'Challenges',
            description: 'Invite an accepted friend to an experience.',
            icon: 'users' as const,
          },
        ]
      : []),
    {
      id: 'post',
      label: 'Post to feed',
      description: 'Share an update with your community.',
      icon: 'edit-3',
    },
    ...(userType === 'organisation'
      ? [{
          id: 'create' as const,
          label: 'Create an experience',
          description: 'Set up a new community experience.',
          icon: 'calendar' as const,
        }]
      : []),
    {
      id: 'progress',
      label: 'View progress',
      description: 'See your activity and contribution history.',
      icon: 'trending-up',
    },
  ];

  return (
    <View
      style={[
        styles.bottomNavDock,
        { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 10) },
      ]}
    >
      <View
        testID="bottom-nav-tabs"
        style={[
          styles.bottomNav,
          {
            backgroundColor: colors.primary,
            borderColor: `${colors.primaryForeground}55`,
            shadowColor: colors.primary,
          },
        ]}
        ref={navBarRef}
        onLayout={(event) => {
          navWidthRef.current = event.nativeEvent.layout.width;
          navBarRef.current?.measureInWindow((x) => { navLeftRef.current = x; });
        }}
        onTouchStart={Platform.OS === 'web' ? (event) => {
          const touch = event.nativeEvent.touches[0];
          if (touch) beginWebSlide(touch.pageX, touch.pageY);
        } : undefined}
        onTouchMove={Platform.OS === 'web' ? (event) => {
          const touch = event.nativeEvent.touches[0];
          if (touch) moveWebSlide(touch.pageX, touch.pageY, event);
        } : undefined}
        onTouchEnd={Platform.OS === 'web' ? (event) => {
          const touch = event.nativeEvent.changedTouches[0];
          finishWebSlide(touch?.pageX, touch?.pageY);
        } : undefined}
        onTouchCancel={Platform.OS === 'web' ? () => {
          pointerStartXRef.current = null;
          pointerStartYRef.current = null;
          slideClaimedRef.current = false;
          clearDrag();
        } : undefined}
        {...(Platform.OS === 'web' ? {} : panResponder.panHandlers)}
      >
        {items.map((item, index) => {
          const selected = (dragIndex ?? activeIndex) === index;
          const selectionProgress = selectionProgressRef.current[item.key]!;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint="Press and slide across the bar to switch sections."
              accessibilityState={{ selected: active === item.key }}
              testID={`bottom-nav-tab-${item.key}`}
              key={item.key}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                itemLayoutsRef.current[item.key] = { x, width };
              }}
              onPressIn={(event) => {
                const layout = itemLayoutsRef.current[item.key];
                const pageX = event.nativeEvent.pageX;
                const touchX = event.nativeEvent.locationX;
                dragOriginXRef.current = Number.isFinite(pageX)
                  ? pageX - navLeftRef.current
                  : layout
                    ? layout.x + Math.max(0, Math.min(touchX, layout.width))
                    : navWidthRef.current * ((index + 0.5) / items.length);
                dragStartIndexRef.current = index;
                dragIndexRef.current = index;
              }}
              onLongPress={Platform.OS === 'web' ? undefined : () => {
                dragStartIndexRef.current = index;
                dragIndexRef.current = index;
                setDragIndex(index);
              }}
              delayLongPress={350}
              onPress={() => {
                if (slideClaimedRef.current || Date.now() < suppressTapUntilRef.current) return;
                clearDrag();
                triggerHaptic();
                go(item.key);
              }}
              style={({ pressed }) => [
                styles.navItem,
                pressed && styles.navItemPressed,
              ]}
            >
              <View style={styles.navIconWrapper}>
                {selected ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      styles.navGlassSurface,
                      {
                        opacity: selectionProgress,
                        transform: [{
                          scale: selectionProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.94, 1],
                          }),
                        }],
                      },
                    ]}
                  >
                    {liquidGlassAvailable
                      ? (
                        <GlassView
                          pointerEvents="none"
                          glassEffectStyle="regular"
                          tintColor={colors.primary}
                          style={StyleSheet.absoluteFill}
                        />
                      )
                      : (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            styles.navGlassFallback,
                            {
                              backgroundColor: `${colors.primaryForeground}24`,
                              borderColor: `${colors.primaryForeground}88`,
                            },
                          ]}
                        />
                      )}
                  </Animated.View>
                ) : null}
                <Feather
                  name={item.icon}
                  size={19}
                  color={colors.primaryForeground}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.navLabel,
                  { color: colors.primaryForeground },
                  selected && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        accessibilityHint={userType === 'participant'
          ? 'Open Assistant, Challenges, feed posting, and progress actions.'
          : 'Post to the feed, create an experience, or view progress.'}
        accessibilityState={{ expanded: quickActionsOpen }}
        testID="bottom-nav-quick-button"
        onPress={() => {
          triggerHaptic();
          setQuickActionsOpen(true);
        }}
        style={({ pressed }) => [
          styles.bottomNavQuickButton,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.primary,
          },
          pressed && styles.bottomNavQuickButtonPressed,
        ]}
      >
        <Feather name="plus" size={25} color={colors.primary} />
      </MotionPressable>
      <Modal
        visible={quickActionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickActionsOpen(false)}
      >
        <View style={styles.quickActionsModal}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close quick actions"
            testID="bottom-nav-quick-actions-dismiss"
            onPress={() => setQuickActionsOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground + '78' }]}
          />
          <View
            style={[
              styles.quickActionsSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderTopLeftRadius: colors.radius + 8,
                borderTopRightRadius: colors.radius + 8,
                paddingBottom: 16 + insets.bottom,
              },
            ]}
          >
            <View style={[styles.quickActionsHandle, { backgroundColor: colors.border }]} />
            <View style={styles.quickActionsHeader}>
              <View>
                <Text style={[styles.quickActionsTitle, { color: colors.foreground }]}>Quick actions</Text>
                <Text style={[styles.quickActionsSubtitle, { color: colors.mutedForeground }]}>
                  Choose what you want to do next.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close quick actions"
                onPress={() => setQuickActionsOpen(false)}
                hitSlop={8}
                style={styles.quickActionsClose}
              >
                <Feather name="x" size={21} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.quickActionsList}>
              {quickActions.map((action) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityHint={action.description}
                  key={action.id}
                  testID={`bottom-nav-action-${action.id}`}
                  onPress={() => {
                    setQuickActionsOpen(false);
                    triggerHaptic();
                    onQuickAction(action.id);
                  }}
                  style={({ pressed }) => [
                    styles.quickActionRow,
                    {
                      backgroundColor: pressed ? colors.muted : 'transparent',
                      borderColor: colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: colors.primary + '14' }]}>
                    <Feather name={action.icon} size={19} color={colors.primary} />
                  </View>
                  <View style={styles.quickActionCopy}>
                    <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>{action.label}</Text>
                    <Text style={[styles.quickActionDescription, { color: colors.mutedForeground }]}>
                      {action.description}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FeedbackBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === 'web' ? 8 : insets.top + 8;

  const openTelegramFeedback = () => {
    triggerHaptic();
    void Linking.openURL('https://t.me/NALIDidThat').catch((error: unknown) => {
      console.warn('Unable to open Telegram feedback link', error);
      Alert.alert('Could not open Telegram', 'Try opening t.me/NALIDidThat in your browser.');
    });
  };

  return (
    <View style={[styles.feedbackBanner, { backgroundColor: colors.primary, paddingTop }]}>
      <Text style={[styles.feedbackBannerText, { color: colors.primaryForeground }]}>
        {"You're early!🥳 Please give feedback to "}
        <Text
          accessibilityRole="link"
          accessibilityLabel="Open Telegram feedback chat for @NALIDidThat"
          onPress={openTelegramFeedback}
          style={[styles.feedbackBannerLink, { color: colors.primaryForeground }]}
        >
          @NALIDidThat
        </Text>
      </Text>
    </View>
  );
}

function AppShell({
  children,
  bottomNav,
  showFeedbackBanner = true,
  screenTransitionKey,
}: {
  children: React.ReactNode;
  bottomNav?: React.ReactNode;
  showFeedbackBanner?: boolean;
  screenTransitionKey?: string;
}) {
  const colors = useColors();
  const { reduceMotion } = useMotionPreferences();
  const [webViewportHeight, setWebViewportHeight] = useState<number | undefined>();
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenOffset = useRef(new Animated.Value(0)).current;
  const previousTransitionKey = useRef(screenTransitionKey);

  useEffect(() => {
    if (!screenTransitionKey) return;
    if (previousTransitionKey.current === screenTransitionKey) {
      if (reduceMotion) {
        screenOpacity.setValue(1);
        screenOffset.setValue(0);
      }
      return;
    }

    previousTransitionKey.current = screenTransitionKey;
    screenOpacity.stopAnimation();
    screenOffset.stopAnimation();
    if (reduceMotion) {
      screenOpacity.setValue(1);
      screenOffset.setValue(0);
      return;
    }

    screenOpacity.setValue(0);
    screenOffset.setValue(5);
    const animation = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(screenOffset, {
        toValue: 0,
        duration: 180,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, screenOpacity, screenOffset, screenTransitionKey]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    const syncViewportHeight = () => {
      const height = Math.round(viewport?.height ?? window.innerHeight);
      setWebViewportHeight((current) => current === height ? current : height);
    };
    const revealFocusedInput = () => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)
        || !activeElement.matches('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      window.requestAnimationFrame(() => {
        if (document.activeElement === activeElement) {
          activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        }
      });
    };
    const syncAndReveal = () => {
      syncViewportHeight();
      revealFocusedInput();
    };

    syncViewportHeight();
    viewport?.addEventListener('resize', syncAndReveal);
    window.addEventListener('resize', syncAndReveal);
    document.addEventListener('focusin', revealFocusedInput);

    return () => {
      viewport?.removeEventListener('resize', syncAndReveal);
      window.removeEventListener('resize', syncAndReveal);
      document.removeEventListener('focusin', revealFocusedInput);
    };
  }, []);

  return (
    <View
      testID="app-shell"
      style={[
        styles.app,
        { backgroundColor: colors.background },
        Platform.OS === 'web' && webViewportHeight
          ? { height: webViewportHeight, overflow: 'hidden' }
          : null,
      ]}
    >
      {showFeedbackBanner ? <FeedbackBanner /> : null}
      <Animated.View
        style={[
          styles.appContent,
          screenTransitionKey
            ? {
                opacity: screenOpacity,
                transform: [{ translateY: screenOffset }],
              }
            : null,
        ]}
      >
        {children}
      </Animated.View>
      {bottomNav}
    </View>
  );
}

function BottomNavInteractionHarness({ userType = 'participant' }: { userType?: UserType }) {
  const [active, setActive] = useState<Screen>('home');
  const [lastQuickAction, setLastQuickAction] = useState<BottomNavQuickAction | null>(null);
  const colors = useColors();

  return (
    <AppShell
      showFeedbackBanner={false}
      bottomNav={(
        <BottomNav
          active={active}
          go={setActive}
          userType={userType}
          onQuickAction={setLastQuickAction}
        />
      )}
    >
      <View
        testID="nav-test-screen"
        style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}
      >
        <Text
          testID="nav-test-active"
          style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}
        >
          {active}
        </Text>
        <Text
          testID="nav-test-quick-action"
          style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 12 }}
        >
          {lastQuickAction ?? 'none'}
        </Text>
      </View>
    </AppShell>
  );
}

export default function App() {
  const params = useLocalSearchParams<{ screen?: string; id?: string; friendId?: string; category?: string; step?: string; keyboardTest?: string; navTest?: string }>();
  const router = useRouter();
  const { user, loading, login, clearAuthError } = useAuth();
  const colors = useColors();
  const analyticsMutation = useTrackAnalyticsEvent();
  const analyticsMutationRef = useRef(analyticsMutation);
  analyticsMutationRef.current = analyticsMutation;
  const [entryStage, setEntryStage] = useState<'start' | 'account-type' | 'login'>('start');
  const [selectedAccountType, setSelectedAccountType] = useState<UserType | null>(null);
  const [accountAuthType, setAccountAuthType] = useState<UserType | null>(null);
  const [accountTypeConfirmed, setAccountTypeConfirmed] = useState(false);
  const [showSignupCongratulations, setShowSignupCongratulations] = useState(false);
  const initialScreen = params.screen && screenNames.includes(params.screen as Screen)
    ? params.screen as Screen
    : 'home';
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [experienceId, setExperienceId] = useState(params.id);
  const [feedComposerRequest, setFeedComposerRequest] = useState<number | null>(null);
  const feedComposerRequestSequence = useRef(0);

  useEffect(() => {
    if (!user) {
      setEntryStage('start');
      setSelectedAccountType(null);
      setAccountTypeConfirmed(false);
      setShowSignupCongratulations(false);
    }
  }, [user]);

  useEffect(() => {
    const routeScreen = params.screen;
    if (routeScreen && screenNames.includes(routeScreen as Screen)) {
      setScreen(routeScreen as Screen);
    }
    if (routeScreen === 'experience' || routeScreen === 'host-detail' || (routeScreen === 'create' && params.id)) setExperienceId(params.id);
    else if (routeScreen) setExperienceId(undefined);
  }, [params.screen, params.id]);

  useEffect(() => {
    if (!user) return;
    const platform = Platform.OS === "ios" || Platform.OS === "android"
      ? Platform.OS
      : "web";
    const analyticsScreen = screen === 'accounts'
      ? 'profile'
      : screen === 'host-detail'
        ? 'host'
      : screen === 'activity'
        ? 'home'
        : screen;
    analyticsMutationRef.current.mutate({
      data: { screen: analyticsScreen, platform },
    });
  }, [screen, user?.id]);

  const go = (next: Screen, nextParams?: Record<string, string>) => {
    Keyboard.dismiss();
    setScreen(next);
    const screenUsesExperienceId = next === 'experience' || next === 'host-detail' || (next === 'create' && Boolean(nextParams?.id));
    setExperienceId(screenUsesExperienceId ? nextParams?.id : undefined);
    const routeId = screenUsesExperienceId || next === 'direct-message' ? nextParams?.id : undefined;
    router.setParams({
      screen: next,
      id: routeId,
      friendId: next === 'friend-profile' ? nextParams?.friendId : undefined,
      category: next === 'explore' ? nextParams?.category : undefined,
      step: next === 'create' ? nextParams?.step : undefined,
    });
  };
  const requestFeedComposer = () => {
    feedComposerRequestSequence.current += 1;
    setFeedComposerRequest(feedComposerRequestSequence.current);
  };
  const handleBottomNavQuickAction = (action: BottomNavQuickAction) => {
    if (action === 'post') {
      if (screen !== 'home') go('home');
      requestFeedComposer();
      return;
    }
    if (action === 'assistant') {
      go('ai');
      return;
    }
    if (action === 'challenges') {
      go('challenges');
      return;
    }
    if (action === 'create') {
      if (user?.userType === 'organisation') go('create');
      return;
    }
    go('profile');
  };
  const continueAccountLogin = async (accountType: UserType) => {
    const authenticated = await login(accountType);
    if (!authenticated) return;
    setAccountAuthType(null);
    setShowSignupCongratulations(false);
    setScreen('home');
    router.setParams({ screen: 'home' });
  };

  const organisationProfileIncomplete = user?.userType === 'organisation'
    && (!user.organisation
      || !user.organisation.name.trim()
      || !user.organisation.description?.trim()
      || !user.organisation.city?.trim()
      || !user.organisation.categories.length);
  const needsOnboarding = Boolean(user && (
    !user.userType
    || !user.name.trim()
    || !/^[a-z0-9_]{5,32}$/.test(user.username?.toLowerCase() ?? '')
    || !user.city?.trim()
    || !user.interests.length
    || organisationProfileIncomplete
  ));

  if (__DEV__ && params.keyboardTest === '1') {
    return (
      <AppShell showFeedbackBanner={false}>
        <KeyboardInteractionHarness />
      </AppShell>
    );
  }

  if (__DEV__ && params.keyboardTest === 'create') {
    return (
      <AppShell showFeedbackBanner={false}>
        <Create go={() => {}} initialStep={Number(params.step) || 2} />
      </AppShell>
    );
  }

  if (__DEV__ && (params.navTest === '1' || params.navTest === 'organisation')) {
    return (
      <BottomNavInteractionHarness
        userType={params.navTest === 'organisation' ? 'organisation' : 'participant'}
      />
    );
  }

  if (loading && screen !== 'email') {
    return (
      <AppShell>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Connecting to experiences.fun…</Text>
        </View>
      </AppShell>
    );
  }

  if (screen === 'email') {
    return (
      <AppShell showFeedbackBanner={false}>
        <EmailAuthPanel
          accountType={selectedAccountType}
          onBack={() => {
            clearAuthError();
            if (accountAuthType) {
              go('accounts');
              return;
            }
            setScreen('home');
            setEntryStage('login');
            router.setParams({ screen: 'home' });
          }}
          onSuccess={(justSignedUp) => {
            setAccountAuthType(null);
            setScreen('home');
            setShowSignupCongratulations(justSignedUp);
            router.setParams({ screen: 'home' });
          }}
        />
      </AppShell>
    );
  }

  if (accountAuthType) {
    return (
      <AppShell showFeedbackBanner={false}>
        <LoginChoiceScreen
          accountType={accountAuthType}
          onBack={() => {
            clearAuthError();
            setAccountAuthType(null);
          }}
          onEmail={() => go('email')}
          onTelegram={() => { void continueAccountLogin(accountAuthType); }}
        />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell showFeedbackBanner={false}>
        {entryStage === 'start' ? (
          <TalentWelcome onContinue={() => {
            clearAuthError();
            setEntryStage('account-type');
          }} />
        ) : entryStage === 'account-type' || !selectedAccountType ? (
          <AccountTypeSelection
            selectedType={selectedAccountType}
            onSelect={(value) => {
              setSelectedAccountType(value);
              setAccountTypeConfirmed(false);
            }}
            onBack={() => setEntryStage('start')}
            onContinue={() => {
              if (!selectedAccountType) return;
              clearAuthError();
              setAccountTypeConfirmed(true);
              setEntryStage('login');
            }}
          />
        ) : (
          <LoginChoiceScreen
            accountType={selectedAccountType}
            onBack={() => setEntryStage('account-type')}
            onEmail={() => go('email')}
            onTelegram={() => { void login(selectedAccountType); }}
          />
        )}
      </AppShell>
    );
  }

  if (showSignupCongratulations) {
    return (
      <AppShell showFeedbackBanner={false}>
        <SignupCongratulations
          user={user}
          onContinue={() => setShowSignupCongratulations(false)}
        />
      </AppShell>
    );
  }

  if (needsOnboarding) {
    const onboardingAccountType = user.userType ?? selectedAccountType;
    if (!onboardingAccountType || (!user.userType && !accountTypeConfirmed)) {
      return (
        <AppShell showFeedbackBanner={false}>
          <AccountTypeSelection
            selectedType={selectedAccountType}
            onSelect={(value) => {
              setSelectedAccountType(value);
              setAccountTypeConfirmed(false);
            }}
            onContinue={() => {
              if (!selectedAccountType) return;
              setAccountTypeConfirmed(true);
            }}
          />
        </AppShell>
      );
    }
    return (
      <AppShell showFeedbackBanner={false}>
        <Onboarding
          key={user.id}
          user={user}
          accountType={onboardingAccountType}
          onDone={() => {
            router.setParams({ screen, id: screen === 'experience' || screen === 'host-detail' ? experienceId : undefined });
          }}
        />
      </AppShell>
    );
  }

  if (user.userType !== 'organisation' && (screen === 'host' || screen === 'host-detail' || screen === 'create')) {
    return (
      <AppShell>
        <EmptyState
          title="Organisation account required"
          body="Participant accounts can explore and join. Only Organisation accounts can create and manage experiences."
          actionLabel="Go home"
          onAction={() => go('home')}
        />
      </AppShell>
    );
  }

  const content = (() => {
    if (screen === 'experience') return <Detail id={Number(experienceId)} go={go} />;
    if (screen === 'host-detail') return <HostExperienceDetail experienceId={Number(experienceId)} go={go} />;
    if (screen === 'messages') {
      return (
        <DirectMessagesScreen
          onBack={() => go('home')}
          onOpenConversation={(conversationId) => go('direct-message', { id: String(conversationId) })}
        />
      );
    }
    if (screen === 'direct-message') {
      return (
        <DirectMessagesScreen
          conversationId={Number(params.id)}
          onBack={() => go('messages')}
          onOpenConversation={(conversationId) => go('direct-message', { id: String(conversationId) })}
        />
      );
    }
    if (screen === 'accounts') {
      return (
        <AccountsCenterScreen
          onBack={() => go('profile')}
          onAddAccount={() => {
            const accountType = user.userType ?? 'participant';
            clearAuthError();
            setSelectedAccountType(accountType);
            setAccountAuthType(accountType);
          }}
        />
      );
    }
    if (screen === 'friend-profile') return <FriendProfileScreen friendId={Number(params.friendId)} onBack={() => go('friends')} />;
    if (screen === 'friends') return <FriendsOverviewScreen go={go} onBack={() => go('profile')} />;
    if (screen === 'notifications') {
      return (
        <NotificationsScreen
          onBack={() => go('profile')}
          onOpenFriends={() => go('friends')}
        />
      );
    }
    if (screen === 'explore') return <Explore go={go} />;
    if (screen === 'activity') {
      return (
        <PersonalActivityScreen
          onOpenExperience={(id) => go('experience', { id: String(id) })}
          onOpenChallenges={() => go('challenges')}
          onExplore={() => go('explore')}
        />
      );
    }
    if (screen === 'ai') {
      return (
        <AiAssistantScreen
          onOpenExperience={(id) => go('experience', { id: String(id) })}
        />
      );
    }
    if (screen === 'challenges') {
      return (
        <ExperienceChallengesScreen
          onOpenExperience={(id) => go('experience', { id: String(id) })}
        />
      );
    }
    if (screen === 'experiences') return user.userType === 'organisation' ? <Host go={go} /> : <Experiences go={go} />;
    if (screen === 'profile') return <Profile user={user} go={go} />;
    if (screen === 'host') return <Host go={go} />;
    if (screen === 'create') return <Create go={go} initialStep={Number(params.step) || 1} editExperienceId={experienceId ? Number(experienceId) : undefined} />;
    return (
      <Home
        user={user}
        go={go}
        composerRequest={feedComposerRequest}
        onComposerRequestHandled={(signal) => {
          setFeedComposerRequest((current) => current === signal ? null : current);
        }}
      />
    );
  })();

  const noNav = ['experience', 'host-detail', 'create', 'direct-message'].includes(screen);
  const navActive = user.userType === 'organisation' && screen === 'experiences'
    ? 'host'
    : screen === 'experiences'
      ? 'home'
    : screen === 'friends' || screen === 'friend-profile' || screen === 'notifications' || screen === 'accounts'
      ? 'profile'
      : screen === 'messages' || screen === 'direct-message'
        ? 'home'
      : screen;
  const transitionEntityId = ['experience', 'host-detail', 'direct-message'].includes(screen)
    ? params.id
    : screen === 'friend-profile'
      ? params.friendId
      : undefined;
  return (
    <AppShell
      screenTransitionKey={`${screen}:${transitionEntityId ?? ''}`}
      bottomNav={!noNav
        ? (
          <BottomNav
            active={navActive}
            go={go}
            userType={user.userType ?? 'participant'}
            onQuickAction={handleBottomNavQuickAction}
          />
        )
        : null}
    >
      {content}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, minHeight: 0 },
  appContent: { flex: 1, minHeight: 0 },
  feedbackBanner: { alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8 },
  feedbackBannerText: { width: '100%', textAlign: 'center', fontSize: 13, lineHeight: 19, fontFamily: 'Inter_500Medium' },
  feedbackBannerLink: { fontFamily: 'Inter_700Bold', textDecorationLine: 'underline' },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 20 },
  header: { paddingBottom: 24, flexDirection: 'row', alignItems: 'flex-start' },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  headerCopy: { flex: 1 },
  headerMenuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8, marginTop: -4 },
  headerMenuLines: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerMenuLine: { width: 20, height: 2, borderRadius: 1 },
  headerMenuOverlay: { flex: 1 },
  headerMenuPopover: { position: 'absolute', right: 16, width: 224, borderWidth: 1, paddingVertical: 4, elevation: 8 },
  headerMenuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  headerMenuItemText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 4 },

  button: { minHeight: 56, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  emptyState: { padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginVertical: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 8 },
  inlineErrorText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_500Medium' },

  loading: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 16, fontSize: 15, fontFamily: 'Inter_500Medium' },
  telegramCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, marginBottom: 16 },
  telegramIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  telegramCopy: { flex: 1, minWidth: 0 },
  telegramTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  telegramBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  telegramButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  
  // Experience Card
  experienceCardWrap: { marginBottom: 18 },
  experienceCard: { borderWidth: 1, overflow: 'hidden' },
  experienceCardArtwork: { height: 226, position: 'relative', overflow: 'hidden', justifyContent: 'space-between' },
  experienceCardFallback: { alignItems: 'center', justifyContent: 'center' },
  experienceCardArtworkTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  experienceCardCategory: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 999 },
  experienceCardCategoryText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  experienceCardXp: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 999 },
  experienceCardXpText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  experienceCardArtworkCopy: { paddingHorizontal: 16, paddingBottom: 15 },
  experienceCardOrg: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_700Bold', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 4 },
  experienceCardTitle: { fontSize: 22, lineHeight: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.45 },
  experienceCardContent: { padding: 14, gap: 12 },
  experienceCardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  experienceCardMetaChip: { minHeight: 32, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  experienceCardMetaText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  experienceCardBottomRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  experienceAvailability: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  experienceAvailabilityText: { flexShrink: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  experienceDetailsButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  experienceDetailsButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  
  // Talent / Onboarding
  talentScreen: { flex: 1 },
  talentShell: { flex: 1, paddingHorizontal: 24 },
  talentTop: { flex: 1, justifyContent: 'center' },
  talentIntro: { alignItems: 'center', paddingTop: 10 },
  talentEyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, marginBottom: 10 },
  talentTitle: { fontSize: 38, fontFamily: 'Inter_700Bold', textAlign: 'center', lineHeight: 44, letterSpacing: -1.2 },
  talentTitleSoft: { maxWidth: 300, fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 12, lineHeight: 22 },
  talentArtwork: { width: '100%', height: 184, marginTop: 10, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  talentArtworkBlob: { position: 'absolute', opacity: 0.2 },
  talentArtworkBlobLarge: { width: 162, height: 162, borderRadius: 81, left: 28, top: 10 },
  talentArtworkBlobSmall: { width: 108, height: 108, borderRadius: 54, right: 28, bottom: 6 },
  talentArtworkCard: { position: 'absolute', borderWidth: 1, borderRadius: 20, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  talentArtworkCardBack: { width: 130, height: 98, left: 38, top: 36, padding: 16, transform: [{ rotate: '-8deg' }] },
  talentArtworkCardFront: { width: 194, height: 126, right: 24, top: 28, padding: 16, transform: [{ rotate: '6deg' }] },
  talentArtworkCardText: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 10 },
  talentArtworkIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  talentArtworkLines: { position: 'absolute', left: 76, top: 18, gap: 8 },
  talentArtworkLine: { width: 82, height: 7, borderRadius: 4, opacity: 0.8 },
  talentArtworkLineShort: { width: 54, height: 7, borderRadius: 4 },
  talentArtworkPill: { position: 'absolute', left: 16, bottom: 14, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  talentArtworkPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  welcomeBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%', zIndex: 0 },
  welcomeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%', zIndex: 0 },
  welcomeScroll: { flex: 1, zIndex: 1 },
  welcomeScrollContent: { flexGrow: 1, alignItems: 'center' },
  welcomeHeader: { width: '100%', height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcomeBrand: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  welcomeSkipButton: { minWidth: 54, minHeight: 32, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 16, zIndex: 1 },
  welcomeSkipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  welcomeHeroStage: { width: '100%', position: 'relative' },
  welcomeXpCard: { position: 'absolute', right: 0, bottom: 32, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderRadius: 15 },
  welcomeMedal: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  welcomeXpCopy: { gap: 2 },
  welcomeXpValue: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  welcomeXpLabel: { fontSize: 8, fontFamily: 'Inter_500Medium' },
  welcomeContent: { width: '100%', maxWidth: 540, flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 26, paddingBottom: 8 },
  welcomeTitle: { fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -0.85 },
  welcomeDetails: { paddingTop: 14, gap: 12 },
  welcomeDescription: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  welcomeSocialProof: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 13 },
  welcomeAvatars: { flexDirection: 'row', alignItems: 'center', paddingLeft: 1 },
  welcomeAvatar: { width: 30, height: 30, borderWidth: 2, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: -5 },
  welcomeAvatarInitial: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  welcomeSocialText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  welcomeError: { textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 10 },
  welcomeAuthActions: { flexDirection: 'row', gap: 10 },
  welcomeTelegramButton: { flex: 0, alignSelf: 'stretch', height: 62, minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  welcomeTelegramLabel: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  welcomeEmailButton: { flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1 },
  welcomeTelegramNote: { alignSelf: 'center', textAlign: 'center', fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  welcomeEmailLinkText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  welcomeHomeIndicator: { width: 104, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4, opacity: 0.92 },
  emailLoginLink: { alignItems: 'center', paddingVertical: 2 },
  emailLoginLinkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emailAuthScreen: { flex: 1 },
  emailAuthScroll: { flex: 1 },
  emailAuthContent: { flexGrow: 1, paddingHorizontal: 22, justifyContent: 'center' },
  emailBack: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, alignSelf: 'flex-start' },
  emailBackIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emailBackText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  emailAuthForm: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 18 },
  emailLoginForm: { gap: 0, overflow: 'hidden' },
  emailLoginHero: { minHeight: 238, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24, justifyContent: 'space-between', overflow: 'hidden' },
  emailLoginOrbit: { position: 'absolute', width: 206, height: 206, borderRadius: 103, borderWidth: 1, top: -110, right: -68, opacity: 0.17 },
  emailLoginOrbitSmall: { position: 'absolute', width: 138, height: 138, borderRadius: 69, borderWidth: 1, top: -51, right: 2, opacity: 0.12 },
  emailLoginBack: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  emailLoginBackText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  emailLoginHeroCopy: { gap: 10, marginTop: 18 },
  emailLoginBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  emailLoginBrandMark: { width: 44, height: 44, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emailLoginBrandName: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  emailLoginBrandCaption: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.05, marginTop: 3, opacity: 0.82 },
  emailLoginHeroTitle: { fontSize: 32, lineHeight: 37, fontFamily: 'Inter_700Bold', letterSpacing: -0.8, marginTop: 1 },
  emailLoginHeroBody: { maxWidth: 310, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium', opacity: 0.92 },
  emailLoginFields: { paddingHorizontal: 22, paddingTop: 21, paddingBottom: 18 },
  emailAuthHeader: { gap: 18 },
  emailSignupIntroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  emailAuthFields: { gap: 14 },
  signupCongratsScreen: { flex: 1 },
  signupCongratsContent: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  signupCongratsMark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  signupCongratsEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, textAlign: 'center', marginBottom: 10 },
  signupCongratsTitle: { maxWidth: 360, alignSelf: 'center', fontSize: 32, lineHeight: 38, fontFamily: 'Inter_700Bold', letterSpacing: -0.8, textAlign: 'center' },
  signupCongratsBody: { maxWidth: 340, alignSelf: 'center', fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 12, marginBottom: 24 },
  signupCongratsReward: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, padding: 16, marginBottom: 24 },
  signupCongratsRewardIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  signupCongratsRewardCopy: { flex: 1, minWidth: 0 },
  signupCongratsRewardTitle: { fontSize: 24, lineHeight: 30, fontFamily: 'Inter_700Bold' },
  signupCongratsRewardText: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium', marginTop: 2 },
  emailSignupProgress: { gap: 8, marginTop: 2 },
  emailSignupProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  emailSignupProgressLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  emailSignupProgressHint: { flexShrink: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  emailSignupProgressTrack: { flexDirection: 'row', gap: 5 },
  emailSignupProgressSegment: { flex: 1, height: 5, borderRadius: 3 },
  emailSignupPrevious: { alignItems: 'center', paddingVertical: 6 },
  emailSignupPreviousText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emailIllustration: { width: 56, height: 56, flexShrink: 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emailCardIntro: { flex: 1, minWidth: 0, gap: 5, alignItems: 'flex-start' },
  emailHeroEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 1 },
  emailCardTitle: { fontSize: 25, lineHeight: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, textAlign: 'left' },
  emailCardBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'left' },
  emailSwitchRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 0, marginBottom: 0 },
  emailLoginSwitch: { minHeight: 58, paddingHorizontal: 18, borderTopWidth: 1 },
  emailSwitchPrompt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  emailSwitchLink: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  emailField: { gap: 8 },
  emailFieldHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  emailLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.55 },
  emailInputRow: { height: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  emailInputIcon: { marginLeft: 14, marginRight: 10 },
  emailInput: { flex: 1, height: 51, paddingHorizontal: 0, paddingRight: 13, fontSize: 15, fontFamily: 'Inter_400Regular' },
  emailError: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emailSubmitButton: { marginTop: 4 },
  emailSecureNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: -1 },
  emailSecureNoteText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  
  onboarding: { flex: 1 },
  flowScreenContent: { flexGrow: 1 },
  flowHeader: { paddingHorizontal: 24, paddingBottom: 8 },
  flowHeaderTop: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flowBackButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flowBackSpacer: { width: 40, height: 40 },
  flowBrandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flowBrandMark: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  flowBrandText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: -0.35 },
  flowStepCount: { minWidth: 48, textAlign: 'right', fontSize: 11, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] },
  flowProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 19, marginBottom: 9 },
  flowProgressLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.15 },
  flowProgressHint: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  flowProgressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  flowProgressFill: { height: 4, borderRadius: 2 },
  flowContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 27, paddingBottom: 22 },
  flowHeroBadge: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  flowEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 8 },
  flowTitle: { fontSize: 29, lineHeight: 35, fontFamily: 'Inter_700Bold', letterSpacing: -0.75, marginBottom: 9 },
  flowDescription: { fontSize: 14, lineHeight: 22, fontFamily: 'Inter_400Regular', marginBottom: 25 },
  accountTypeOptions: { gap: 12, marginTop: 2 },
  accountTypeCard: { minHeight: 106, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderWidth: 1.5, borderRadius: 22 },
  accountTypeIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  accountTypeCopy: { flex: 1 },
  accountTypeTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.2 },
  accountTypeDescription: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5 },
  accountTypeRadio: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  accountTypeRadioInner: { width: 10, height: 10, borderRadius: 5 },
  flowReassurance: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  flowReassuranceText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  flowFooter: { paddingHorizontal: 24, paddingTop: 14, gap: 12 },
  loginMethods: { gap: 12 },
  flowForm: { gap: 10 },
  flowFieldLabel: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  flowFieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  optionalLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  flowTextInput: { width: '100%', height: 56, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_500Medium' },
  flowMultilineInput: { width: '100%', minHeight: 104, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  flowFieldHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  characterCount: { alignSelf: 'flex-end', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: -5 },
  interestList: { gap: 10 },
  interestCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1.5, borderRadius: 18 },
  interestIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  interestCopy: { flex: 1 },
  interestTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  interestDescription: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  interestCheck: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  organisationFocusSection: { gap: 12, marginTop: 8 },
  flowTip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 15, marginTop: 12 },
  flowTipText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  reviewSection: { gap: 0 },
  profilePreviewCard: { borderRadius: 24, padding: 20, overflow: 'hidden' },
  profilePreviewBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profilePreviewMark: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  profilePreviewEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.05 },
  profilePreviewTitle: { fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.55, marginTop: 18 },
  profilePreviewBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5 },
  profilePreviewLocation: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  profilePreviewLocationText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  profilePreviewTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  profilePreviewTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  profilePreviewTagText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  reviewList: { marginTop: 10 },
  reviewRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  reviewCopy: { flex: 1 },
  reviewLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.45, marginBottom: 3 },
  reviewValue: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  reviewEditButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 8, paddingLeft: 8 },
  reviewEditText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  bioSection: { gap: 9, marginTop: 22 },
  onboardingScreenContent: { flexGrow: 1 },
  onboardingTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  onboardingBack: { width: 44, height: 44, justifyContent: 'center' },
  skipText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  stepLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  onboardingContent: { paddingHorizontal: 24, paddingBottom: 40 },
  onboardingSlide: { flex: 1, justifyContent: 'center', paddingVertical: 40 },
  onboardingEyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 12 },
  secondScreenIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  onboardingSmallTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  onboardingBody: { fontSize: 16, fontFamily: 'Inter_400Regular', lineHeight: 24, marginBottom: 32 },
  onboardingForm: { gap: 16 },
  onboardingFieldLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: -8 },
  onboardingInputRow: { minHeight: 60, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  onboardingNameInput: { flex: 1, height: 60, paddingHorizontal: 0, fontSize: 18, fontFamily: 'Inter_500Medium' },
  cityInput: { height: 60, paddingHorizontal: 16, borderWidth: 1 },
  inputHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 8 },
  onboardingChoices: { gap: 12 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderWidth: 1 },
  choiceTitle: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold', marginLeft: 16 },
  formLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 24, marginBottom: 8 },
  onboardingParticipationCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderWidth: 1, marginBottom: 12 },
  onboardingArtwork: { height: 200, marginBottom: 40, alignItems: 'center', justifyContent: 'center' },
  artworkBlob: { position: 'absolute' },
  artworkCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  onboardingFooter: { paddingHorizontal: 24, paddingTop: 16 },
  onboardingDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4 },
  
  // Home
  dashboardScreen: { flex: 1 },
  dashboardContent: { paddingHorizontal: 18, paddingBottom: 20 },
  dashboardHero: { paddingTop: 8, marginBottom: 22 },
  dashboardGreeting: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 18 },
  dashboardGreetingCopy: { flex: 1, minWidth: 0 },
  dashboardWelcome: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'left', marginBottom: 2 },
  dashboardName: { fontSize: 22, lineHeight: 28, fontFamily: 'Inter_700Bold', textAlign: 'left', letterSpacing: -0.45 },
  dashboardGreetingActions: { flexDirection: 'row', alignItems: 'center' },
  dashboardHeroAction: { alignItems: 'center', height: 42, justifyContent: 'center', position: 'relative', width: 42 },
  dashboardMessageBadge: { alignItems: 'center', borderRadius: 8, height: 16, justifyContent: 'center', minWidth: 16, paddingHorizontal: 3, position: 'absolute', right: 0, top: 0 },
  dashboardMessageBadgeText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 8 },
  dashboardHeroAvatarButton: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', overflow: 'hidden', width: 42 },
  dashboardHeroAvatar: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  dashboardHeroActionPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  dashboardStatusCard: { borderWidth: 1, gap: 14, padding: 16 },
  dashboardStatusPrompt: { minWidth: 0 },
  dashboardStatusCardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  dashboardStatusMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  dashboardStatusIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dashboardStatusCopy: { flex: 1, minWidth: 0, gap: 3 },
  dashboardStatusTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'Inter_700Bold', letterSpacing: -0.25 },
  dashboardStatusSub: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  dashboardStatusCta: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6, marginTop: 8 },
  dashboardStatusCtaText: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  dashboardHomeSearch: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 12 },
  dashboardHomeSearchLabel: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'Inter_500Medium' },
  dashboardHomeSearchFilter: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dashboardCategoryRow: { gap: 8, paddingRight: 2, paddingVertical: 1 },
  dashboardCategory: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  dashboardCategoryText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dashboardPassportCard: { marginHorizontal: 0, borderWidth: 1, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4, marginBottom: 28 },
  dashboardPassportTop: { minHeight: 78, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dashboardCardEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 5 },
  dashboardPassportTitle: { fontSize: 21, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  dashboardPassportArt: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dashboardPassportMetrics: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  dashboardPassportMetric: { flex: 1, minWidth: 0, minHeight: 78, justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  dashboardPassportMetricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dashboardPassportMetricLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  dashboardPassportMetricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  dashboardPassportMetricValue: { fontSize: 23, lineHeight: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  dashboardPassportMetricUnit: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  dashboardSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, marginTop: 4 },
  dashboardSectionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  dashboardSeeAll: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  dashboardEventCard: { borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  dashboardEventPhoto: { height: 168, position: 'relative', overflow: 'hidden' },
  dashboardEventPhotoTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 12 },
  dashboardEventCategory: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  dashboardEventCategoryText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  dashboardEventFallbackIcon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dashboardEventFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  dashboardEventDate: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12 },
  dashboardEventDateText: { flexShrink: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dashboardEventSummary: { flex: 1, minWidth: 0 },
  dashboardEventCardTitle: { fontSize: 14, lineHeight: 18, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  dashboardEventLocation: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dashboardEventCardMeta: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  dashboardEventXp: { flexShrink: 0, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 12 },
  dashboardEventXpText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  dashboardEmptyEvent: { minHeight: 82, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dashboardEventIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dashboardEventCopy: { flex: 1 },
  dashboardEventTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  dashboardEventMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dashboardXpPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  dashboardXpText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  
  // Explore
  exploreScreen: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' },
  exploreTopOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, paddingHorizontal: 20, paddingTop: 8 },
  exploreFullscreenTopBar: { marginBottom: 12, justifyContent: 'flex-end' },
  exploreFullscreenSearchBox: { width: '60%', alignSelf: 'flex-start', marginBottom: 10 },
  exploreFullscreenFilterRow: { paddingBottom: 0 },
  exploreSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    elevation: 16,
  },
  exploreSheetHeader: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 8 },
  exploreSheetGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  exploreSheetHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  exploreSheetHeadingCopy: { flex: 1, minWidth: 0 },
  exploreSheetTitle: { fontSize: 17, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  exploreSheetHint: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular', marginTop: 1 },
  exploreSheetCount: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'right' },
  exploreSheetToggle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  exploreCityFilter: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, marginTop: 7 },
  exploreCityFilterText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  exploreSheetScroll: { flex: 1, minHeight: 0 },
  exploreSheetScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  exploreContent: { paddingTop: 8, paddingBottom: 12 },
  exploreTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  exploreTopActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  exploreFriendsToggle: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 14 },
  exploreFriendsToggleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  exploreFriendsToggleCount: { minWidth: 12, textAlign: 'center', fontSize: 10, fontFamily: 'Inter_700Bold' },
  exploreFriendsFilterSlot: { paddingHorizontal: 18, marginBottom: 8 },
  exploreTopAction: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  exploreAvatarButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  exploreAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  exploreTopActionPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  exploreIntro: { marginBottom: 20 },
  exploreTitle: { fontSize: 32, lineHeight: 38, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  exploreSubtitle: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 54, borderWidth: 1, marginBottom: 15 },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 16, fontFamily: 'Inter_400Regular' },
  exploreClearButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  filterRow: { gap: 8, paddingBottom: 22 },
  filter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, height: 38, borderRadius: 19, borderWidth: 1, gap: 7 },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  filterText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  resultsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 },
  resultCount: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  
  // Detail
  detailScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  detailToolbar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  detailToolbarButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  detailToolbarTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  detailToolbarSpacer: { width: 42 },
  detailHero: { height: 186, marginBottom: 12, overflow: 'hidden' },
  detailCoverFill: { flex: 1, justifyContent: 'flex-end' },
  detailCoverBottom: { padding: 16 },
  detailCoverPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.94)' },
  detailCoverPillText: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  detailCategoryFallback: { flex: 1, justifyContent: 'flex-end', alignItems: 'flex-start', padding: 20 },
  detailHeroIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  detailCategoryText: { color: '#ffffff', fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  detailIntro: { padding: 16, borderWidth: 1, marginBottom: 12 },
  detailOrganisationLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  detailOrgText: { flexShrink: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  detailVerifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  detailVerifiedText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  detailTitleText: { fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34, letterSpacing: -0.6, marginBottom: 13 },
  detailAboutBlock: { flexDirection: 'row', gap: 10, padding: 12 },
  detailAboutAccent: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
  detailAboutCopy: { flex: 1, minWidth: 0 },
  detailAboutTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  detailMetaGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  metaBox: { flex: 1, minHeight: 112, borderWidth: 1, padding: 13 },
  metaIconLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  metaLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  metaValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19, marginBottom: 3 },
  metaSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  detailSectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  detailBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 21 },
  detailHostCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  detailHostAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  detailHostInitial: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  detailHostLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 3 },
  detailHostName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rewardPanel: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, paddingVertical: 13, paddingHorizontal: 8, marginBottom: 12, overflow: 'hidden' },
  rewardCol: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 7, paddingHorizontal: 7 },
  rewardDivider: { width: StyleSheet.hairlineWidth, marginVertical: 2 },
  detailReward: { fontSize: 15, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  infoBlock: { borderWidth: 1, padding: 14, marginBottom: 10 },
  infoBlockHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  infoBlockIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ctaWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 12 },
  detailActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailActionSummary: { minWidth: 86 },
  detailActionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7, marginBottom: 3 },
  detailActionReward: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  detailActionButton: { flex: 1 },
  joinedBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, marginBottom: 16 },
  joinedTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  joinedSub: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  
  // Experiences (Journey)
  segment: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 24 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  segmentText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  participationCard: { borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.05)' },
  categoryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardCategory: { flex: 1, paddingHorizontal: 12 },
  categoryText: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 2 },
  cardTitleSmall: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: 'rgba(0,0,0,0.01)' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  places: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  
  // Profile
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  
  editPanel: { padding: 20, borderWidth: 1, marginBottom: 24, gap: 16 },
  organisationLocation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  organisationLocationText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  organisationStats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  organisationStat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  organisationStatDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  organisationStatValue: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  organisationStatLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  profileEditorTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileEditorTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  profileEditorClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { height: 56, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  bioInput: { height: 100, paddingTop: 16, textAlignVertical: 'top' },
  
  statValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  contributionCard: { borderWidth: 1, padding: 16, marginBottom: 28 },
  contributionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  contributionHeaderCopy: { flex: 1 },
  contributionSummary: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
  contributionChart: { flexDirection: 'row', minHeight: 108 },
  contributionDayLabels: { width: 28, paddingTop: 20, justifyContent: 'space-around', paddingBottom: 3 },
  contributionDayLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  contributionGridWrap: { flex: 1 },
  contributionMonthLabels: { height: 18, flexDirection: 'row' },
  contributionMonthLabel: { flex: 1, fontSize: 9, fontFamily: 'Inter_500Medium' },
  contributionGrid: { flex: 1, flexDirection: 'row', gap: 3 },
  contributionWeek: { flex: 1, gap: 3 },
  contributionCell: { flex: 1, aspectRatio: 1, minHeight: 8, maxHeight: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 2 },
  contributionLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 14 },
  contributionLegendText: { fontSize: 10, fontFamily: 'Inter_500Medium', marginHorizontal: 2 },
  contributionLegendCell: { width: 11, height: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 2 },

  profileFeatureCard: { gap: 10, marginBottom: 28 },
  friendProfileLoading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12 },
  profileIdentityCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, minHeight: 132, overflow: 'hidden' },
  profileAvatarRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: 3 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 27, fontFamily: 'Inter_700Bold' },
  profileIdentity: { flex: 1, minWidth: 0 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: { flexShrink: 1, fontSize: 20, fontFamily: 'Inter_700Bold' },
  profileHandle: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 3 },
  profileIdentityFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  profileBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, maxWidth: '100%' },
  profileBadgeText: { flexShrink: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  profileSocialLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  profileSocialLink: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  profileEditButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderWidth: 1 },
  profileEditButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  profileBentoRow: { flexDirection: 'row', gap: 10 },
  profileMetricTopRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileCompletedTile: { flex: 1.05, minHeight: 148, justifyContent: 'space-between', padding: 13, borderWidth: 1 },
  profileBentoStack: { flex: 1, gap: 10 },
  profileCompactTile: { flex: 1, minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1 },
  profileMetricIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileMetricIconSmall: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  profileFeatureMetricValue: { fontSize: 34, lineHeight: 38, fontFamily: 'Inter_700Bold' },
  profileCompactMetricCopy: { flex: 1, minWidth: 0 },
  profileCompactMetricValue: { fontSize: 21, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  profileTileLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  profileXpTile: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 13, paddingVertical: 11 },
  profileXpCopy: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  profileXpTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  profileXpCaption: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  profileXpValue: { flexShrink: 0, fontSize: 22, fontFamily: 'Inter_700Bold' },
  profileXpUnit: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  profileBioTile: { gap: 6, padding: 13, borderWidth: 1 },
  profileTileOverline: { fontSize: 9, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  profileDetailTile: { flex: 1, minWidth: 0, minHeight: 112, justifyContent: 'space-between', alignItems: 'flex-start', gap: 7, padding: 12, borderWidth: 1 },
  profileBio: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  profileDetailText: { alignSelf: 'stretch', fontSize: 12, lineHeight: 16, fontFamily: 'Inter_600SemiBold' },
  profileMetricOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,16,22,0.48)' },
  profileMetricSheet: { height: '84%', maxHeight: '90%', paddingTop: 12, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  profileMetricHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  profileMetricSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  profileMetricSheetTitleWrap: { flex: 1, minWidth: 0 },
  profileMetricEyebrow: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  profileMetricSheetTitle: { fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold' },
  profileMetricClose: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  profileMetricSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  profileMetricSummaryCount: { fontSize: 34, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  profileMetricSummaryCopy: { flex: 1, minWidth: 0 },
  profileMetricSummaryLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  profileMetricSummaryDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 2 },
  profileMetricScroll: { flex: 1, marginTop: 12 },
  profileMetricScrollContent: { paddingBottom: 12 },
  profileMetricState: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 28, gap: 10 },
  profileMetricStateIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  profileMetricStateTitle: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  profileMetricStateBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  profileMetricStateButton: { width: '100%', marginTop: 8 },
  profileMetricError: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  profileMetricRecord: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  profileMetricRecordCopy: { flex: 1, minWidth: 0 },
  profileMetricRecordTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_600SemiBold' },
  profileMetricRecordMeta: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 3 },
  profileMetricReward: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  profileMetricRewardText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  profileXpAwardsList: { gap: 4 },
  profileXpRedeemCard: { borderWidth: 1, padding: 14, gap: 11, marginBottom: 6 },
  profileXpRedeemHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  profileXpNotice: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  profileXpAwardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  profileXpAwardIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  profileXpAwardStatus: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  profileMetricFriend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  profileMetricFriendAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  profileMetricFriendInitial: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  historyDot: { width: 12, height: 12, borderRadius: 6, marginRight: 16 },
  historyCopy: { flex: 1 },
  historyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  historySub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  historyRewardPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  historyRewardText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  mutedParagraph: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 16, marginBottom: 24 },
  
  socialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 14 },
  friendsSubtitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 4 },
  friendCountPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 46, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  friendCountText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  friendComposer: { borderWidth: 1, padding: 14, marginBottom: 16 },
  friendComposerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  friendComposerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  friendComposerCopy: { flex: 1, minWidth: 0 },
  friendComposerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  friendComposerSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 2 },
  friendAdd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendInputWrap: { flex: 1, minWidth: 0, height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 11 },
  friendInput: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, fontFamily: 'Inter_400Regular' },
  addButton: { minWidth: 88, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  addButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  friendInputHint: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 7 },
  friendFeedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  friendFeedback: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  friendSection: { marginBottom: 18 },
  friendSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  friendSectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  friendSectionCount: { minWidth: 25, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12 },
  friendSectionCountText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  friendInlineState: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 14 },
  friendInlineStateText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  friendRequestCard: { borderWidth: 1, padding: 12, marginBottom: 8 },
  friendPersonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  friendRequestDirection: { flexShrink: 0, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  friendRequestDirectionText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  friendAvatarInitial: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  friendPersonCopy: { flex: 1, minWidth: 0 },
  friendPersonName: { fontSize: 14, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  friendPersonMeta: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  friendRequestActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  friendRequestButton: { minWidth: 92, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1 },
  friendRequestButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  friendPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, marginBottom: 8 },
  friendPendingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  friendPendingText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  friendConnectedMark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  friendEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 13 },
  friendEmptyIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  friendSectionHint: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', paddingHorizontal: 2 },
  
  // Host
  hostHero: { padding: 20, gap: 10, marginBottom: 16 },
  hostHeroMark: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  hostHeroEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  hostHeroTitle: { fontSize: 23, lineHeight: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  hostHeroBody: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginBottom: 4, opacity: 0.9 },
  hostStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  hostStat: { flexGrow: 1, flexBasis: '48%', minWidth: 0, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 9, gap: 7 },
  hostStatTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hostStatValue: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  hostStatLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  hostSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13 },
  hostSectionCopy: { flex: 1, minWidth: 0 },
  hostSectionHint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 3 },
  hostRefreshButton: { width: 44, height: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hostSearchBox: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 14, marginBottom: 8 },
  hostSearchInput: { flex: 1, minWidth: 0, height: 48, paddingHorizontal: 0, fontSize: 14, fontFamily: 'Inter_400Regular' },
  hostFilterList: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingBottom: 14 },
  hostFilterChip: { minHeight: 38, justifyContent: 'center', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  hostFilterText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  hostExperienceCard: { borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  hostExperienceTop: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 15, paddingBottom: 14 },
  hostExperienceTitleBlock: { flex: 1, minWidth: 0 },
  hostExperienceEyebrow: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  hostExperienceTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  hostStatusPill: { flexShrink: 0, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12 },
  hostStatusText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  hostExperienceBody: { paddingHorizontal: 16, paddingBottom: 15, gap: 10 },
  hostMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hostMetaText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  hostCapacityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  hostCapacityLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  hostCapacityCount: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  hostCapacityTrack: { height: 7, overflow: 'hidden', borderRadius: 4 },
  hostCapacityFill: { height: 7, borderRadius: 4 },
  hostExperienceFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  hostRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hostRewardText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  hostPlacesText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  hostManageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  hostManageText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  hostDetailCard: { borderWidth: 1, padding: 15, marginBottom: 14 },
  hostDetailTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hostDetailCategoryBadge: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 15 },
  hostDetailCategoryText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.15 },
  hostDetailTitle: { fontSize: 21, lineHeight: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.45, marginTop: 10 },
  hostDetailDescription: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4 },
  hostDetailFacts: { flexDirection: 'row', alignItems: 'stretch', gap: 9, marginTop: 13 },
  hostDetailFact: { flex: 1, minWidth: 0, borderWidth: 1, padding: 10, gap: 4 },
  hostDetailFactHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  hostDetailFactIcon: { width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  hostDetailFactLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.65 },
  hostDetailFactValue: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_700Bold' },
  hostDetailFactSecondary: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  hostDetailCapacity: { gap: 8, marginTop: 14 },
  hostDetailProgressTrack: { height: 6, overflow: 'hidden', borderRadius: 3 },
  hostDetailProgressFill: { height: 6, borderRadius: 3 },
  hostDetailFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9 },
  hostDetailRewards: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hostDetailRewardPill: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 14 },
  hostDetailRewardText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  hostDetailMoneyReward: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  hostDetailMetrics: { flexDirection: 'row', gap: 8, marginBottom: 21 },
  hostDetailMetric: { flex: 1, minWidth: 0, minHeight: 72, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 9, justifyContent: 'space-between' },
  hostDetailMetricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  hostDetailMetricValue: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  hostDetailMetricLabel: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_600SemiBold' },
  hostDetailFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hostDetailFilterCount: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  hostWaitlistPanel: { borderWidth: 1, padding: 13, gap: 12, marginBottom: 12 },
  hostWaitlistCopy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostWaitlistIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hostWaitlistTextBlock: { flex: 1, minWidth: 0, gap: 3 },
  hostWaitlistTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  hostWaitlistText: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  hostParticipantCount: { marginBottom: 9 },
  hostParticipantCard: { borderWidth: 1, padding: 14, marginBottom: 10, gap: 10 },
  hostParticipantTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  participantAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  participantInitial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  participantCopy: { flex: 1, minWidth: 0 },
  participantName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  participantStatus: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  hostParticipantMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hostParticipantMetaText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  hostReviewNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 12 },
  hostReviewText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  hostActionPair: { flexDirection: 'row', gap: 8 },
  hostActionButton: { flex: 1, minWidth: 0 },
  hostFullActionButton: { width: '100%' },
  hostParticipantOutcome: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12 },
  hostParticipantOutcomeText: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  
  // Create
  createContent: { paddingHorizontal: 20 },
  createTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  createRoundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  createProgressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', marginHorizontal: 14 },
  createProgressFill: { height: '100%', borderRadius: 3 },
  createStepCount: { minWidth: 52, textAlign: 'right', fontSize: 12, fontFamily: 'Inter_700Bold' },
  createHeading: { marginBottom: 26 },
  createEyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.6, marginBottom: 8 },
  createTitle: { fontSize: 31, lineHeight: 33, fontFamily: 'Inter_700Bold', letterSpacing: -0.9 },
  createDescription: { marginTop: 8, fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  createFields: { gap: 20 },
  createTip: { borderRadius: 23, padding: 16, gap: 8 },
  createTipText: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  createTipStrong: { fontFamily: 'Inter_700Bold' },
  createField: { flex: 1 },
  createFieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.9, marginBottom: 8 },
  createInput: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  createTextArea: { height: 150, paddingTop: 14, textAlignVertical: 'top' },
  createCategoryGrid: { flexDirection: 'row', gap: 8 },
  createCategory: { flex: 1, minHeight: 112, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 8 },
  createCategoryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  createCategoryText: { fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  createOptionalNote: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  createHint: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  createReviewList: { gap: 12 },
  createReviewCard: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  createReviewSectionTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 4 },
  createReviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  createReviewCopy: { flex: 1, minWidth: 0, gap: 3 },
  createReviewLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  createReviewValue: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  createError: { textAlign: 'center', fontSize: 13, lineHeight: 19, fontFamily: 'Inter_600SemiBold', marginTop: 16 },
  createActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  createPrimary: { flex: 1, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createPrimaryPressed: { transform: [{ translateY: 3 }] },
  createPrimaryText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  createFooterNote: { textAlign: 'center', fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 16 },
  
  // Floating brand navigation with liquid glass on the active item.
  bottomNavDock: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    maxWidth: 560,
    paddingHorizontal: 16,
    paddingTop: 8,
    width: '100%',
  },
  bottomNav: {
    borderRadius: 34,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    maxWidth: 520,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 7,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 14,
  },
  bottomNavQuickButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 28,
    elevation: 10,
    height: 56,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    width: 56,
  },
  bottomNavQuickButtonPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
  quickActionsModal: { flex: 1, justifyContent: 'flex-end' },
  quickActionsSheet: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12 },
  quickActionsHandle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 16, width: 36 },
  quickActionsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  quickActionsTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  quickActionsSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 4 },
  quickActionsClose: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  quickActionsList: { gap: 8 },
  quickActionRow: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 68, paddingHorizontal: 12, paddingVertical: 10 },
  quickActionIcon: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  quickActionCopy: { flex: 1, gap: 3, minWidth: 0 },
  quickActionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  quickActionDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 16 },
  navItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    position: 'relative',
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  navGlassSurface: { borderRadius: 17 },
  navGlassFallback: { borderWidth: 1 },
  navItemPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  navIconWrapper: {
    alignItems: 'center',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    marginBottom: 4,
    position: 'relative',
    width: 34,
  },
  navLabel: {
    flexShrink: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
  navLabelActive: { fontFamily: 'Inter_700Bold', fontSize: 10.5 },
});

import React, { useState, useRef, useEffect } from 'react';
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
  Platform,
  Pressable,
  RefreshControl,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  useAcceptFriendRequest,
  useCreateExperience,
  useCreateFriendRequest,
  useDeclineFriendRequest,
  useGetExperience,
  useGetHostOverview,
  useGetMe,
  useJoinExperience,
  useListExperienceParticipants,
  useListExperiences,
  useListFriendRequests,
  useListFriends,
  useListHostExperiences,
  useListMyParticipations,
  useListSentFriendRequests,
  useMarkAttendance,
  useRejectParticipation,
  useSubmitCompletion,
  useUpdateMe,
  useVerifyParticipation,
  getGetExperienceQueryKey,
  getListMyParticipationsQueryKey,
  getListHostExperiencesQueryKey,
  getListExperienceParticipantsQueryKey,
  getListFriendRequestsQueryKey,
  getListFriendsQueryKey,
  getListSentFriendRequestsQueryKey,
  type Experience,
  type ExperienceCategory,
  type ExperienceDetail,
  type ExperienceCreateInput,
  type Participation,
  type User,
  type UserType,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { CommunityXpPanel } from '@/components/CommunityXpPanel';
import { UserAvatar } from '@/components/UserAvatar';
import { openTelegramBot } from '@/lib/telegram';

type Screen = 'home' | 'explore' | 'experiences' | 'profile' | 'experience' | 'host' | 'create' | 'email';
type IconName = keyof typeof Feather.glyphMap;
const screenNames: readonly Screen[] = ['home', 'explore', 'experiences', 'profile', 'experience', 'host', 'create', 'email'];

const categories: Array<{ key: ExperienceCategory | 'all'; label: string; icon: IconName }> = [
  { key: 'all', label: 'All', icon: 'grid' },
  { key: 'environmental', label: 'Environmental', icon: 'feather' },
  { key: 'education', label: 'Education', icon: 'book-open' },
  { key: 'community', label: 'Community', icon: 'users' },
];

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
  const scale = useRef(new Animated.Value(1)).current;

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

  const handlePressIn = () => {
    if (disabled) return;
    triggerHaptic();
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        testID={testID}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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
      </Pressable>
    </Animated.View>
  );
}

type HeaderMenuItem = { key: string; label: string; icon: IconName; onPress: () => void };

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
                  accessibilityLabel={item.label}
                  onPress={() => {
                    triggerHaptic();
                    setMenuOpen(false);
                    item.onPress();
                  }}
                  style={({ pressed }) => [styles.headerMenuItem, { opacity: pressed ? 0.65 : 1 }]}
                >
                  <Feather name={item.icon} size={16} color={colors.primary} />
                  <Text style={[styles.headerMenuItemText, { color: colors.foreground }]}>{item.label}</Text>
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
  const icon = categoryIcon[item.category];
  const gradient = categoryGradients[item.category] || categoryGradients.community;
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 20 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${item.title}`}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        onPress={() => { triggerHaptic(); onPress(); }}
        style={[styles.experienceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
      >
        {item.category === 'community' ? (
          <ImageBackground
            source={require('../assets/images/community-cover.jpg')}
            accessibilityLabel={`Artwork for ${item.title}`}
            resizeMode="cover"
            style={styles.cardImage}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.28)']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
          </ImageBackground>
        ) : (
          <LinearGradient colors={gradient} style={styles.cardImage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Feather name={icon} size={48} color="#ffffff" style={{ opacity: 0.2 }} />
          </LinearGradient>
        )}

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
              <Text style={[styles.cardOrg, { color: colors.mutedForeground }]}>{item.organisation.name}</Text>
            </View>
            <View style={[styles.xpBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.xpBadgeText, { color: colors.primary }]}>+{item.xpReward} XP</Text>
            </View>
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.detailItem}>
              <Feather name={icon} size={15} color={colors.primary} />
              <Text style={[styles.detailText, { color: colors.foreground }]}>{categoryLabel[item.category]}</Text>
            </View>
            <View style={styles.detailItem}>
              <Feather name="calendar" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailText, { color: colors.mutedForeground }]}>{dateLabel(item.date)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Feather name="map-pin" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailText, { color: colors.mutedForeground }]}>{item.city}</Text>
            </View>
            <View style={styles.detailItem}>
              <Feather name="users" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailText, { color: item.availablePlaces < 4 ? colors.primary : colors.mutedForeground }]}>{item.availablePlaces} spots left</Text>
            </View>
          </View>
        </View>
      </Pressable>
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
  onSuccess: () => void;
  accountType: UserType | null;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { loginWithEmail, signUpWithEmail, loading, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const isSignup = mode === 'signup';

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  const submit = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    if (isSignup && password !== confirmPassword) {
      setLocalError('Your passwords do not match.');
      return;
    }
    const authenticated = isSignup
      ? await signUpWithEmail(name.trim(), email.trim(), password)
      : await loginWithEmail(email.trim(), password);
    if (authenticated) onSuccess();
  };

  return (
    <View style={[styles.emailAuthScreen, { backgroundColor: colors.muted }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.muted} />
      <KeyboardAwareScrollViewCompat
        style={[styles.emailAuthScroll, { backgroundColor: colors.muted }]}
        contentContainerStyle={[styles.emailAuthContent, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={24}
      >
          <View style={[styles.emailAuthForm, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius + 8, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 20 }]}>
          <View style={styles.emailAuthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to sign-in options" onPress={onBack} style={styles.emailBack}>
              <View style={[styles.emailBackIcon, { backgroundColor: colors.secondary + '14' }]}>
                <Feather name="arrow-left" size={18} color={colors.secondary} />
              </View>
              <Text style={[styles.emailBackText, { color: colors.foreground }]}>Back</Text>
            </Pressable>
            <View style={[styles.emailIllustration, { backgroundColor: colors.secondary + '14' }]} accessible={false}>
              <Feather name="users" size={34} color={colors.secondary} />
            </View>
            <View style={styles.emailCardIntro}>
              <Text style={[styles.emailHeroEyebrow, { color: colors.secondary }]}>EXPERIENCES.FUN</Text>
              <Text style={[styles.emailCardTitle, { color: colors.foreground }]}>{isSignup ? 'Create account' : 'Log in'}</Text>
              <Text style={[styles.emailCardBody, { color: colors.mutedForeground }]}>
                {isSignup
                  ? `Start your ${accountType === 'organisation' ? 'organisation profile' : 'passport'} with a few details.`
                  : 'Welcome back. Enter your details below.'}
              </Text>
            </View>
          </View>

          <View style={styles.emailAuthFields}>
            {isSignup ? (
              <View style={styles.emailField}>
                <Text style={[styles.emailLabel, { color: colors.foreground }]}>Name</Text>
                <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                  <Feather name="user" size={17} color={colors.mutedForeground} style={styles.emailInputIcon} />
                  <TextInput
                    accessibilityLabel="Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="words"
                    style={[styles.emailInput, { color: colors.foreground }]}
                  />
                </View>
              </View>
            ) : null}
            <View style={styles.emailField}>
              <Text style={[styles.emailLabel, { color: colors.foreground }]}>Email</Text>
              <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                <Feather name="mail" size={17} color={colors.mutedForeground} style={styles.emailInputIcon} />
                <TextInput
                  accessibilityLabel="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={[styles.emailInput, { color: colors.foreground }]}
                />
              </View>
            </View>
            <View style={styles.emailField}>
              <Text style={[styles.emailLabel, { color: colors.foreground }]}>Password</Text>
              <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                <Feather name="lock" size={17} color={colors.mutedForeground} style={styles.emailInputIcon} />
                <TextInput
                  accessibilityLabel="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry
                  autoCapitalize="none"
                  style={[styles.emailInput, { color: colors.foreground }]}
                />
              </View>
            </View>
            {isSignup ? (
              <View style={styles.emailField}>
                <Text style={[styles.emailLabel, { color: colors.foreground }]}>Confirm password</Text>
                <View style={[styles.emailInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
                  <Feather name="check-circle" size={17} color={colors.mutedForeground} style={styles.emailInputIcon} />
                  <TextInput
                    accessibilityLabel="Confirm password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat your password"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    autoCapitalize="none"
                    style={[styles.emailInput, { color: colors.foreground }]}
                  />
                </View>
              </View>
            ) : null}
            {localError || authError ? <Text accessibilityRole="alert" style={[styles.emailError, { color: colors.destructive }]}>{localError ?? authError}</Text> : null}
            <Button
              label={loading ? (isSignup ? 'Creating account…' : 'Logging in…') : (isSignup ? 'Create account' : 'Log in')}
              disabled={loading || !email.trim() || !password || (isSignup && (!name.trim() || !confirmPassword))}
              onPress={() => { void submit(); }}
              icon={isSignup ? 'user-plus' : 'log-in'}
              color={colors.primary}
              style={styles.emailSubmitButton}
            />
            <View style={styles.emailSecureNote}>
              <Feather name="shield" size={12} color={colors.mutedForeground} />
              <Text style={[styles.emailSecureNoteText, { color: colors.mutedForeground }]}>Your details are kept secure</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => { setMode(isSignup ? 'login' : 'signup'); setLocalError(null); clearAuthError(); }}
            style={styles.emailSwitchRow}
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
        {isWeb ? (
          <View style={styles.welcomeStatusBar} accessibilityLabel="Status bar">
            <Text style={[styles.welcomeStatusTime, { color: welcome.foreground }]}>9:41</Text>
            <View style={styles.welcomeStatusIcons}>
              <View style={styles.welcomeSignal}>
                <View style={[styles.welcomeSignalBar, { height: 4, backgroundColor: welcome.foreground }]} />
                <View style={[styles.welcomeSignalBar, { height: 6, backgroundColor: welcome.foreground }]} />
                <View style={[styles.welcomeSignalBar, { height: 8, backgroundColor: welcome.foreground }]} />
                <View style={[styles.welcomeSignalBar, { height: 10, backgroundColor: welcome.foreground }]} />
              </View>
              <Feather name="wifi" size={15} color={welcome.foreground} />
              <Feather name="battery" size={17} color={welcome.foreground} />
            </View>
          </View>
        ) : null}

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
            Real people{'\n'}doing <Text style={{ color: colors.primary }}>real things.</Text>
          </Text>
          <View style={styles.welcomeDetails}>
            <Text style={[styles.welcomeDescription, { color: welcome.muted }]}>
              Find small ways to make a real difference near you — and turn your experiences into lasting impact.
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
                testID="welcome-start"
                onPressIn={triggerHaptic}
                onPress={onContinue}
                style={({ pressed }) => [
                  styles.welcomeTelegramButton,
                  { width: '100%', backgroundColor: colors.primary, borderRadius: colors.radius * 2, opacity: pressed ? 0.86 : 1 },
                ]}
              >
                <Text style={[styles.welcomeTelegramLabel, { color: colors.primaryForeground }]}>Get started</Text>
                <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
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
        <Button label="Continue" disabled={!selectedType} onPress={onContinue} icon="arrow-right" />
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

function Onboarding({ user, accountType: initialAccountType, onDone }: { user: User; accountType: UserType; onDone: () => void }) {
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
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (step === 1 && !name.trim()) return;
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
    (step === 1 && !name.trim()) ||
    (step === 2 && (accountType === 'participant'
      ? interests.length === 0
      : !organisationName.trim() || !organisationDescription.trim())) ||
    (step === 3 && (!city.trim() || (accountType === 'organisation' && interests.length === 0)));

  const reviewItems = accountType === 'organisation'
    ? [
        { label: 'Contact', value: name.trim() || 'Add a contact name', step: 1 },
        { label: 'Organisation', value: organisationName.trim() || 'Add an organisation name', step: 2 },
        { label: 'Location & focus', value: `${city.trim() || 'Add a city'} · ${interests.map((value) => categoryLabel[value]).join(', ') || 'Choose causes'}`, step: 3 },
      ]
    : [
        { label: 'Display name', value: name.trim() || 'Add your name', step: 1 },
        { label: 'Interests', value: interests.map((value) => categoryLabel[value]).join(', ') || 'Choose interests', step: 2 },
        { label: 'City', value: city.trim() || 'Add your city', step: 3 },
      ];

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.onboarding, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.flowScreenContent, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 24) }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
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
            <Text style={[styles.flowFieldHint, { color: colors.mutedForeground }]}>
              {user.email ? `Signed in as ${user.email}` : 'Your Telegram account stays connected automatically.'}
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

function Home({ user, go }: { user: User; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const { user: authenticatedUser } = useAuth();
  const query = useListExperiences({ availableOnly: true });
  const participations = useListMyParticipations(
    { status: 'upcoming' },
    { query: { enabled: user.userType === 'participant', queryKey: getListMyParticipationsQueryKey({ status: 'upcoming' }) } },
  );
  const items = query.data ?? [];
  const firstName = user.name.split(' ')[0];
  const upcomingCount = participations.data?.length ?? 0;
  const quickActions: Array<{ label: string; icon: IconName; screen: Screen }> = [
    { label: 'Explore', icon: 'compass', screen: 'explore' },
    ...(user.userType === 'participant'
      ? [{ label: 'Journey', icon: 'calendar' as IconName, screen: 'experiences' as Screen }]
      : [{ label: 'Host tools', icon: 'briefcase' as IconName, screen: 'host' as Screen }]),
    { label: user.userType === 'organisation' ? 'Organisation' : 'Passport', icon: user.userType === 'organisation' ? 'briefcase' : 'award', screen: 'profile' },
  ];

  return (
      <ScrollView
      style={[styles.dashboardScreen, { backgroundColor: colors.muted }]}
      contentContainerStyle={[styles.dashboardContent, { paddingTop: 12 }]}
      refreshControl={<RefreshControl refreshing={query.isRefetching || participations.isRefetching} onRefresh={() => { triggerHaptic(); void Promise.all([query.refetch(), participations.refetch()]); }} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {!authenticatedUser ? <TelegramConnectCard /> : null}

      <View style={[styles.dashboardHero, { borderRadius: 30, overflow: 'hidden' }]}>
        <LinearGradient colors={[colors.secondary, colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.dashboardGlow, styles.dashboardGlowOne]} />
        <View style={[styles.dashboardGlow, styles.dashboardGlowTwo]} />
        <View style={styles.dashboardGreeting}>
          <View style={styles.dashboardGreetingAccent} />
          <View style={styles.dashboardGreetingCopy}>
            <Text style={styles.dashboardWelcome}>Welcome back</Text>
            <Text style={styles.dashboardName} numberOfLines={1}>{firstName}🎉</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Open your experience journey" onPress={() => { triggerHaptic(); go('experiences'); }} style={styles.dashboardStatusStrip}>
          <View style={[styles.dashboardStatusIcon, { backgroundColor: colors.primary }]}>
            <Text style={styles.dashboardStatusNumber}>{upcomingCount}</Text>
            <Feather name="calendar" size={14} color={colors.primaryForeground} />
          </View>
          <View style={styles.dashboardStatusCopy}>
            <Text style={[styles.dashboardStatusTitle, { color: colors.foreground }]}>
              {upcomingCount ? `${upcomingCount} experience${upcomingCount === 1 ? '' : 's'} coming up` : 'Ready for your first experience?'}
            </Text>
            <Text style={[styles.dashboardStatusSub, { color: colors.mutedForeground }]}>{upcomingCount ? 'View your journey' : 'Find something meaningful nearby'}</Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {participations.isError ? <InlineError message="Your upcoming bookings couldn’t be loaded. Pull down to try again." /> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Open your experience passport" onPress={() => { triggerHaptic(); go('profile'); }} style={[styles.dashboardPassportCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.dashboardPassportTop}>
          <View>
            <Text style={[styles.dashboardCardEyebrow, { color: colors.primary }]}>EXPERIENCE PASSPORT</Text>
            <Text style={[styles.dashboardPassportTitle, { color: colors.foreground }]}>{user.level}</Text>
            <View style={styles.dashboardPassportMeta}>
              <Feather name="zap" size={16} color={colors.primary} />
              <Text style={[styles.dashboardPassportMetaText, { color: colors.mutedForeground }]}>{user.xp} XP earned</Text>
            </View>
          </View>
          <View style={[styles.dashboardPassportArt, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="award" size={44} color={colors.primary} />
          </View>
        </View>
        <View style={[styles.dashboardPassportFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.dashboardPassportStat, { color: colors.foreground }]}>{user.completedCount} completed</Text>
          <View style={[styles.dashboardPassportButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.dashboardPassportButtonText, { color: colors.card }]}>View EXP</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.dashboardSectionHeader}>
        <Text style={[styles.dashboardSectionTitle, { color: colors.foreground }]}>Quick actions</Text>
      </View>
      <View style={styles.dashboardActionGrid}>
        {quickActions.map((action) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            key={action.label}
            onPress={() => { triggerHaptic(); go(action.screen); }}
            style={({ pressed }) => [styles.dashboardAction, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.75 : 1 }]}
          >
            <View style={[styles.dashboardActionIcon, { backgroundColor: colors.primary + '12' }]}>
              <Feather name={action.icon} size={20} color={colors.primary} />
            </View>
            <Text style={[styles.dashboardActionLabel, { color: colors.foreground }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

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
  const [category, setCategory] = useState<ExperienceCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const query = useListExperiences({ category: category === 'all' ? undefined : category, search: search.trim() || undefined, availableOnly: true });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      <Header title="Explore" subtitle="Find your next way to contribute." />

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
        <Feather name="search" size={22} color={colors.mutedForeground} />
        <TextInput accessibilityLabel="Search experiences" value={search} onChangeText={setSearch} placeholder="Search experiences" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {categories.map((item) => {
          const selected = category === item.key;
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={item.key} onPress={() => { triggerHaptic(); setCategory(item.key); }} style={[styles.filter, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
              <Feather name={item.icon} size={18} color={selected ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.resultsHeading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available now</Text>
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{query.data?.length ?? 0} opportunities</Text>
      </View>

      {query.isLoading ? <LoadingState /> : query.isError ? (
        <EmptyState title="Experiences didn’t load" body="Check your connection and try again." actionLabel="Try again" onAction={() => { void query.refetch(); }} />
      ) : query.data?.length ? query.data.map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title="No experiences match" body="Try another category or come back when local hosts publish something new." />}
      <View style={{ height: 120 }} />
    </ScrollView>
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
            <View style={[styles.joinedBanner, { backgroundColor: colors.success + '15', borderRadius: colors.radius }]}>
              <Feather name="check-circle" size={28} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.joinedTitle, { color: colors.success }]}>You're participating</Text>
                <Text style={[styles.joinedSub, { color: colors.success }]}>{participation.status === 'verified' ? 'Completion verified and reward issued.' : participation.status === 'submitted' ? 'Awaiting host verification.' : 'Show up, then submit your completion.'}</Text>
              </View>
            </View>
            {['joined', 'attended'].includes(participation.status) ? (
              <Button
                label={participation.status === 'attended' ? (submit.isPending ? 'Submitting…' : 'Submit completion') : participation.status === 'joined' ? (query.isRefetching ? 'Refreshing…' : 'Refresh status') : (query.isRefetching ? 'Refreshing…' : 'Refresh verification')}
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
              label={join.isPending ? 'Joining…' : item.availablePlaces === 0 ? 'Fully booked' : 'Join experience'}
              disabled={join.isPending || item.availablePlaces === 0}
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
              <Text style={[styles.statusText, { color: item.status === 'verified' ? colors.success : colors.secondary }]}>{item.status === 'verified' ? 'Verified' : item.status === 'submitted' ? 'Awaiting verification' : item.status}</Text>
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

type ProfileMetricKey = 'completed' | 'hosted' | 'friends';

function SocialProfileHeader({
  user,
  friendsCount,
  onMetricPress,
}: {
  user: User;
  friendsCount: number;
  onMetricPress: (metric: ProfileMetricKey) => void;
}) {
  const colors = useColors();
  const interests = user.interests?.map((interest) => categoryLabel[interest]).join(' · ');
  const joinedIn2026 = Boolean(user.createdAt && new Date(user.createdAt).getUTCFullYear() === 2026);
  const profileBadges: Array<{ key: string; label: string; icon: IconName }> = [
    { key: 'level', label: user.level, icon: 'award' },
    ...(joinedIn2026 ? [{ key: 'early', label: 'Early', icon: 'star' as IconName }] : []),
  ];

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
        </View>
      </View>

      <View style={styles.profileBentoRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${user.completedCount} completed experiences`}
          accessibilityHint="Opens a summary of your completed experiences."
          onPress={() => { triggerHaptic(); onMetricPress('completed'); }}
          style={({ pressed }) => [
            styles.profileCompletedTile,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <View style={styles.profileMetricTopRow}>
            <View style={[styles.profileMetricIcon, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="check-circle" size={16} color={colors.primary} />
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.profileFeatureMetricValue, { color: colors.primary }]}>{user.completedCount}</Text>
          <Text style={[styles.profileTileLabel, { color: colors.mutedForeground }]}>Completed</Text>
        </Pressable>
        <View style={styles.profileBentoStack}>
          <Pressable
            testID="profile-metric-friends"
            accessibilityRole="button"
            accessibilityLabel={`View ${user.hostedCount} hosted experiences`}
            accessibilityHint="Opens a summary of your hosted experiences."
            onPress={() => { triggerHaptic(); onMetricPress('hosted'); }}
            style={({ pressed }) => [
              styles.profileCompactTile,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.76 : 1 },
            ]}
          >
            <View style={[styles.profileMetricIconSmall, { backgroundColor: colors.primary + '12' }]}>
              <Feather name="calendar" size={13} color={colors.primary} />
            </View>
            <View style={styles.profileCompactMetricCopy}>
              <Text style={[styles.profileCompactMetricValue, { color: colors.primary }]}>{user.hostedCount}</Text>
              <Text style={[styles.profileTileLabel, { color: colors.mutedForeground }]}>Hosted</Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${friendsCount} friends`}
            accessibilityHint="Opens your friends list."
            onPress={() => { triggerHaptic(); onMetricPress('friends'); }}
            style={({ pressed }) => [
              styles.profileCompactTile,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.76 : 1 },
            ]}
          >
            <View style={[styles.profileMetricIconSmall, { backgroundColor: colors.primary + '12' }]}>
              <Feather name="users" size={13} color={colors.primary} />
            </View>
            <View style={styles.profileCompactMetricCopy}>
              <Text style={[styles.profileCompactMetricValue, { color: colors.primary }]}>{friendsCount}</Text>
              <Text style={[styles.profileTileLabel, { color: colors.mutedForeground }]}>Friends</Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.profileXpTile, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
        <View style={styles.profileXpCopy}>
          <View style={[styles.profileMetricIconSmall, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="zap" size={14} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.profileXpTitle, { color: colors.foreground }]}>Experience points</Text>
            <Text style={[styles.profileXpCaption, { color: colors.mutedForeground }]}>Earned through participation</Text>
          </View>
        </View>
        <Text style={[styles.profileXpValue, { color: colors.primary }]}>{user.xp}<Text style={[styles.profileXpUnit, { color: colors.primary }]}> XP</Text></Text>
      </View>

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
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!metric) return null;

  const title = {
    completed: 'Completed experiences',
    hosted: 'Hosted experiences',
    friends: 'Friends',
  }[metric];
  const count = metric === 'completed'
    ? user.completedCount
    : metric === 'hosted'
      ? user.hostedCount
      : friends?.length ?? 0;
  const countLabel = {
    completed: `completed ${count === 1 ? 'experience' : 'experiences'}`,
    hosted: `hosted ${count === 1 ? 'experience' : 'experiences'}`,
    friends: count === 1 ? 'friend' : 'friends',
  }[metric];
  const description = {
    completed: 'Your participation history',
    hosted: 'Experiences you have organised',
    friends: 'People connected with you',
  }[metric];
  const emptyTitle = count > 0 ? 'Summary count saved' : {
    completed: 'No completed experiences yet',
    hosted: 'No hosted experiences yet',
    friends: 'No friends yet',
  }[metric];
  const emptyBody = count > 0
    ? 'The profile total is available, but detailed records are not available right now.'
    : {
      completed: 'Completed experiences will appear here.',
      hosted: 'Experiences you host will appear here.',
      friends: 'Accepted friend connections will appear here.',
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
              name={metric === 'completed' ? 'check-circle' : metric === 'hosted' ? 'calendar' : 'users'}
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
            ) : isLoading ? (
              <View style={styles.profileMetricState}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>Loading your records…</Text>
              </View>
            ) : hasError ? (
              <View style={styles.profileMetricState}>
                <View style={[styles.profileMetricStateIcon, { backgroundColor: colors.destructive + '12' }]}>
                  <Feather name="alert-circle" size={20} color={colors.destructive} />
                </View>
                <Text style={[styles.profileMetricStateTitle, { color: colors.foreground }]}>Couldn’t load this summary</Text>
                <Text style={[styles.profileMetricStateBody, { color: colors.mutedForeground }]}>Your profile is unchanged. Try again to reload these records.</Text>
                <Button testID="profile-metric-retry" label="Try again" variant="secondary" icon="refresh-cw" onPress={onRetry} style={styles.profileMetricStateButton} />
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
                <View key={friend.id} style={[styles.profileMetricFriend, { borderBottomColor: colors.border }]}>
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
                </View>
              ))
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
  const friends = useListFriends({ query: { queryKey: getListFriendsQueryKey(), enabled: Boolean(authenticatedUser) } });
  const requests = useListFriendRequests({ query: { queryKey: getListFriendRequestsQueryKey(), refetchInterval: 5_000, enabled: Boolean(authenticatedUser) } });
  const sentRequests = useListSentFriendRequests({ query: { queryKey: getListSentFriendRequestsQueryKey(), refetchInterval: 5_000, enabled: Boolean(authenticatedUser) } });
  const update = useUpdateMe({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const createFriend = useCreateFriendRequest({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const accept = useAcceptFriendRequest({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const decline = useDeclineFriendRequest({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [city, setCity] = useState(user.city ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [interests, setInterests] = useState<ExperienceCategory[]>(user.interests ?? []);
  const [organisationName, setOrganisationName] = useState(user.organisation?.name ?? '');
  const [organisationDescription, setOrganisationDescription] = useState(user.organisation?.description ?? '');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileMenuError, setProfileMenuError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [friendFeedback, setFriendFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [respondingRequest, setRespondingRequest] = useState<{ id: number; action: 'accept' | 'decline' } | null>(null);
  const [selectedProfileMetric, setSelectedProfileMetric] = useState<ProfileMetricKey | null>(null);
  const current = profile.data ?? user;
  const normalizedFriendUsername = username.trim().replace(/^@+/, '').trim();
  const combinedFriendRequests = [
    ...(requests.data ?? []).map((request) => ({ ...request, direction: 'incoming' as const })),
    ...(sentRequests.data ?? []).map((request) => ({ ...request, direction: 'sent' as const })),
  ];

  const toggleProfileEditor = () => {
    if (!editing) {
      setName(current.name ?? '');
      setCity(current.city ?? '');
      setBio(current.bio ?? '');
      setInterests(current.interests ?? []);
      setOrganisationName(current.organisation?.name ?? '');
      setOrganisationDescription(current.organisation?.description ?? '');
      setProfileSaveError(null);
    }
    setEditing((value) => !value);
  };

  const saveProfile = async () => {
    setProfileSaveError(null);
    try {
      const baseData = { name: name.trim(), city: city.trim(), bio: bio.trim() || null, interests };
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

  const sendFriendRequest = () => {
    if (!normalizedFriendUsername || createFriend.isPending) return;

    setFriendFeedback(null);
    void createFriend.mutateAsync({ data: { username: normalizedFriendUsername } })
      .then(() => {
        setUsername('');
        Keyboard.dismiss();
        setFriendFeedback({ message: 'Friend request sent.', tone: 'success' });
      })
      .catch((requestError: unknown) => {
        const message = (requestError as { data?: { message?: string } })?.data?.message;
        setFriendFeedback({
          message: message ?? 'Could not send that request. Check the username or try again.',
          tone: 'error',
        });
      });
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
    } finally {
      setRespondingRequest(null);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <Header
        title={current.userType === 'organisation' ? 'Organisation profile' : 'Passport'}
        subtitle={current.userType === 'organisation' ? (current.organisation?.name ?? 'Organisation account') : 'Participant account · Your contribution identity.'}
        menuItems={[
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

      <SocialProfileHeader
        user={current}
        friendsCount={friends.data?.length ?? 0}
        onMetricPress={setSelectedProfileMetric}
      />
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
      />

      {editing ? (
        <View style={[styles.editPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
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
          {!name.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add a display name to save your profile.</Text> : null}
          {!city.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add a city to save your profile.</Text> : null}
          {!interests.length ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Choose at least one interest to save your profile.</Text> : null}
          {current.userType === 'organisation' && !organisationName.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add an organisation name.</Text> : null}
          {current.userType === 'organisation' && !organisationDescription.trim() ? <Text style={[styles.inputHint, { color: colors.destructive }]}>Add an organisation description.</Text> : null}
          {profileSaveError ? <InlineError message={profileSaveError} /> : null}
          <Button
            label={update.isPending ? 'Saving…' : 'Save profile'}
            disabled={update.isPending || !name.trim() || !city.trim() || interests.length === 0 || (current.userType === 'organisation' && (!organisationName.trim() || !organisationDescription.trim()))}
            onPress={() => void saveProfile()}
          />
        </View>
      ) : null}

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
          <Text style={[styles.mutedParagraph, { color: colors.mutedForeground }]}>{current.organisation?.description ?? 'Complete your organisation details to introduce your work to participants.'}</Text>
          <Text style={[styles.inputHint, { color: colors.mutedForeground, marginTop: 10 }]}>
            {current.organisation?.city ?? current.city ?? 'Location not set'} · {hosted.data?.length ?? 0} experiences hosted
          </Text>
          <Button label="Open organisation tools" icon="briefcase" onPress={() => go('host')} style={{ marginTop: 18 }} />
        </View>
      )}

      <View style={styles.socialHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Friends</Text>
          <Text style={[styles.friendsSubtitle, { color: colors.mutedForeground }]}>Build your circle on Experiences.fun.</Text>
        </View>
        <View style={[styles.friendCountPill, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="users" size={15} color={colors.primary} />
          <Text style={[styles.friendCountText, { color: colors.primary }]}>{friends.data?.length ?? 0}</Text>
        </View>
      </View>
      {!authenticatedUser ? <TelegramConnectCard /> : (
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
                  testID="profile-friend-username"
                  accessibilityLabel="Friend username"
                  value={username}
                  onChangeText={(value) => { setUsername(value); setFriendFeedback(null); }}
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
                testID="profile-friend-send-request"
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
                {createFriend.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <Feather name="send" size={15} color={colors.primaryForeground} />
                    <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Send</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={[styles.friendInputHint, { color: colors.mutedForeground }]}>Enter a username with or without @.</Text>
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
                testID="profile-friend-requests-retry"
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
                  testID={`profile-friend-request-${request.direction}-${request.id}`}
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
                        testID={`friend-request-decline-${request.id}`}
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
                        testID={`friend-request-accept-${request.id}`}
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
              <Pressable accessibilityRole="button" onPress={() => void friends.refetch()} style={[styles.friendInlineState, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}>
                <Feather name="refresh-cw" size={16} color={colors.primary} />
                <Text style={[styles.friendInlineStateText, { color: colors.foreground }]}>Couldn’t load your friends. Tap to retry.</Text>
              </Pressable>
            ) : friends.data?.length ? (
              friends.data.map((friend) => (
                <View key={friend.id} style={[styles.friendPersonRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
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
                  <View style={[styles.friendConnectedMark, { backgroundColor: colors.success + '12' }]}>
                    <Feather name="check" size={15} color={colors.success} />
                  </View>
                </View>
              ))
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

      {current.userType === 'organisation' ? (
        <View style={{ marginTop: 32 }}>
          <Button label="Open organisation tools" variant="secondary" icon="briefcase" onPress={() => { triggerHaptic(); go('host'); }} />
        </View>
      ) : null}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function Host({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const overview = useGetHostOverview();
  const experiences = useListHostExperiences();
  const [selected, setSelected] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const participants = useListExperienceParticipants(selected ?? 0, { query: { enabled: selected !== null, queryKey: getListExperienceParticipantsQueryKey(selected ?? 0) } });
  const attend = useMarkAttendance({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const verify = useVerifyParticipation({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const reject = useRejectParticipation({ mutation: { onSuccess: () => { invalidateAppQueries(queryClient); triggerHaptic(); } } });
  const runHostAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(requestErrorMessage(error, 'That host action could not be completed. Please try again.'));
    }
  };

  if (user?.userType !== 'organisation') {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Organisation tools" onBack={() => go('profile')} /><EmptyState title="Organisation account required" body="Participant accounts can explore and join experiences. Only Organisation accounts can create and manage experiences." actionLabel="Go home" onAction={() => go('home')} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      <Header title="Host tools" subtitle={overview.data?.organisation?.name ?? 'Create your first opportunity'} onBack={() => go('home')} />

      <View style={styles.hostStats}>
        {[['Upcoming', overview.data?.upcomingExperiences ?? 0], ['Participants', overview.data?.participantCount ?? 0], ['To verify', overview.data?.pendingVerifications ?? 0]].map(([label, value]) => (
          <View key={String(label)} style={[styles.hostStat, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.hostStatValue, { color: colors.foreground }]}>{overview.isLoading ? '…' : value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        ))}
      </View>

      {overview.isError ? <EmptyState title="Host statistics couldn’t be loaded" body="Check your connection and try again." actionLabel="Try again" onAction={() => { void overview.refetch(); }} /> : null}
      <Button label="Create experience" icon="plus" onPress={() => { triggerHaptic(); go('create'); }} />

      <View style={styles.socialHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your experiences</Text>
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{experiences.data?.length ?? 0} published</Text>
      </View>

      {experiences.isLoading ? <LoadingState /> : experiences.isError ? (
        <EmptyState title="Your experiences didn’t load" body="Try again to see your published opportunities." actionLabel="Try again" onAction={() => { void experiences.refetch(); }} />
      ) : experiences.data?.length ? experiences.data.map((item) => (
        <Pressable key={item.id} onPress={() => { triggerHaptic(); setSelected(selected === item.id ? null : item.id); }} style={[styles.participationCard, { backgroundColor: selected === item.id ? colors.primary + '10' : colors.card, borderColor: selected === item.id ? colors.primary : colors.border, borderRadius: colors.radius }]}>
          <View style={styles.cardTop}>
            <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name={categoryIcon[item.category]} size={24} color={colors.primary} />
            </View>
            <View style={styles.cardCategory}>
              <Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{dateLabel(item.date)} · {item.availablePlaces} spots left</Text>
              <Text style={[styles.cardTitleSmall, { color: colors.foreground }]}>{item.title}</Text>
            </View>
            <Feather name={selected === item.id ? 'chevron-down' : 'chevron-right'} size={24} color={colors.mutedForeground} />
          </View>
        </Pressable>
      )) : <EmptyState title="No experience published" body="Create a real volunteering opportunity and it will appear here." icon="edit-3" />}

      {selected !== null ? (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Participants</Text>
          {actionError ? <InlineError message={actionError} /> : null}
          {participants.isLoading ? <LoadingState /> : participants.isError ? (
            <EmptyState title="Participants couldn’t be loaded" body="Try again to check attendance and completion." actionLabel="Try again" onAction={() => { void participants.refetch(); }} />
          ) : participants.data?.length ? participants.data.map((item) => (
            <View key={item.id} style={[styles.participantRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.participantAvatar, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.participantInitial, { color: colors.primary }]}>{item.participant.name.charAt(0)}</Text>
              </View>
              <View style={styles.participantCopy}>
                <Text style={[styles.participantName, { color: colors.foreground }]}>{item.participant.name}</Text>
                <Text style={[styles.participantStatus, { color: colors.mutedForeground }]}>{item.participant.username ? `@${item.participant.username} · ` : ''}{item.status}</Text>
              </View>
              {item.status === 'joined' ? (
                <Button label={attend.isPending ? 'Saving…' : 'Attend'} variant="secondary" disabled={attend.isPending} onPress={() => void runHostAction(() => attend.mutateAsync({ participationId: item.id }))} />
              ) : null}
              {item.status === 'submitted' ? (
                <View style={styles.actionPair}>
                  <Button label={verify.isPending ? 'Saving…' : 'Verify'} disabled={verify.isPending || reject.isPending} onPress={() => void runHostAction(() => verify.mutateAsync({ participationId: item.id }))} />
                  <Button label={reject.isPending ? 'Saving…' : 'Reject'} variant="secondary" disabled={verify.isPending || reject.isPending} onPress={() => void runHostAction(() => reject.mutateAsync({ participationId: item.id }))} />
                </View>
              ) : null}
              {item.status === 'verified' ? <Feather name="check-circle" size={28} color={colors.success} /> : null}
            </View>
          )) : <EmptyState title="No participants yet" body="When people join, you'll manage attendance and completion here." icon="users" />}
        </View>
      ) : null}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function Create({
  go,
  initialStep = 1,
}: {
  go: (screen: Screen, params?: Record<string, string>) => void;
  initialStep?: number;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const create = useCreateExperience();
  const totalSteps = 6;
  const [step, setStep] = useState(() => Math.min(totalSteps, Math.max(1, initialStep)));
  const [publishError, setPublishError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ExperienceCreateInput>>({
    organisationName: user?.organisation?.name ?? '',
    organisationDescription: user?.organisation?.description ?? '',
    category: 'community',
    city: user?.city ?? 'London',
    capacity: 12,
    xpReward: 150,
    monetaryRewardPence: null,
  });

  const set = (key: keyof ExperienceCreateInput, value: string | number | null) => {
    const numeric = key === 'capacity' || key === 'xpReward' || key === 'monetaryRewardPence';
    const nextValue = numeric ? (value === '' || value === null ? null : Number(value)) : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
  };

  useEffect(() => {
    Keyboard.dismiss();
  }, [step]);

  const valid = Boolean(
    form.organisationName?.trim()
    && form.title?.trim()
    && form.description?.trim()
    && form.category
    && form.date?.trim()
    && form.startTime?.trim()
    && form.endTime?.trim()
    && form.location?.trim()
    && form.city?.trim()
    && Number(form.capacity) >= 1
    && Number(form.xpReward) >= 0,
  );
  const canContinue =
    step === 1 ? Boolean(form.organisationName?.trim()) :
    step === 2 ? Boolean(form.title?.trim() && form.description?.trim()) :
    step === 3 ? Boolean(form.category) :
    step === 4 ? Boolean(
      form.date?.trim()
      && form.startTime?.trim()
      && form.endTime?.trim()
      && form.location?.trim()
      && form.city?.trim()
    ) :
    step === 5 ? Boolean(
      Number(form.capacity) >= 1
      && Number(form.xpReward) >= 0,
    ) :
    valid;

  const goToStep = (nextStep: number) => {
    Keyboard.dismiss();
    triggerHaptic();
    setStep(nextStep);
  };

  const publish = async () => {
    triggerHaptic();
    if (!valid || create.isPending) return;
    setPublishError(null);
    if (!user) {
      setPublishError('Open Experiences.fun from Telegram to publish an experience.');
      return;
    }
    try {
      await create.mutateAsync({
        data: {
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
        },
      });
      go('host');
    } catch (publishRequestError: unknown) {
      const responseMessage = (publishRequestError as { data?: { message?: string } })?.data?.message;
      setPublishError(responseMessage ?? 'We couldn’t publish this experience. Please try again.');
    }
  };

  const field = (key: keyof ExperienceCreateInput, label: string, placeholder: string, multiline = false, keyboardType: 'default' | 'number-pad' = 'default') => (
    <View style={styles.createField}>
      <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={label}
        value={form[key] == null ? '' : String(form[key])}
        onChangeText={(value) => set(key, value)}
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

  const sceneField = (
    key: keyof ExperienceCreateInput,
    label: string,
    placeholder: string,
    icon: IconName,
    hint?: string,
  ) => (
    <View style={[styles.createSceneField, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
      <View style={[styles.createSceneIcon, { backgroundColor: colors.primary + '12' }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.createSceneFieldBody}>
        <Text style={[styles.createSceneFieldLabel, { color: colors.foreground }]}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          value={form[key] == null ? '' : String(form[key])}
          onChangeText={(value) => set(key, value)}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.createSceneInput, { color: colors.foreground }]}
        />
        {hint ? <Text style={[styles.createSceneHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
    </View>
  );

  const stepTitles = ['Tell us about you', 'Shape the idea', 'Choose a feeling', 'Set the scene', 'Make joining easy', 'Make it yours'];
  const stepDescriptions = [
    'Every great gathering starts with a good host.',
    'Give your idea a little shape — you can change it later.',
    'Choose the kind of difference this experience will make.',
    'A few details help the right people show up.',
    'Set the places and recognition you want to offer.',
    'Add the magic, then take a look before you share it.',
  ];

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.createContent,
        { flexGrow: 1, paddingTop: 12, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
        <View style={styles.createTopBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? 'Close create experience' : 'Previous step'}
            onPress={() => { Keyboard.dismiss(); triggerHaptic(); step > 1 ? setStep((current) => current - 1) : go('host'); }}
            style={[styles.createRoundButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
          >
            <Feather name={step === 1 ? 'x' : 'arrow-left'} size={22} color={colors.foreground} />
          </Pressable>
          <View accessibilityLabel={`Step ${step} of ${totalSteps}`} style={styles.createProgress}>
            {Array.from({ length: totalSteps }, (_, index) => index + 1).map((item) => (
              <View
                key={item}
                style={[
                  styles.createProgressBar,
                  {
                    width: item === step ? 40 : 24,
                    backgroundColor: item === step ? colors.primary : item < step ? colors.primary + '80' : colors.muted,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.createStepCount, { color: colors.mutedForeground }]}>{step}/{totalSteps}</Text>
        </View>

        <View style={styles.createHeading}>
          <Text style={[styles.createEyebrow, { color: colors.primary }]}>CREATE EXPERIENCE</Text>
          <Text style={[styles.createTitle, { color: colors.foreground }]}>{stepTitles[step - 1]}</Text>
          <Text style={[styles.createDescription, { color: colors.mutedForeground }]}>{stepDescriptions[step - 1]}</Text>
        </View>

        {!user ? <TelegramConnectCard /> : null}

        <View style={styles.createFields}>
          {step === 1 && (
            <>
              <View style={[styles.createTip, { backgroundColor: colors.secondary + '15' }]}>
                <Feather name="star" size={20} color={colors.secondary} />
                <Text style={[styles.createTipText, { color: colors.secondary }]}><Text style={styles.createTipStrong}>People join people.</Text> Tell participants who is behind this experience.</Text>
              </View>
              {field('organisationName', 'Organisation name', 'e.g. The Good Gym')}
              {field('organisationDescription', 'What does your organisation do?', 'A sentence or two about your community', true)}
            </>
          )}

          {step === 2 && (
            <>
              {field('title', 'Experience title', 'e.g. Make a river wild again')}
              {field('description', 'What is it about?', 'Give your experience a warm, inviting intro', true)}
            </>
          )}

          {step === 3 && (
            <>
              <View>
                <Text style={[styles.createFieldLabel, { color: colors.mutedForeground }]}>CHOOSE A FEELING</Text>
                <View style={styles.createCategoryGrid}>
                  {categories.slice(1).map((item) => {
                    const active = form.category === item.key;
                    const tint = item.key === 'environmental' ? colors.teal + '15' : item.key === 'community' ? colors.primary + '15' : colors.secondary + '15';
                    const iconColor = item.key === 'environmental' ? colors.teal : item.key === 'community' ? colors.primary : colors.secondary;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => { triggerHaptic(); set('category', item.key); }}
                        style={[
                          styles.createCategory,
                          {
                            backgroundColor: colors.card,
                            borderColor: active ? iconColor : colors.border,
                            borderRadius: colors.radius - 8,
                          },
                        ]}
                      >
                        <View style={[styles.createCategoryIcon, { backgroundColor: tint }]}>
                          <Feather name={item.icon} size={22} color={active ? iconColor : colors.mutedForeground} />
                        </View>
                        <Text style={[styles.createCategoryText, { color: active ? iconColor : colors.mutedForeground }]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {step === 4 && (
            <>
              <View style={[styles.createSceneGuide, { backgroundColor: colors.teal + '12' }]}>
                <View style={[styles.createSceneGuideIcon, { backgroundColor: colors.teal + '20' }]}>
                  <Feather name="navigation" size={19} color={colors.teal} />
                </View>
                <View style={styles.createSceneGuideCopy}>
                  <Text style={[styles.createSceneGuideTitle, { color: colors.foreground }]}>Make arrival easy</Text>
                  <Text style={[styles.createSceneGuideBody, { color: colors.mutedForeground }]}>Clear details help people feel confident saying yes.</Text>
                </View>
              </View>

              <View style={styles.createSceneSection}>
                <Text style={[styles.createSceneSectionLabel, { color: colors.mutedForeground }]}>WHEN IT HAPPENS</Text>
                {sceneField('date', 'Date', 'YYYY-MM-DD', 'calendar', 'Use the format YYYY-MM-DD')}
                {sceneField('startTime', 'Start time', '10:00', 'clock')}
                {sceneField('endTime', 'End time', '13:00', 'clock')}
              </View>

              <View style={styles.createSceneSection}>
                <Text style={[styles.createSceneSectionLabel, { color: colors.mutedForeground }]}>WHERE TO MEET</Text>
                {sceneField('city', 'City', 'London', 'map-pin')}
                {sceneField('location', 'Meeting point', 'A clear place people can find', 'navigation-2', 'Add a landmark, street, or venue')}
              </View>
            </>
          )}

          {step === 5 && (
            <View style={[styles.createRewardPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
              <View style={styles.createRewardHeading}>
                <Feather name="credit-card" size={20} color={colors.secondary} />
                <Text style={[styles.createRewardTitle, { color: colors.foreground }]}>Make joining easy</Text>
              </View>
              <View style={styles.createFieldRow}>
                <View style={styles.createFieldHalf}>{field('capacity', 'Capacity', '12', false, 'number-pad')}</View>
                <View style={styles.createFieldHalf}>{field('xpReward', 'XP reward', '150', false, 'number-pad')}</View>
              </View>
              {field('monetaryRewardPence', 'Money reward in pence (optional)', '0', false, 'number-pad')}
              <Text style={[styles.createHint, { color: colors.mutedForeground }]}>For example, enter 2000 for a £20 reward.</Text>
            </View>
          )}

          {step === 6 && (
            <>
              {field('whatYouWillDo', 'What will participants do?', 'Walk, make, chat, discover...', true)}
              {field('whatToBring', 'What should they bring?', 'Comfortable shoes and a curious mind', true)}
              <View style={[styles.createPreview, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                <View style={styles.createPreviewTop}>
                  <Text style={[styles.createPreviewEyebrow, { color: colors.primary }]}>LIVE PREVIEW</Text>
                  <Text style={styles.createPreviewCategory}>{form.category ? categoryLabel[form.category] : 'Community'}</Text>
                </View>
                <Text style={styles.createPreviewTitle}>{form.title || 'Your experience title'}</Text>
                <Text style={styles.createPreviewBody}>{form.description || 'Your welcoming description will appear here.'}</Text>
                <View style={styles.createPreviewGrid}>
                  <View style={styles.createPreviewMeta}><Feather name="calendar" size={16} color={colors.teal} /><Text style={styles.createPreviewMetaText}>{form.date || 'Date'}</Text></View>
                  <View style={styles.createPreviewMeta}><Feather name="clock" size={16} color={colors.teal} /><Text style={styles.createPreviewMetaText}>{form.startTime || 'Start'}–{form.endTime || 'End'}</Text></View>
                  <View style={styles.createPreviewMeta}><Feather name="map-pin" size={16} color={colors.teal} /><Text style={styles.createPreviewMetaText}>{form.city || 'City'}</Text></View>
                  <View style={styles.createPreviewMeta}><Feather name="users" size={16} color={colors.teal} /><Text style={styles.createPreviewMetaText}>{form.capacity || 0} places</Text></View>
                </View>
              </View>
            </>
          )}
        </View>

        {(publishError || create.isError) && (
          <Text accessibilityRole="alert" style={[styles.createError, { color: colors.destructive }]}>
            {publishError ?? 'We couldn’t publish this experience. Please try again.'}
          </Text>
        )}

        <View style={styles.createActions}>
          {step === totalSteps && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start over"
              onPress={() => { Keyboard.dismiss(); triggerHaptic(); setStep(1); }}
              style={[styles.createReset, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 8 }]}
            >
              <Feather name="rotate-ccw" size={20} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue || create.isPending }}
            disabled={!canContinue || create.isPending}
            onPress={() => { Keyboard.dismiss(); if (step < totalSteps) goToStep(step + 1); else void publish(); }}
            style={({ pressed }) => [
              styles.createPrimary,
              { backgroundColor: canContinue && !create.isPending ? colors.primary : colors.muted, borderRadius: colors.radius - 8 },
              pressed && canContinue && !create.isPending && styles.createPrimaryPressed,
            ]}
          >
            {create.isPending
              ? <ActivityIndicator color={colors.primaryForeground} />
              : (
                <>
                  <Text style={[styles.createPrimaryText, { color: canContinue ? colors.primaryForeground : colors.mutedForeground }]}>{step === totalSteps ? 'Publish experience' : 'Keep going'}</Text>
                  <Feather name={step === totalSteps ? 'send' : 'arrow-right'} size={20} color={canContinue ? colors.primaryForeground : colors.mutedForeground} />
                </>
              )}
          </Pressable>
        </View>
        <Text style={styles.createFooterNote}>
          {step === totalSteps ? 'You can edit the details after publishing.' : 'Nothing is published until you say so.'}
        </Text>
    </KeyboardAwareScrollViewCompat>
  );
}

function BottomNav({ active, go }: { active: Screen; go: (screen: Screen) => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const items: Array<{ key: Screen; label: string; icon: IconName }> = user?.userType === 'organisation'
    ? [
        { key: 'home', label: 'Home', icon: 'home' },
        { key: 'explore', label: 'Explore', icon: 'compass' },
        { key: 'host', label: 'Host', icon: 'briefcase' },
        { key: 'profile', label: 'Organisation', icon: 'user' },
      ]
    : [
        { key: 'home', label: 'Home', icon: 'home' },
        { key: 'explore', label: 'Explore', icon: 'compass' },
        { key: 'experiences', label: 'Experiences', icon: 'calendar' },
        { key: 'profile', label: 'Profile', icon: 'user' },
      ];
  return (
    <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'web' ? 34 : 28 }]}>
      {items.map((item) => {
        const selected = active === item.key;
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }} key={item.key} onPress={() => { triggerHaptic(); go(item.key); }} style={styles.navItem}>
            <View style={[styles.navIconWrapper, selected && { backgroundColor: colors.primary + '15' }]}>
              <Feather name={item.icon} size={22} color={selected ? colors.primary : colors.mutedForeground} />
            </View>
            <Text style={[styles.navLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
          </Pressable>
        );
      })}
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
}: {
  children: React.ReactNode;
  bottomNav?: React.ReactNode;
  showFeedbackBanner?: boolean;
}) {
  const colors = useColors();

  return (
    <View style={[styles.app, { backgroundColor: colors.background }]}>
      {showFeedbackBanner ? <FeedbackBanner /> : null}
      <View style={styles.appContent}>{children}</View>
      {bottomNav}
    </View>
  );
}

export default function App() {
  const params = useLocalSearchParams<{ screen?: string; id?: string; step?: string }>();
  const router = useRouter();
  const { user, loading, login, clearAuthError } = useAuth();
  const colors = useColors();
  const [entryStage, setEntryStage] = useState<'start' | 'account-type' | 'login'>('start');
  const [selectedAccountType, setSelectedAccountType] = useState<UserType | null>(null);
  const [accountTypeConfirmed, setAccountTypeConfirmed] = useState(false);
  const initialScreen = params.screen && screenNames.includes(params.screen as Screen)
    ? params.screen as Screen
    : 'home';
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [experienceId, setExperienceId] = useState(params.id);

  useEffect(() => {
    if (!user) {
      setEntryStage('start');
      setSelectedAccountType(null);
      setAccountTypeConfirmed(false);
    }
  }, [user]);

  useEffect(() => {
    const routeScreen = params.screen;
    if (routeScreen && screenNames.includes(routeScreen as Screen)) {
      setScreen(routeScreen as Screen);
    }
    if (routeScreen === 'experience') setExperienceId(params.id);
    else if (routeScreen) setExperienceId(undefined);
  }, [params.screen, params.id]);

  const go = (next: Screen, nextParams?: Record<string, string>) => {
    Keyboard.dismiss();
    setScreen(next);
    setExperienceId(next === 'experience' ? nextParams?.id : undefined);
    router.setParams({
      screen: next,
      id: next === 'experience' ? nextParams?.id : undefined,
    });
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
    || !user.city?.trim()
    || !user.interests.length
    || organisationProfileIncomplete
  ));

  if (loading) {
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
            setScreen('home');
            setEntryStage('login');
            router.setParams({ screen: 'home' });
          }}
          onSuccess={() => {
            setScreen('home');
            router.setParams({ screen: 'home' });
          }}
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
            onTelegram={() => { void login(); }}
          />
        )}
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
        <Onboarding key={user.id} user={user} accountType={onboardingAccountType} onDone={() => {
          router.setParams({ screen, id: screen === 'experience' ? experienceId : undefined });
        }} />
      </AppShell>
    );
  }

  if (user.userType !== 'organisation' && (screen === 'host' || screen === 'create')) {
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
    if (screen === 'explore') return <Explore go={go} />;
    if (screen === 'experiences') return user.userType === 'organisation' ? <Host go={go} /> : <Experiences go={go} />;
    if (screen === 'profile') return <Profile user={user} go={go} />;
    if (screen === 'host') return <Host go={go} />;
    if (screen === 'create') return <Create go={go} initialStep={Number(params.step) || 1} />;
    return <Home user={user} go={go} />;
  })();

  const noNav = ['experience', 'create'].includes(screen);
  const navActive = user.userType === 'organisation' && screen === 'experiences' ? 'host' : screen;
  return (
    <AppShell bottomNav={!noNav ? <BottomNav active={navActive} go={go} /> : null}>
      {content}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  appContent: { flex: 1 },
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
  experienceCard: { borderWidth: 1, overflow: 'hidden' },
  cardImage: { height: 160, alignItems: 'center', justifyContent: 'center' },
  cardContent: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardHeaderLeft: { flex: 1, paddingRight: 12 },
  cardTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 4, lineHeight: 24 },
  cardOrg: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  xpBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  xpBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  cardDetails: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  
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
  welcomeStatusBar: { width: '100%', height: 24, paddingHorizontal: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcomeStatusTime: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  welcomeStatusIcons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  welcomeSignal: { height: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  welcomeSignalBar: { width: 2, borderRadius: 1 },
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
  welcomeTelegramButton: { flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  welcomeTelegramLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
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
  emailAuthHeader: { gap: 12 },
  emailAuthFields: { gap: 14 },
  emailIllustration: { width: 70, height: 70, borderRadius: 35, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emailCardIntro: { gap: 5, alignItems: 'center', marginTop: 0, marginBottom: 2 },
  emailHeroEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 2 },
  emailCardTitle: { fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -0.8, textAlign: 'center' },
  emailCardBody: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  emailSwitchRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 0, marginBottom: 0 },
  emailSwitchPrompt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  emailSwitchLink: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  emailField: { gap: 8 },
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
  dashboardHero: { minHeight: 260, paddingHorizontal: 24, paddingTop: 34, marginBottom: -34, position: 'relative' },
  dashboardGlow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999 },
  dashboardGlowOne: { width: 220, height: 220, right: -82, top: -82 },
  dashboardGlowTwo: { width: 160, height: 160, left: -60, bottom: -76 },
  dashboardGreeting: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 0 },
  dashboardGreetingAccent: { width: 3, height: 48, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.56)' },
  dashboardGreetingCopy: { flex: 1, minWidth: 0 },
  dashboardWelcome: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'left', marginBottom: 3 },
  dashboardName: { color: '#ffffff', fontSize: 34, lineHeight: 40, fontFamily: 'Inter_700Bold', textAlign: 'left', letterSpacing: -0.9 },
  dashboardStatusStrip: { minHeight: 72, borderRadius: 22, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 24 },
  dashboardStatusIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  dashboardStatusNumber: { color: '#ffffff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  dashboardStatusCopy: { flex: 1 },
  dashboardStatusTitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  dashboardStatusSub: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  dashboardPassportCard: { marginHorizontal: 8, borderWidth: 1, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5, marginBottom: 28 },
  dashboardPassportTop: { minHeight: 142, padding: 20, paddingTop: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dashboardCardEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 7 },
  dashboardPassportTitle: { fontSize: 23, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, marginBottom: 8 },
  dashboardPassportMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dashboardPassportMetaText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  dashboardPassportArt: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dashboardPassportFooter: { minHeight: 58, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dashboardPassportStat: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dashboardPassportButton: { minHeight: 38, paddingHorizontal: 17, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dashboardPassportButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  dashboardSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, marginTop: 4 },
  dashboardSectionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  dashboardSeeAll: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  dashboardActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  dashboardAction: { width: '48%', minHeight: 58, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dashboardActionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dashboardActionLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, borderWidth: 1, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 16, fontFamily: 'Inter_400Regular' },
  filterRow: { gap: 12, paddingBottom: 24 },
  filter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, gap: 8 },
  sectionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  filterText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  resultsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 },
  resultCount: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  
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
  hostStats: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  hostStat: { flex: 1, borderWidth: 1, padding: 16, alignItems: 'center', gap: 8 },
  hostStatValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  participantRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, marginBottom: 12, gap: 12 },
  participantAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  participantInitial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  participantCopy: { flex: 1 },
  participantName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  participantStatus: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  actionPair: { flexDirection: 'row', gap: 8 },
  
  // Create
  createContent: { paddingHorizontal: 20 },
  createTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  createRoundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  createProgress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  createProgressBar: { height: 6, borderRadius: 3 },
  createStepCount: { width: 40, textAlign: 'right', fontSize: 12, fontFamily: 'Inter_700Bold' },
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
  createTextArea: { height: 96, paddingTop: 14, textAlignVertical: 'top' },
  createFieldRow: { flexDirection: 'row', gap: 12 },
  createFieldHalf: { flex: 1 },
  createSceneGuide: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderRadius: 20 },
  createSceneGuideIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  createSceneGuideCopy: { flex: 1, gap: 3 },
  createSceneGuideTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  createSceneGuideBody: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  createSceneSection: { gap: 10 },
  createSceneSectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, marginTop: 4 },
  createSceneField: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderWidth: 1, gap: 12 },
  createSceneIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  createSceneFieldBody: { flex: 1, minWidth: 0 },
  createSceneFieldLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  createSceneInput: { height: 38, paddingHorizontal: 0, paddingVertical: 0, fontSize: 16, fontFamily: 'Inter_400Regular' },
  createSceneHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 2 },
  createCategoryGrid: { flexDirection: 'row', gap: 8 },
  createCategory: { flex: 1, minHeight: 94, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 8 },
  createCategoryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  createCategoryText: { fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  createRewardPanel: { borderWidth: 1, padding: 16, gap: 16 },
  createRewardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  createRewardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  createHint: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: -8 },
  createPreview: { padding: 16 },
  createPreviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  createPreviewEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  createPreviewCategory: { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontFamily: 'Inter_500Medium' },
  createPreviewTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontFamily: 'Inter_700Bold' },
  createPreviewBody: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 4 },
  createPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, marginTop: 16 },
  createPreviewMeta: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  createPreviewMetaText: { color: '#ffffff', fontSize: 11, fontFamily: 'Inter_500Medium', flexShrink: 1 },
  createError: { textAlign: 'center', fontSize: 13, lineHeight: 19, fontFamily: 'Inter_600SemiBold', marginTop: 16 },
  createActions: { flexDirection: 'row', gap: 12, marginTop: 28 },
  createReset: { width: 54, height: 54, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  createPrimary: { flex: 1, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createPrimaryPressed: { transform: [{ translateY: 3 }] },
  createPrimaryText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  createFooterNote: { color: '#9A8FA0', textAlign: 'center', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16 },
  
  // Bottom Nav
  bottomNav: { flexDirection: 'row', paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIconWrapper: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  navLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});

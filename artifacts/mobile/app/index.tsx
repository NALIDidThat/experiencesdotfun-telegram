import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
  useMarkAttendance,
  useRejectParticipation,
  useSubmitCompletion,
  useUpdateMe,
  useVerifyParticipation,
  getGetExperienceQueryKey,
  getListExperienceParticipantsQueryKey,
  type Experience,
  type ExperienceCategory,
  type ExperienceDetail,
  type ExperienceCreateInput,
  type Participation,
  type ParticipationType,
  type User,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

type Screen = 'home' | 'explore' | 'experiences' | 'profile' | 'experience' | 'host' | 'create';
type IconName = keyof typeof Feather.glyphMap;

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

const guestUser: User = {
  id: 0,
  telegramId: 0,
  username: null,
  name: 'Guest User',
  participationType: 'join',
  interests: ['community', 'environmental'],
  city: 'London', country: null,
  bio: null,
  xp: 0,
  level: 'Newcomer',
  completedCount: 0,
  hostedCount: 0,
  rewardsPence: 0,
};

function money(pence: number | null | undefined) {
  return pence ? `£${(pence / 100).toFixed(2)}` : null;
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
  label, onPress, variant = 'primary', disabled = false, icon, style,
}: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'alternative'; disabled?: boolean; icon?: IconName; style?: any;
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

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 16 }]}>
      {onBack && (
        <Pressable accessibilityLabel="Go back" onPress={() => { triggerHaptic(); onBack(); }} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      )}
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
    </View>
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
        <LinearGradient colors={gradient} style={styles.cardImage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Feather name={icon} size={48} color="#ffffff" style={{ opacity: 0.2 }} />
        </LinearGradient>

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

function OnboardingArtwork({ variant }: { variant: 'welcome' | 'complete' }) {
  const colors = useColors();
  return (
    <View style={styles.onboardingArtwork}>
      <LinearGradient colors={['#FF107A', '#6E00FF']} style={[styles.artworkBlob, { width: 160, height: 160, borderRadius: 80, left: 10, top: 10, opacity: 0.9 }]} />
      <LinearGradient colors={['#6E00FF', '#00C4CC']} style={[styles.artworkBlob, { width: 120, height: 120, borderRadius: 60, right: 20, bottom: 20, opacity: 0.9 }]} />
      <View style={[styles.artworkCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name={variant === 'welcome' ? 'users' : 'check'} size={48} color={colors.foreground} />
      </View>
    </View>
  );
}

function TalentWelcome({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [email, setEmail] = useState('lucia.bell@dka.io');

  return (
    <KeyboardAvoidingView style={[styles.talentScreen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.talentShell, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 20), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.talentTopBar}>
          <View style={styles.talentBrandMark}>
            <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.talentBrandIcon}>
              <Feather name="star" size={16} color={colors.primaryForeground} />
            </LinearGradient>
            <Text style={[styles.talentBrand, { color: colors.foreground }]}>experiences.fun</Text>
          </View>
        </View>

        <View style={styles.talentTop}>
          <View style={styles.talentIntro}>
            <Text style={[styles.talentEyebrow, { color: colors.primary }]}>YOUR NEXT GOOD THING</Text>
            <Text style={[styles.talentTitle, { color: colors.foreground }]}>
              Real people doing{'\n'}
              <Text style={{ color: colors.primary }}>real things.</Text>
            </Text>
            <Text style={[styles.talentTitleSoft, { color: colors.mutedForeground }]}>Find small ways to make a real difference near you.</Text>
            <View style={styles.talentArtwork}>
              <LinearGradient colors={[colors.primary, colors.secondary]} style={[styles.talentArtworkBlob, styles.talentArtworkBlobLarge]} />
              <LinearGradient colors={[colors.accent, colors.teal]} style={[styles.talentArtworkBlob, styles.talentArtworkBlobSmall]} />
              <View style={[styles.talentArtworkCard, styles.talentArtworkCardBack, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="map-pin" size={24} color={colors.accent} />
                <Text style={[styles.talentArtworkCardText, { color: colors.foreground }]}>near you</Text>
              </View>
              <View style={[styles.talentArtworkCard, styles.talentArtworkCardFront, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.talentArtworkIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name="users" size={28} color={colors.primary} />
                </View>
                <View style={styles.talentArtworkLines}>
                  <View style={[styles.talentArtworkLine, { backgroundColor: colors.foreground }]} />
                  <View style={[styles.talentArtworkLineShort, { backgroundColor: colors.border }]} />
                </View>
                <View style={[styles.talentArtworkPill, { backgroundColor: colors.teal + '18' }]}>
                  <Text style={[styles.talentArtworkPillText, { color: colors.teal }]}>+ impact</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.talentFormPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.talentSheetTitle, { color: colors.foreground }]}>Make room for good things.</Text>
          <Text style={[styles.talentSheetBody, { color: colors.mutedForeground }]}>Create your experience passport and start showing up for what matters.</Text>
          <View style={[styles.talentEmailRow, { borderColor: colors.input, backgroundColor: colors.background }]}>
            <Feather name="mail" size={20} color={colors.mutedForeground} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Your email"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.talentEmailInput, { color: colors.foreground, borderWidth: 0, borderColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, appearance: 'none' } as any]}
              accessibilityLabel="Email"
            />
          </View>
          <Button label="Build my passport" onPress={() => { triggerHaptic(); onContinue(); }} />
          <Text style={[styles.talentDividerText, { color: colors.mutedForeground }]}>or continue with</Text>
          <View style={styles.talentSocialRow}>
            <Button label="Google" variant="secondary" onPress={() => { triggerHaptic(); onContinue(); }} icon="chrome" style={styles.talentSocialButton} />
            <Button label="LinkedIn" variant="secondary" onPress={() => { triggerHaptic(); onContinue(); }} icon="linkedin" style={styles.talentSocialButton} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Onboarding({ user, guest = false, onDone }: { user: User; guest?: boolean; onDone: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const update = useUpdateMe();
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<ExperienceCategory[]>(user.interests ?? []);
  const [city, setCity] = useState(user.city ?? '');
  const [participationType, setParticipationType] = useState<ParticipationType>((user.participationType as ParticipationType) ?? 'join');
  const [bio, setBio] = useState(user.bio ?? '');
  const [name, setName] = useState(user.name);
  const totalSteps = 5;
  const next = async () => {
    triggerHaptic();
    if (step === 1 && !name.trim()) return;
    if (step === 2 && interests.length === 0) return;
    if (step === 3 && !city.trim()) return;
    if (step === totalSteps - 1) {
      if (guest) {
        onDone();
        return;
      }
      await update.mutateAsync({ data: { name: name.trim(), bio: bio.trim() || null, city: city.trim(), interests, participationType } });
      onDone();
      return;
    }
    setStep((value) => value + 1);
  };
  const previous = () => { triggerHaptic(); setStep((value) => Math.max(0, value - 1)); };
  const dots = Array.from({ length: totalSteps }, (_, index) => index);

  if (step === 0) {
    return <TalentWelcome onContinue={() => setStep(1)} />;
  }

  return (
    <KeyboardAvoidingView style={[styles.onboarding, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 18) : insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.onboardingTopBar}>
        {step > 0 ? <Pressable accessibilityLabel="Back" onPress={previous} style={[styles.onboardingBack, { backgroundColor: colors.muted }]}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable> : <View style={styles.onboardingBack} />}
        {step === 0 ? <Pressable onPress={() => setStep(1)}><Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip</Text></Pressable> : <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>0{step + 1} / 05</Text>}
      </View>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 ? <View style={styles.onboardingSlide}><View style={[styles.secondScreenIcon, { backgroundColor: colors.primary + '14' }]}><Feather name="user" size={32} color={colors.primary} /></View><Text style={[styles.onboardingEyebrow, { color: colors.primary }]}>STEP 01 · YOUR PASSPORT</Text><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>Let’s make it yours.</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>Tell us what people should call you when you show up. You can change this later.</Text><View style={styles.onboardingForm}><Text style={[styles.onboardingFieldLabel, { color: colors.foreground }]}>Display name</Text><View style={[styles.onboardingInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}><Feather name="smile" size={20} color={colors.mutedForeground} /><TextInput autoFocus value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingNameInput, { color: colors.foreground }]} /></View><Text style={[styles.inputHint, { color: colors.mutedForeground }]}>Your Telegram username stays connected automatically.</Text></View></View> : null}
        {step === 2 ? <View style={styles.onboardingSlide}><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>What matters to you?</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>Pick the causes you'd like to see first.</Text><View style={styles.onboardingChoices}>{categories.slice(1).map((item) => { const selected = interests.includes(item.key as ExperienceCategory); return <Pressable key={item.key} onPress={() => { triggerHaptic(); setInterests((current) => selected ? current.filter((value) => value !== item.key) : [...current, item.key as ExperienceCategory]); }} style={[styles.choiceCard, { backgroundColor: selected ? colors.primary + '10' : colors.card, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius }]}><Feather name={item.icon} size={24} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.choiceTitle, { color: selected ? colors.primary : colors.foreground }]}>{item.label}</Text><Feather name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? colors.primary : colors.border} /></Pressable>; })}</View></View> : null}
        {step === 3 ? <View style={styles.onboardingSlide}><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>Where will you show up?</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>We'll use your city to find nearby opportunities.</Text><View style={styles.onboardingForm}><TextInput autoFocus value={city} onChangeText={setCity} placeholder="e.g. London" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingNameInput, styles.cityInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]} /><Text style={[styles.formLabel, { color: colors.foreground }]}>I want to…</Text><View style={styles.onboardingChoices}>{(['join', 'host', 'both'] as ParticipationType[]).map((value) => { const selected = participationType === value; const labels = { join: 'Join experiences', host: 'Host experiences', both: 'Do both' }; return <Pressable key={value} onPress={() => { triggerHaptic(); setParticipationType(value); }} style={[styles.onboardingParticipationCard, { backgroundColor: selected ? colors.primary + '10' : colors.card, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius }]}><Text style={[styles.choiceTitle, { color: selected ? colors.primary : colors.foreground }]}>{labels[value]}</Text><Feather name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? colors.primary : colors.border} /></Pressable>; })}</View></View></View> : null}
        {step === 4 ? <View style={styles.onboardingSlide}><OnboardingArtwork variant="complete" /><Text style={[styles.onboardingSmallTitle, { color: colors.foreground, textAlign: 'center' }]}>We're all set!</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground, textAlign: 'center' }]}>You're ready to find your next good thing, {name.trim() || 'friend'}.</Text><TextInput value={bio} onChangeText={setBio} multiline placeholder="Add a short bio (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius, marginTop: 24 }]} /></View> : null}
      </ScrollView>
      <View style={styles.onboardingFooter}>
        <View style={styles.onboardingDots}>{dots.map((index) => <View key={index} style={[styles.onboardingDot, { backgroundColor: index === step ? colors.primary : colors.border }]} />)}</View>
        <Button label={update.isPending ? 'Saving…' : step === totalSteps - 1 ? "Let's go!" : 'Continue'} disabled={update.isPending || (step === 1 && !name.trim()) || (step === 2 && interests.length === 0) || (step === 3 && !city.trim())} onPress={() => void next()} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Home({ user, go }: { user: User; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const query = useListExperiences({ availableOnly: true });
  const participations = useListMyParticipations({ status: 'upcoming' });
  const items = query.data ?? [];
  const firstName = user.name.split(' ')[0];
  const upcomingCount = participations.data?.length ?? 0;
  const quickActions: Array<{ label: string; icon: IconName; screen: Screen }> = [
    { label: 'Explore', icon: 'compass', screen: 'explore' },
    { label: 'Journey', icon: 'calendar', screen: 'experiences' },
    { label: 'Passport', icon: 'award', screen: 'profile' },
    { label: 'Host', icon: 'plus-circle', screen: 'host' },
  ];

  return (
      <ScrollView
      style={[styles.dashboardScreen, { backgroundColor: colors.muted }]}
      contentContainerStyle={[styles.dashboardContent, { paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { triggerHaptic(); void query.refetch(); }} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.dashboardTopBar}>
        <View style={styles.dashboardBrand}>
          <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.dashboardBrandIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Feather name="star" size={16} color={colors.primaryForeground} />
          </LinearGradient>
          <Text style={[styles.dashboardBrandText, { color: colors.foreground }]}>experiences.fun</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open passport" onPress={() => { triggerHaptic(); go('profile'); }} style={[styles.dashboardAvatar, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.dashboardAvatarText, { color: colors.primary }]}>{firstName.charAt(0).toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={[styles.dashboardHero, { borderRadius: 30, overflow: 'hidden' }]}>
        <LinearGradient colors={[colors.secondary, colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.dashboardGlow, styles.dashboardGlowOne]} />
        <View style={[styles.dashboardGlow, styles.dashboardGlowTwo]} />
        <Text style={styles.dashboardWelcome}>WELCOME BACK</Text>
        <Text style={styles.dashboardName}>{firstName}</Text>
        <Text style={styles.dashboardHeroBody}>Your next good thing is closer than you think.</Text>

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
          <View style={[styles.dashboardPassportButton, { backgroundColor: colors.foreground }]}>
            <Text style={[styles.dashboardPassportButtonText, { color: colors.card }]}>View passport</Text>
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

      {query.isLoading ? <LoadingState /> : items.length ? items.slice(0, 3).map((item) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${item.title}`}
          key={item.id}
          onPress={() => { triggerHaptic(); go('experience', { id: String(item.id) }); }}
          style={({ pressed }) => [styles.dashboardEventCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.9 : 1 }]}
        >
          <LinearGradient colors={categoryGradients[item.category]} style={styles.dashboardEventIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Feather name={categoryIcon[item.category]} size={24} color={colors.primaryForeground} />
          </LinearGradient>
          <View style={styles.dashboardEventCopy}>
            <Text style={[styles.dashboardEventTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.dashboardEventMeta, { color: colors.mutedForeground }]}>{dateLabel(item.date)} · {item.city}</Text>
          </View>
          <View style={[styles.dashboardXpPill, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.dashboardXpText, { color: colors.primary }]}>+{item.xpReward} XP</Text>
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

      {query.isLoading ? <LoadingState /> : query.data?.length ? query.data.map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title="No experiences match" body="Try another category or come back when local hosts publish something new." />}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function Detail({ id, go }: { id: number; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useGetExperience(id, { query: { queryKey: getGetExperienceQueryKey(id), enabled: Number.isFinite(id) } });
  const join = useJoinExperience({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const submit = useSubmitCompletion({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const item = query.data as ExperienceDetail | undefined;

  if (query.isLoading || !item) return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Experience" onBack={() => go('explore')} />{query.isLoading ? <LoadingState /> : <EmptyState title="Experience unavailable" body="This experience may have been archived." />}</View>;

  const participation = item.participation as Participation | null;
  const gradient = categoryGradients[item.category] || categoryGradients.community;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <Header title="Details" onBack={() => go('explore')} />

        <View style={[styles.detailHero, { borderRadius: colors.radius, overflow: 'hidden' }]}>
          <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={styles.detailHeroContent}>
            <View style={[styles.detailHeroIcon, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
              <Feather name={categoryIcon[item.category]} size={36} color="#ffffff" />
            </View>
            <Text style={styles.detailCategoryText}>{categoryLabel[item.category]}</Text>
            <Text style={styles.detailTitleText}>{item.title}</Text>
            <Text style={styles.detailOrgText}>{item.organisation.name}{item.organisation.verified ? '  ·  Verified' : ''}</Text>
          </View>
        </View>

        <View style={styles.detailMetaGrid}>
          <View style={[styles.metaBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHEN</Text>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>{dateLabel(item.date)}</Text>
            <Text style={[styles.metaSub, { color: colors.mutedForeground }]}>{item.startTime} – {item.endTime}</Text>
          </View>
          <View style={[styles.metaBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHERE</Text>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>{item.city}</Text>
            <Text style={[styles.metaSub, { color: colors.mutedForeground }]}>{item.location}</Text>
          </View>
        </View>

        <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>About this experience</Text>
        <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.description}</Text>

        <View style={[styles.rewardPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.rewardCol}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>YOU'LL EARN</Text>
            <Text style={[styles.detailReward, { color: colors.primary }]}>+{item.xpReward} XP</Text>
          </View>
          {money(item.monetaryRewardPence) ? (
            <View style={styles.rewardCol}>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>REWARD</Text>
              <Text style={[styles.detailReward, { color: colors.success }]}>{money(item.monetaryRewardPence)}</Text>
            </View>
          ) : null}
          <View style={styles.rewardCol}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>PLACES</Text>
            <Text style={[styles.detailReward, { color: colors.foreground }]}>{item.availablePlaces}</Text>
          </View>
        </View>

        {item.whatYouWillDo ? (
          <View style={styles.infoBlock}>
            <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>What you'll do</Text>
            <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.whatYouWillDo}</Text>
          </View>
        ) : null}

        {item.whatToBring ? (
          <View style={styles.infoBlock}>
            <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>What to bring</Text>
            <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.whatToBring}</Text>
          </View>
        ) : null}

        <View style={{ height: 160 }} />
      </ScrollView>

      <View style={[styles.ctaWrap, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {item.joined && participation ? (
          <View>
            <View style={[styles.joinedBanner, { backgroundColor: colors.success + '15', borderRadius: colors.radius }]}>
              <Feather name="check-circle" size={28} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.joinedTitle, { color: colors.success }]}>You're participating</Text>
                <Text style={[styles.joinedSub, { color: colors.success }]}>{participation.status === 'verified' ? 'Completion verified and reward issued.' : participation.status === 'submitted' ? 'Awaiting host verification.' : 'Show up, then submit your completion.'}</Text>
              </View>
            </View>
            {['joined', 'attended'].includes(participation.status) ? (
              <Button label={participation.status === 'attended' ? 'Submit completion' : 'Waiting for host'} disabled={participation.status !== 'attended' || submit.isPending} onPress={() => void submit.mutateAsync({ participationId: participation.id })} />
            ) : null}
          </View>
        ) : (
          <Button label={join.isPending ? 'Joining…' : 'Join experience'} disabled={join.isPending || item.availablePlaces === 0} onPress={() => void join.mutateAsync({ experienceId: item.id })} />
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

      {data?.length ? data.map((item) => (
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

function Profile({ user, go }: { user: User; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const profile = useGetMe();
  const completed = useListMyParticipations({ status: 'completed' });
  const friends = useListFriends();
  const requests = useListFriendRequests();
  const update = useUpdateMe({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const createFriend = useCreateFriendRequest({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const accept = useAcceptFriendRequest({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState(user.city ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [username, setUsername] = useState('');
  const current = profile.data ?? user;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      <Header title="Passport" subtitle="Your contribution identity." />

      <View style={[styles.passportHero, { borderRadius: colors.radius, overflow: 'hidden' }]}>
        <LinearGradient colors={['#FF107A', '#6E00FF']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={styles.passportHeroContent}>
          <View style={[styles.passportAvatar, { backgroundColor: '#ffffff' }]}>
            <Text style={[styles.passportInitial, { color: colors.primary }]}>{current.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.passportIdentity}>
            <Text style={styles.passportName}>{current.name}</Text>
            <Text style={styles.passportHandle}>@{current.username ?? 'telegram'}</Text>
            <View style={styles.passportLevelPill}>
              <Text style={styles.passportLevelText}>{current.level.toUpperCase()}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Close profile editor' : 'Edit profile'} onPress={() => { triggerHaptic(); setEditing((value) => !value); }} style={[styles.iconButton, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Feather name={editing ? 'x' : 'edit-2'} size={20} color="#ffffff" />
          </Pressable>
        </View>
        <View style={styles.passportProgressContainer}>
          <View style={styles.passportProgressHeader}>
            <Text style={styles.passportProgressLabel}>{current.xp} XP total</Text>
            <Text style={styles.passportProgressLabel}>Contribution score</Text>
          </View>
        </View>
      </View>

      {editing ? (
        <View style={[styles.editPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
          <TextInput value={bio} onChangeText={setBio} multiline placeholder="Short bio" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, borderRadius: colors.radius }]} />
          <Button label={update.isPending ? 'Saving…' : 'Save profile'} disabled={update.isPending} onPress={() => void update.mutateAsync({ data: { city, bio: bio || null } }).then(() => setEditing(false))} />
        </View>
      ) : null}

      <View style={[styles.statsGrid, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{current.completedCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{current.hostedCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Hosted</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{friends.data?.length ?? 0}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Friends</Text>
        </View>
      </View>

      <ContributionDashboard user={current} completed={completed.data} />

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent impact</Text>
      {completed.data?.length ? completed.data.slice(0, 3).map((item) => (
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

      <View style={styles.socialHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Friends</Text>
      </View>
      <View style={[styles.friendAdd, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
        <TextInput accessibilityLabel="Friend username" value={username} onChangeText={setUsername} placeholder="@username" placeholderTextColor={colors.mutedForeground} style={[styles.friendInput, { color: colors.foreground }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Add friend" accessibilityState={{ disabled: !username.trim() || createFriend.isPending }} disabled={!username.trim() || createFriend.isPending} onPress={() => void createFriend.mutateAsync({ data: { username: username.replace(/^@/, '') } }).then(() => setUsername(''))} style={[styles.addButton, { backgroundColor: colors.primary, borderRadius: colors.radius - 4 }]}>
          <Feather name="user-plus" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>

      {requests.data?.map((request) => (
        <View key={request.id} style={[styles.requestRow, { backgroundColor: colors.secondary + '15', borderRadius: colors.radius }]}>
          <Text style={[styles.requestText, { color: colors.foreground }]}>{request.user.name} wants to connect</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${request.user.name}'s friend request`} onPress={() => void accept.mutateAsync({ requestId: request.id })}>
            <Text style={[styles.requestAction, { color: colors.secondary }]}>Accept</Text>
          </Pressable>
        </View>
      ))}

      {friends.data?.length ? <Text style={[styles.friendList, { color: colors.inkSoft }]}>{friends.data.map((friend) => `@${friend.username ?? friend.name}`).join('  ·  ')}</Text> : null}

      {current.participationType !== 'join' ? (
        <View style={{ marginTop: 32 }}>
          <Button label="Open host tools" variant="secondary" onPress={() => { triggerHaptic(); go('host'); }} />
        </View>
      ) : null}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function Host({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const overview = useGetHostOverview();
  const experiences = useListHostExperiences();
  const [selected, setSelected] = useState<number | null>(null);
  const participants = useListExperienceParticipants(selected ?? 0, { query: { enabled: selected !== null, queryKey: getListExperienceParticipantsQueryKey(selected ?? 0) } });
  const attend = useMarkAttendance({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const verify = useVerifyParticipation({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });
  const reject = useRejectParticipation({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); triggerHaptic(); } } });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      <Header title="Host tools" subtitle={overview.data?.organisation?.name ?? 'Create your first opportunity'} onBack={() => go('home')} />

      <View style={styles.hostStats}>
        {[['Upcoming', overview.data?.upcomingExperiences ?? 0], ['Participants', overview.data?.participantCount ?? 0], ['To verify', overview.data?.pendingVerifications ?? 0]].map(([label, value]) => (
          <View key={String(label)} style={[styles.hostStat, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.hostStatValue, { color: colors.foreground }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        ))}
      </View>

      <Button label="Create experience" icon="plus" onPress={() => { triggerHaptic(); go('create'); }} />

      <View style={styles.socialHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your experiences</Text>
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{experiences.data?.length ?? 0} published</Text>
      </View>

      {experiences.data?.length ? experiences.data.map((item) => (
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
          {participants.isLoading ? <LoadingState /> : participants.data?.length ? participants.data.map((item) => (
            <View key={item.id} style={[styles.participantRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.participantAvatar, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.participantInitial, { color: colors.primary }]}>{item.participant.name.charAt(0)}</Text>
              </View>
              <View style={styles.participantCopy}>
                <Text style={[styles.participantName, { color: colors.foreground }]}>{item.participant.name}</Text>
                <Text style={[styles.participantStatus, { color: colors.mutedForeground }]}>{item.participant.username ? `@${item.participant.username} · ` : ''}{item.status}</Text>
              </View>
              {item.status === 'joined' ? (
                <Button label="Attend" variant="secondary" onPress={() => void attend.mutateAsync({ participationId: item.id })} />
              ) : null}
              {item.status === 'submitted' ? (
                <View style={styles.actionPair}>
                  <Button label="Verify" onPress={() => void verify.mutateAsync({ participationId: item.id })} />
                  <Button label="Reject" variant="secondary" onPress={() => void reject.mutateAsync({ participationId: item.id })} />
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

function Create({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const create = useCreateExperience();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<ExperienceCreateInput>>({
    category: 'community',
    city: 'London',
    capacity: 12,
    xpReward: 150,
    monetaryRewardPence: null,
  });

  const set = (key: keyof ExperienceCreateInput, value: string | number | null) => {
    const numeric = key === 'capacity' || key === 'xpReward' || key === 'monetaryRewardPence';
    const nextValue = numeric ? (value === '' || value === null ? null : Number(value)) : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
  };

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
    step === 2 ? Boolean(form.title?.trim() && form.description?.trim() && form.category) :
    step === 3 ? Boolean(
      form.date?.trim()
      && form.startTime?.trim()
      && form.endTime?.trim()
      && form.location?.trim()
      && form.city?.trim()
      && Number(form.capacity) >= 1
      && Number(form.xpReward) >= 0,
    ) :
    valid;

  const publish = async () => {
    triggerHaptic();
    if (!valid || create.isPending) return;
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

  const stepTitles = ['Tell us about you', 'Shape the idea', 'Set the scene', 'Make it yours'];
  const stepDescriptions = [
    'Every great gathering starts with a good host.',
    'Give your idea a little shape — you can change it later.',
    'A few details help the right people show up.',
    'Add the magic, then take a look before you share it.',
  ];

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.createContent, { paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 60) : insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.createTopBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? 'Close create experience' : 'Previous step'}
            onPress={() => { triggerHaptic(); step > 1 ? setStep((current) => current - 1) : go('host'); }}
            style={[styles.createRoundButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
          >
            <Feather name={step === 1 ? 'x' : 'arrow-left'} size={22} color={colors.foreground} />
          </Pressable>
          <View accessibilityLabel={`Step ${step} of 4`} style={styles.createProgress}>
            {[1, 2, 3, 4].map((item) => (
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
          <Text style={[styles.createStepCount, { color: colors.mutedForeground }]}>{step}/4</Text>
        </View>

        <View style={styles.createHeading}>
          <Text style={[styles.createEyebrow, { color: colors.primary }]}>CREATE EXPERIENCE</Text>
          <Text style={[styles.createTitle, { color: colors.foreground }]}>{stepTitles[step - 1]}</Text>
          <Text style={[styles.createDescription, { color: colors.mutedForeground }]}>{stepDescriptions[step - 1]}</Text>
        </View>

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

          {step === 3 && (
            <>
              <View style={styles.createFieldRow}>
                <View style={styles.createFieldHalf}>{field('date', 'Date', 'YYYY-MM-DD')}</View>
                <View style={styles.createFieldHalf}>{field('city', 'City', 'London')}</View>
              </View>
              <View style={styles.createFieldRow}>
                <View style={styles.createFieldHalf}>{field('startTime', 'Starts', '10:00')}</View>
                <View style={styles.createFieldHalf}>{field('endTime', 'Ends', '13:00')}</View>
              </View>
              {field('location', 'Meeting point', 'A clear place people can find')}
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
            </>
          )}

          {step === 4 && (
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

        {create.isError && (
          <Text accessibilityRole="alert" style={[styles.createError, { color: colors.destructive }]}>
            We couldn’t publish this experience. Please try again.
          </Text>
        )}

        <View style={styles.createActions}>
          {step === 4 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start over"
              onPress={() => { triggerHaptic(); setStep(1); }}
              style={[styles.createReset, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 8 }]}
            >
              <Feather name="rotate-ccw" size={20} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue || create.isPending }}
            disabled={!canContinue || create.isPending}
            onPress={() => { triggerHaptic(); step < 4 ? setStep((current) => current + 1) : void publish(); }}
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
                  <Text style={[styles.createPrimaryText, { color: canContinue ? colors.primaryForeground : colors.mutedForeground }]}>{step === 4 ? 'Publish experience' : 'Keep going'}</Text>
                  <Feather name={step === 4 ? 'send' : 'arrow-right'} size={20} color={canContinue ? colors.primaryForeground : colors.mutedForeground} />
                </>
              )}
          </Pressable>
        </View>
        <Text style={styles.createFooterNote}>
          {step === 4 ? 'You can edit the details after publishing.' : 'Nothing is published until you say so.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BottomNav({ active, go }: { active: Screen; go: (screen: Screen) => void }) {
  const colors = useColors();
  const items: Array<{ key: Screen; label: string; icon: IconName }> = [
    { key: 'home', label: 'Home', icon: 'home' }, 
    { key: 'explore', label: 'Explore', icon: 'compass' }, 
    { key: 'experiences', label: 'Journey', icon: 'calendar' }, 
    { key: 'profile', label: 'Passport', icon: 'user' }
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

export default function App() {
  const params = useLocalSearchParams<{ screen?: string; id?: string; onboarded?: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const colors = useColors();
  const [onboarded, setOnboarded] = useState(false);
  const [screen, setScreen] = useState<Screen>((params.screen as Screen) || 'home');
  const [experienceId, setExperienceId] = useState(params.id);
  const displayUser = user ?? guestUser;
  const guestOnboarded = onboarded || params.onboarded === '1';

  const go = (next: Screen, nextParams?: Record<string, string>) => {
    setScreen(next);
    if (nextParams?.id) setExperienceId(nextParams.id);
    router.setParams({ screen: next, onboarded: guestOnboarded ? '1' : undefined, ...nextParams });
  };

  const needsOnboarding = Boolean((!user || !user.city || !user.interests?.length || !user.participationType) && !guestOnboarded);

  const content = (() => {
    if (screen === 'experience') return <Detail id={Number(experienceId)} go={go} />;
    if (screen === 'explore') return <Explore go={go} />;
    if (screen === 'experiences') return <Experiences go={go} />;
    if (screen === 'profile') return <Profile user={displayUser} go={go} />;
    if (screen === 'host') return <Host go={go} />;
    if (screen === 'create') return <Create go={go} />;
    return <Home user={displayUser} go={go} />;
  })();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Connecting to experiences.fun…</Text>
      </View>
    );
  }

  if (needsOnboarding) {
    return <Onboarding user={displayUser} guest={!user} onDone={() => {
      setOnboarded(true);
      setScreen('home');
      if (!user) router.setParams({ screen: 'home', onboarded: '1' });
    }} />;
  }

  const noNav = ['experience', 'create', 'host'].includes(screen);
  return (
    <View style={[styles.app, { backgroundColor: colors.background }]}>
      {content}
      {!noNav ? <BottomNav active={screen} go={go} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 20 },
  header: { paddingBottom: 24, flexDirection: 'row', alignItems: 'flex-start' },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 4 },

  button: { minHeight: 56, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  emptyState: { padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginVertical: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },

  loading: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 16, fontSize: 15, fontFamily: 'Inter_500Medium' },
  
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
  talentTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  talentBrandMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talentBrandIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  talentBrand: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
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
  talentFormPanel: { gap: 12, marginHorizontal: -8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderWidth: 1, borderRadius: 28, shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 3 },
  talentSheetTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  talentSheetBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 2 },
  talentEmailRow: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16 },
  talentSocialRow: { flexDirection: 'row', gap: 10 },
  talentSocialButton: { flex: 1, minHeight: 50, paddingHorizontal: 8 },
  talentEmailInput: { flex: 1, height: 50, paddingHorizontal: 0, fontSize: 16, fontFamily: 'Inter_400Regular' },
  talentDividerText: { textAlign: 'center', fontSize: 14, fontFamily: 'Inter_500Medium', marginVertical: 2 },
  
  onboarding: { flex: 1 },
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
  dashboardTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  dashboardBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dashboardBrandIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dashboardBrandText: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  dashboardAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dashboardAvatarText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  dashboardHero: { minHeight: 276, paddingHorizontal: 24, paddingTop: 38, marginBottom: -34, position: 'relative' },
  dashboardGlow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999 },
  dashboardGlowOne: { width: 220, height: 220, right: -82, top: -82 },
  dashboardGlowTwo: { width: 160, height: 160, left: -60, bottom: -76 },
  dashboardWelcome: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textAlign: 'center', marginBottom: 5 },
  dashboardName: { color: '#ffffff', fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: -0.8 },
  dashboardHeroBody: { color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  dashboardStatusStrip: { minHeight: 72, borderRadius: 22, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 22 },
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
  dashboardEventCard: { minHeight: 76, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
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
  detailHero: { height: 240, marginBottom: 24, justifyContent: 'flex-end', padding: 24 },
  detailHeroContent: { position: 'relative', zIndex: 10 },
  detailHeroIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  detailCategoryText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  detailTitleText: { color: '#ffffff', fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34, marginBottom: 8 },
  detailOrgText: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontFamily: 'Inter_500Medium' },
  detailMetaGrid: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  metaBox: { flex: 1 },
  metaLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 8 },
  metaValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  metaSub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  detailSectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  detailBody: { fontSize: 16, fontFamily: 'Inter_400Regular', lineHeight: 24, marginBottom: 32 },
  rewardPanel: { flexDirection: 'row', borderWidth: 1, padding: 20, marginBottom: 32 },
  rewardCol: { flex: 1 },
  detailReward: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  infoBlock: { marginBottom: 32 },
  ctaWrap: { marginTop: 8 },
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
  passportHero: { minHeight: 280, marginBottom: 24 },
  passportHeroContent: { padding: 24, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-start' },
  passportAvatar: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  passportInitial: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  passportIdentity: { flex: 1, justifyContent: 'center', paddingTop: 4 },
  passportName: { color: '#ffffff', fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  passportHandle: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontFamily: 'Inter_500Medium', marginBottom: 12 },
  passportLevelPill: { backgroundColor: '#ffffff', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  passportLevelText: { color: '#FF107A', fontSize: 12, fontFamily: 'Inter_700Bold' },
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  passportProgressContainer: { backgroundColor: 'rgba(0,0,0,0.1)', padding: 20, marginTop: 'auto' },
  passportProgressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  passportProgressLabel: { color: '#ffffff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  
  editPanel: { padding: 20, borderWidth: 1, marginBottom: 24, gap: 16 },
  input: { height: 56, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  bioInput: { height: 100, paddingTop: 16, textAlignVertical: 'top' },
  
  statsGrid: { flexDirection: 'row', borderWidth: 1, paddingVertical: 20, marginBottom: 32 },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  statDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.05)' },

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
  
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  historyDot: { width: 12, height: 12, borderRadius: 6, marginRight: 16 },
  historyCopy: { flex: 1 },
  historyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  historySub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  historyRewardPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  historyRewardText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  mutedParagraph: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 16, marginBottom: 24 },
  
  socialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 16 },
  friendAdd: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, height: 56, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  friendInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular' },
  addButton: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  requestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, marginBottom: 12 },
  requestText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  requestAction: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  friendList: { fontSize: 15, fontFamily: 'Inter_500Medium', lineHeight: 24, marginTop: 8 },
  
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
  createInput: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, fontFamily: 'Inter_400Regular' },
  createTextArea: { height: 96, paddingTop: 14, textAlignVertical: 'top' },
  createFieldRow: { flexDirection: 'row', gap: 12 },
  createFieldHalf: { flex: 1 },
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

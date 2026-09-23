import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'alternative';
  disabled?: boolean;
  icon?: IconName;
  style?: any;
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
    borderWidth = 1;
  } else if (variant === 'alternative') {
    bg = colors.secondary;
    fg = colors.secondaryForeground;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth,
          borderRadius: colors.radius,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style
      ]}
    >
      {icon ? <Feather name={icon} size={18} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 16 }]}>
      {onBack && (
        <Pressable accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      )}
      <View style={styles.headerCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>EXPERIENCES.FUN</Text>
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
        <Feather name={icon} size={24} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
      {onAction && actionLabel && (
        <View style={{ marginTop: 24 }}>
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
  
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${item.title} by ${item.organisation.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.experienceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <LinearGradient colors={gradient} style={styles.cardImage}>
        <Feather name={icon} size={48} color="#ffffff" style={{ opacity: 0.3 }} />
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
            <Feather name={icon} size={14} color={colors.primary} />
            <Text style={[styles.detailText, { color: colors.foreground }]}>{categoryLabel[item.category]}</Text>
          </View>
          <View style={styles.detailItem}>
            <Feather name="calendar" size={14} color={colors.mutedForeground} />
            <Text style={[styles.detailText, { color: colors.mutedForeground }]}>{dateLabel(item.date)} · {item.startTime}</Text>
          </View>
          <View style={styles.detailItem}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text style={[styles.detailText, { color: colors.mutedForeground }]}>{item.city}</Text>
          </View>
          <View style={styles.detailItem}>
            <Feather name="users" size={14} color={colors.mutedForeground} />
            <Text style={[styles.detailText, { color: item.availablePlaces < 4 ? colors.primary : colors.mutedForeground }]}>{item.availablePlaces} spots left</Text>
          </View>
        </View>
        <View style={styles.cardAction}>
          <Text style={[styles.cardActionText, { color: colors.primary }]}>View experience</Text>
          <Feather name="arrow-right" size={15} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

function LoadingState() {
  const colors = useColors();
  return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading experiences…</Text></View>;
}
function OnboardingArtwork({ variant }: { variant: 'welcome' | 'complete' }) {
  const colors = useColors();
  return (
    <View style={styles.onboardingArtwork}>
      <LinearGradient colors={['#F20789', '#6805F2']} style={[styles.artworkBlob, { width: 140, height: 140, borderRadius: 70, left: 20, top: 20, opacity: 0.8 }]} />
      <LinearGradient colors={['#6805F2', '#04ADBF']} style={[styles.artworkBlob, { width: 100, height: 100, borderRadius: 50, right: 30, bottom: 30, opacity: 0.8 }]} />
      <View style={[styles.artworkCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name={variant === 'welcome' ? 'users' : 'check'} size={44} color={colors.foreground} />
      </View>
    </View>
  );
}

function TalentWelcome({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [email, setEmail] = useState('lucia.bell@dka.io');

  return (
    <KeyboardAvoidingView style={styles.talentScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.talentShell, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 14), paddingBottom: Math.max(insets.bottom, 24), backgroundColor: colors.muted }]}>
        <View style={styles.talentTopBar}>
          <View style={styles.talentBrandMark}>
            <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.talentBrandIcon}>
              <Feather name="star" size={16} color={colors.primaryForeground} />
            </LinearGradient>
            <Text style={[styles.talentBrand, { color: colors.foreground }]}>experiences.fun</Text>
          </View>
          <View style={[styles.talentTopAction, { backgroundColor: colors.card }]}>
            <Feather name="heart" size={16} color={colors.primary} />
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
          <Text style={[styles.talentSheetKicker, { color: colors.primary }]}>WELCOME TO EXPERIENCES.FUN</Text>
          <Text style={[styles.talentSheetTitle, { color: colors.foreground }]}>Make room for good things.</Text>
          <Text style={[styles.talentSheetBody, { color: colors.mutedForeground }]}>Create your experience passport and start showing up for what matters.</Text>
          <View style={styles.talentEmailRow}>
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Your email"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.talentEmailInput, { color: colors.foreground }]}
              accessibilityLabel="Email"
            />
          </View>
          <Button label="Build my passport" onPress={onContinue} />
          <Text style={[styles.talentDividerText, { color: colors.mutedForeground }]}>or continue with</Text>
          <View style={styles.talentSocialRow}>
            <Button label="Google" variant="secondary" onPress={onContinue} icon="chrome" style={styles.talentSocialButton} />
            <Button label="LinkedIn" variant="secondary" onPress={onContinue} icon="linkedin" style={styles.talentSocialButton} />
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
  const previous = () => setStep((value) => Math.max(0, value - 1));
  const dots = Array.from({ length: totalSteps }, (_, index) => index);

  if (step === 0) {
    return <TalentWelcome onContinue={() => setStep(1)} />;
  }

  return (
    <KeyboardAvoidingView style={[styles.onboarding, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 18) : insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.onboardingTopBar}>
        {step > 0 ? <Pressable accessibilityLabel="Back" onPress={previous} style={styles.onboardingBack}><Feather name="arrow-left" size={24} color={colors.foreground} /></Pressable> : <View style={styles.onboardingBack} />}
        {step === 0 ? <Pressable onPress={() => setStep(1)}><Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip</Text></Pressable> : <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>0{step + 1} / 05</Text>}
      </View>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 ? <View style={styles.onboardingSlide}><View style={[styles.secondScreenIcon, { backgroundColor: colors.primary + '14' }]}><Feather name="user" size={28} color={colors.primary} /></View><Text style={[styles.onboardingEyebrow, { color: colors.primary }]}>STEP 01 · YOUR PASSPORT</Text><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>Let’s make it yours.</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>Tell us what people should call you when you show up. You can change this later.</Text><View style={styles.onboardingForm}><Text style={[styles.onboardingFieldLabel, { color: colors.foreground }]}>Display name</Text><View style={[styles.onboardingInputRow, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}><Feather name="smile" size={18} color={colors.mutedForeground} /><TextInput autoFocus value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingNameInput, { color: colors.foreground }]} /></View><Text style={[styles.inputHint, { color: colors.mutedForeground }]}>Your Telegram username stays connected automatically.</Text></View></View> : null}
        {step === 2 ? <View style={styles.onboardingSlide}><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>What matters to you?</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>Pick the causes you'd like to see first.</Text><View style={styles.onboardingChoices}>{categories.slice(1).map((item) => { const selected = interests.includes(item.key as ExperienceCategory); return <Pressable key={item.key} onPress={() => setInterests((current) => selected ? current.filter((value) => value !== item.key) : [...current, item.key as ExperienceCategory])} style={[styles.choiceCard, { backgroundColor: selected ? colors.primary + '10' : colors.card, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius }]}><Feather name={item.icon} size={24} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.choiceTitle, { color: colors.foreground }]}>{item.label}</Text><Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.primary : colors.border} /></Pressable>; })}</View></View> : null}
        {step === 3 ? <View style={styles.onboardingSlide}><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>Where will you show up?</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>We'll use your city to find nearby opportunities.</Text><View style={styles.onboardingForm}><TextInput autoFocus value={city} onChangeText={setCity} placeholder="e.g. London" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingNameInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]} /><Text style={[styles.formLabel, { color: colors.foreground }]}>I want to…</Text><View style={styles.onboardingChoices}>{(['join', 'host', 'both'] as ParticipationType[]).map((value) => { const selected = participationType === value; const labels = { join: 'Join experiences', host: 'Host experiences', both: 'Do both' }; return <Pressable key={value} onPress={() => setParticipationType(value)} style={[styles.participationCard, { backgroundColor: selected ? colors.primary + '10' : colors.card, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>{labels[value]}</Text><Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.primary : colors.border} /></Pressable>; })}</View></View></View> : null}
        {step === 4 ? <View style={styles.onboardingSlide}><OnboardingArtwork variant="complete" /><Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>We're all set!</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>You're ready to find your next good thing, {name.trim() || 'friend'}.</Text><TextInput value={bio} onChangeText={setBio} multiline placeholder="Add a short bio (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius, marginTop: 24 }]} /></View> : null}
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
  const query = useListExperiences({ availableOnly: true });
  const participations = useListMyParticipations({ status: 'upcoming' });
  const items = query.data ?? [];
  const firstName = user.name.split(' ')[0];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}>
      <Header title={`Good morning, ${firstName}`} subtitle="Make an impact near you." />
      
      <View style={[styles.impactBanner, { borderRadius: colors.radius, overflow: 'hidden' }]}>
        <LinearGradient colors={['#F20789', '#6805F2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.bannerCopy}>
          <Text style={styles.bannerKicker}>YOUR NEXT GOOD THING</Text>
          <Text style={styles.bannerTitle}>Small actions.{'\n'}Real impact.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Explore experiences" onPress={() => go('explore')} style={styles.bannerLinkBox}>
            <Text style={styles.bannerLinkText}>Explore experiences</Text>
            <Feather name="arrow-right" size={16} color="#F20789" />
          </Pressable>
        </View>
        <Feather name="feather" size={120} color="#ffffff" style={styles.bannerIcon} />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recommended for you</Text>
        </View>
        <Pressable onPress={() => go('explore')}><Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text></Pressable>
      </View>

      {query.isLoading ? <LoadingState /> : items.length ? items.slice(0, 3).map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title="Your next experience is waiting" body="There are no published opportunities yet. Hosts can create the first one from Host tools." icon="feather" />}
      
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your progress</Text>
        </View>
        <Pressable onPress={() => go('profile')}><Text style={[styles.seeAll, { color: colors.primary }]}>Passport</Text></Pressable>
      </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Open your experience passport" onPress={() => go('profile')} style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.progressTop}>
          <View>
            <Text style={[styles.progressLevel, { color: colors.foreground }]}>{user.level}</Text>
            <Text style={[styles.progressXp, { color: colors.mutedForeground }]}>{user.xp} XP earned</Text>
          </View>
          <View style={[styles.xpBadgeLg, { backgroundColor: colors.primary + '15' }]}>
            <Feather name="trending-up" size={24} color={colors.primary} />
          </View>
        </View>
        <Text style={[styles.progressCaption, { color: colors.mutedForeground }]}>{participations.data?.length ?? 0} upcoming {participations.data?.length === 1 ? 'experience' : 'experiences'}</Text>
      </Pressable>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
function Explore({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const [category, setCategory] = useState<ExperienceCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const query = useListExperiences({ category: category === 'all' ? undefined : category, search: search.trim() || undefined, availableOnly: true });
  
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <Header title="Explore" subtitle="Find your next way to contribute." />
      
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius }]}>
        <Feather name="search" size={20} color={colors.mutedForeground} />
        <TextInput accessibilityLabel="Search experiences" value={search} onChangeText={setSearch} placeholder="Search experiences" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {categories.map((item) => { 
          const selected = category === item.key; 
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={item.key} onPress={() => setCategory(item.key)} style={[styles.filter, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
              <Feather name={item.icon} size={16} color={selected ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
            </Pressable>
          ); 
        })}
      </ScrollView>
      
      <View style={styles.resultsHeading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available now</Text>
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{query.data?.length ?? 0} opportunities</Text>
      </View>
      
      {query.isLoading ? <LoadingState /> : query.data?.length ? query.data.map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title="No experiences match yet" body="Try another category or come back when local hosts publish something new." />}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function Detail({ id, go }: { id: number; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useGetExperience(id, { query: { queryKey: getGetExperienceQueryKey(id), enabled: Number.isFinite(id) } });
  const join = useJoinExperience({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const submit = useSubmitCompletion({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const item = query.data as ExperienceDetail | undefined;
  
  if (query.isLoading || !item) return <View style={[styles.screen, { backgroundColor: colors.background }]}><Header title="Experience" onBack={() => go('explore')} />{query.isLoading ? <LoadingState /> : <EmptyState title="Experience unavailable" body="This experience may have been archived." />}</View>;
  
  const participation = item.participation as Participation | null;
  const gradient = categoryGradients[item.category] || categoryGradients.community;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <Header title="Details" onBack={() => go('explore')} />
      
      <View style={[styles.detailHero, { borderRadius: colors.radius, overflow: 'hidden' }]}>
        <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        <View style={styles.detailHeroContent}>
          <View style={[styles.detailHeroIcon, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
            <Feather name={categoryIcon[item.category]} size={32} color="#ffffff" />
          </View>
          <Text style={styles.detailCategoryText}>{categoryLabel[item.category]}</Text>
          <Text style={styles.detailTitleText}>{item.title}</Text>
          <Text style={styles.detailOrgText}>{item.organisation.name}{item.organisation.verified ? '  ·  Verified' : ''}</Text>
        </View>
      </View>

      <View style={styles.detailMetaGrid}>
        <View style={styles.metaBox}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHEN</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>{dateLabel(item.date)}</Text>
          <Text style={[styles.metaSub, { color: colors.mutedForeground }]}>{item.startTime} – {item.endTime}</Text>
        </View>
        <View style={styles.metaBox}>
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

      <View style={styles.ctaWrap}>
        {item.joined && participation ? (
          <View>
            <View style={[styles.joinedBanner, { backgroundColor: colors.success + '15', borderRadius: colors.radius }]}>
              <Feather name="check-circle" size={24} color={colors.success} />
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
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
function Experiences({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const upcoming = useListMyParticipations({ status: 'upcoming' });
  const completed = useListMyParticipations({ status: 'completed' });
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming');
  const data = tab === 'upcoming' ? upcoming.data : completed.data;
  
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <Header title="My experiences" subtitle="Your contribution, in progress." />
      <View style={[styles.segment, { backgroundColor: colors.muted }]}>
        {(['upcoming', 'completed'] as const).map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.segmentItem, tab === key && { backgroundColor: colors.card }]}>
            <Text style={[styles.segmentText, { color: tab === key ? colors.foreground : colors.mutedForeground }]}>{key === 'upcoming' ? 'Upcoming' : 'Completed'}</Text>
          </Pressable>
        ))}
      </View>
      
      {data?.length ? data.map((item) => (
        <Pressable key={item.id} onPress={() => go('experience', { id: String(item.experience.id) })} style={[styles.participationCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.cardTop}>
            <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name={categoryIcon[item.experience.category]} size={20} color={colors.primary} />
            </View>
            <View style={styles.cardCategory}>
              <Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{dateLabel(item.experience.date)}</Text>
              <Text style={[styles.cardTitleSmall, { color: colors.foreground }]}>{item.experience.title}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
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
          onAction={tab === 'upcoming' ? () => go('explore') : undefined}
        />
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function Profile({ user, go }: { user: User; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const profile = useGetMe();
  const completed = useListMyParticipations({ status: 'completed' });
  const friends = useListFriends();
  const requests = useListFriendRequests();
  const update = useUpdateMe({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const createFriend = useCreateFriendRequest({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const accept = useAcceptFriendRequest({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState(user.city ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [username, setUsername] = useState('');
  const current = profile.data ?? user;
  
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <Header title="Passport" subtitle="Your contribution identity." />
      
      <View style={[styles.passportHero, { borderRadius: colors.radius, overflow: 'hidden' }]}>
        <LinearGradient colors={['#F20789', '#6805F2']} style={StyleSheet.absoluteFill} />
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
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Close profile editor' : 'Edit profile'} onPress={() => setEditing((value) => !value)} style={[styles.iconButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Add friend" accessibilityState={{ disabled: !username.trim() || createFriend.isPending }} disabled={!username.trim() || createFriend.isPending} onPress={() => void createFriend.mutateAsync({ data: { username: username.replace(/^@/, '') } }).then(() => setUsername(''))} style={[styles.addButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
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
        <View style={{ marginTop: 24 }}>
          <Button label="Open host tools" variant="secondary" onPress={() => go('host')} />
        </View>
      ) : null}
      <View style={{ height: 100 }} />
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
  const attend = useMarkAttendance({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const verify = useVerifyParticipation({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  const reject = useRejectParticipation({ mutation: { onSuccess: () => { void queryClient.invalidateQueries(); } } });
  
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <Header title="Host tools" subtitle={overview.data?.organisation?.name ?? 'Create your first opportunity'} onBack={() => go('home')} />
      
      <View style={styles.hostStats}>
        {[['Upcoming', overview.data?.upcomingExperiences ?? 0], ['Participants', overview.data?.participantCount ?? 0], ['To verify', overview.data?.pendingVerifications ?? 0]].map(([label, value]) => (
          <View key={String(label)} style={[styles.hostStat, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.hostStatValue, { color: colors.foreground }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        ))}
      </View>
      
      <Button label="Create experience" icon="plus" onPress={() => go('create')} />
      
      <View style={styles.socialHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your experiences</Text>
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{experiences.data?.length ?? 0} published</Text>
      </View>
      
      {experiences.data?.length ? experiences.data.map((item) => (
        <Pressable key={item.id} onPress={() => setSelected(selected === item.id ? null : item.id)} style={[styles.participationCard, { backgroundColor: selected === item.id ? colors.primary + '10' : colors.card, borderColor: selected === item.id ? colors.primary : colors.border, borderRadius: colors.radius }]}>
          <View style={styles.cardTop}>
            <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name={categoryIcon[item.category]} size={20} color={colors.primary} />
            </View>
            <View style={styles.cardCategory}>
              <Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{dateLabel(item.date)} · {item.availablePlaces} spots left</Text>
              <Text style={[styles.cardTitleSmall, { color: colors.foreground }]}>{item.title}</Text>
            </View>
            <Feather name={selected === item.id ? 'chevron-down' : 'chevron-right'} size={20} color={colors.mutedForeground} />
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
              {item.status === 'verified' ? <Feather name="check-circle" size={24} color={colors.success} /> : null}
            </View>
          )) : <EmptyState title="No participants yet" body="When people join, you'll manage attendance and completion here." icon="users" />}
        </View>
      ) : null}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function Create({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const create = useCreateExperience();
  const [form, setForm] = useState<Partial<ExperienceCreateInput>>({ category: 'community', capacity: 10, xpReward: 100, monetaryRewardPence: null });
  
  const set = (key: keyof ExperienceCreateInput, value: string | number | null) => {
    const numeric = key === 'capacity' || key === 'xpReward' || key === 'monetaryRewardPence';
    const nextValue = numeric ? (value === '' || value === null ? null : Number(value)) : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
  };
  
  const valid = Boolean(form.organisationName && form.title && form.description && form.date && form.startTime && form.endTime && form.location && form.city && form.capacity && form.xpReward);
  const publish = async () => { if (!valid) return; await create.mutateAsync({ data: form as ExperienceCreateInput }); go('host'); };
  
  const field = (key: keyof ExperienceCreateInput, placeholder: string, multiline = false) => (
    <TextInput 
      value={form[key] == null ? '' : String(form[key])} 
      onChangeText={(value) => set(key, value)} 
      placeholder={placeholder} 
      placeholderTextColor={colors.mutedForeground} 
      multiline={multiline} 
      style={[styles.input, multiline && styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, borderRadius: colors.radius }]} 
    />
  );

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Header title="Create experience" subtitle="Give your community a way to show up." onBack={() => go('host')} />
        
        <Text style={[styles.formSection, { color: colors.primary }]}>ORGANISATION</Text>
        {field('organisationName', 'Organisation name')}
        {field('organisationDescription', 'What does your organisation do?', true)}
        
        <Text style={[styles.formSection, { color: colors.primary }]}>THE EXPERIENCE</Text>
        {field('title', 'Experience title')}
        {field('description', 'Describe what participants will do', true)}
        
        <View style={styles.choiceGrid}>
          {categories.slice(1).map((item) => (
            <Pressable key={item.key} onPress={() => set('category', item.key)} style={[styles.smallChoice, { backgroundColor: form.category === item.key ? colors.primary + '15' : colors.card, borderColor: form.category === item.key ? colors.primary : colors.border, borderRadius: colors.radius }]}>
              <Feather name={item.icon} size={20} color={form.category === item.key ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.smallChoiceText, { color: colors.foreground }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        
        <Text style={[styles.formSection, { color: colors.primary }]}>WHEN & WHERE</Text>
        {field('date', 'Date (YYYY-MM-DD)')}
        {field('startTime', 'Start time (e.g. 10:00)')}
        {field('endTime', 'End time (e.g. 13:00)')}
        {field('location', 'Meeting point')}
        {field('city', 'City')}
        
        <Text style={[styles.formSection, { color: colors.primary }]}>CAPACITY & REWARDS</Text>
        {field('capacity', 'Maximum participants')}
        {field('xpReward', 'XP reward')}
        {field('monetaryRewardPence', 'Money reward in pence (optional)')}
        <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>For example, enter 2000 for a £20 reward.</Text>
        
        {field('whatYouWillDo', 'What will participants do?', true)}
        {field('whatToBring', 'What should participants bring?', true)}
        
        <View style={{ marginTop: 24 }}>
          <Button label={create.isPending ? 'Publishing…' : 'Publish experience'} disabled={!valid || create.isPending} onPress={() => void publish()} />
        </View>
        <View style={{ height: 100 }} />
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
    <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'web' ? 34 : 24 }]}>
      {items.map((item) => { 
        const selected = active === item.key; 
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }} key={item.key} onPress={() => go(item.key)} style={styles.navItem}>
            <Feather name={item.icon} size={24} color={selected ? colors.primary : colors.mutedForeground} style={{ marginBottom: 4 }} />
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
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Connecting to Telegram…</Text>
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
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4 },
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
  experienceCard: { borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
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
  cardAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 16 },
  cardActionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  
  // Talent / Onboarding
  talentScreen: { flex: 1 },
  talentShell: { flex: 1, paddingHorizontal: 24 },
  talentTop: { flex: 1, justifyContent: 'center' },
  talentTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  talentBrandMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talentBrandIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  talentBrand: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  talentTopAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
  talentSheetKicker: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  talentSheetTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  talentSheetBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 2 },
  talentEmailRow: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16 },
  talentSocialRow: { flexDirection: 'row', gap: 10 },
  talentSocialButton: { flex: 1, minHeight: 50, paddingHorizontal: 8 },
  talentFieldLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  talentEmailInput: { height: 56, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
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
  inputHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 8 },
  onboardingChoices: { gap: 12 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderWidth: 1 },
  choiceTitle: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold', marginLeft: 16 },
  formLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 24, marginBottom: 8 },
  participationCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderWidth: 1, marginBottom: 12 },
  onboardingArtwork: { height: 200, marginBottom: 40, alignItems: 'center', justifyContent: 'center' },
  artworkBlob: { position: 'absolute' },
  artworkCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  onboardingFooter: { paddingHorizontal: 24, paddingTop: 16 },
  onboardingDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4 },
  
  // Home
  impactBanner: { padding: 24, marginBottom: 32, minHeight: 180, justifyContent: 'center' },
  bannerCopy: { position: 'relative', zIndex: 10 },
  bannerKicker: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 8 },
  bannerTitle: { color: '#ffffff', fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34, marginBottom: 16 },
  bannerLinkBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 8 },
  bannerLinkText: { color: '#F20789', fontSize: 14, fontFamily: 'Inter_700Bold' },
  bannerIcon: { position: 'absolute', right: -20, bottom: -20, opacity: 0.1, zIndex: 1 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, marginTop: 16 },
  sectionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  seeAll: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  
  progressCard: { padding: 20, borderWidth: 1, marginBottom: 24 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  progressLevel: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  progressXp: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  xpBadgeLg: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%' },
  progressCaption: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  
  // Explore
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, borderWidth: 1, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 16, fontFamily: 'Inter_400Regular' },
  filterRow: { gap: 12, paddingBottom: 24 },
  filter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, gap: 8 },
  filterText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  resultsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 },
  resultCount: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  
  // Details
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
  
  // Journey/Experiences
  segment: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 24 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  segmentText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  categoryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardCategory: { flex: 1 },
  categoryText: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 2 },
  cardTitleSmall: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  places: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  
  // Passport Profile
  passportHero: { minHeight: 280, marginBottom: 24 },
  passportHeroContent: { padding: 24, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-start' },
  passportAvatar: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  passportInitial: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  passportIdentity: { flex: 1, justifyContent: 'center', paddingTop: 4 },
  passportName: { color: '#ffffff', fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  passportHandle: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontFamily: 'Inter_500Medium', marginBottom: 12 },
  passportLevelPill: { backgroundColor: '#ffffff', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  passportLevelText: { color: '#F20789', fontSize: 12, fontFamily: 'Inter_700Bold' },
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  passportProgressContainer: { backgroundColor: 'rgba(0,0,0,0.1)', padding: 20, marginTop: 'auto' },
  passportProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  passportProgressLabel: { color: '#ffffff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  passportProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  passportProgressFill: { height: '100%' },
  
  editPanel: { padding: 20, borderWidth: 1, marginBottom: 24, gap: 16 },
  input: { height: 56, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  bioInput: { height: 100, paddingTop: 16, textAlignVertical: 'top' },
  
  statsGrid: { flexDirection: 'row', borderWidth: 1, paddingVertical: 20, marginBottom: 32 },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  statDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.05)' },
  
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
  formSection: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 24, marginBottom: 12 },
  choiceGrid: { flexDirection: 'row', gap: 12, marginTop: 8 },
  smallChoice: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderWidth: 1, gap: 8 },
  smallChoiceText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  
  // Bottom Nav
  bottomNav: { flexDirection: 'row', paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});

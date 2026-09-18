import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  useAcceptFriendRequest,
  useCreateExperience,
  useCreateFriendRequest,
  useGetExperience,
  useGetHostOverview,
  useGetMe,
  useGetBotInfo,
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
import { openTelegramBot } from '@/lib/telegram';
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
  secondary = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={`button-${label.toLowerCase().replace(/\s+/g, '-')}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: secondary ? colors.secondary : colors.primary, opacity: disabled ? 0.5 : pressed ? 0.78 : 1 },
      ]}
    >
      {icon ? <Feather name={icon} size={16} color={secondary ? colors.secondaryForeground : colors.primaryForeground} /> : null}
      <Text style={[styles.buttonText, { color: secondary ? colors.secondaryForeground : colors.primaryForeground }]}>{label}</Text>
    </Pressable>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 12 }]}>
      {onBack ? (
        <Pressable accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>EXPERIENCES.FUN</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {!onBack ? <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Feather name="star" size={16} color={colors.violet} /></View> : null}
    </View>
  );
}

function EmptyState({ title, body, icon = 'compass' }: { title: string; body: string; icon?: IconName }) {
  const colors = useColors();
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}><Feather name={icon} size={21} color={colors.violet} /></View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
    </View>
  );
}

function ExperienceCard({ item, onPress }: { item: Experience; onPress: () => void }) {
  const colors = useColors();
  const icon = categoryIcon[item.category];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.experienceCard, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      <View style={styles.cardTop}>
        <View style={[styles.categoryIcon, { backgroundColor: item.category === 'environmental' ? '#E8F8F3' : item.category === 'education' ? '#F1ECFF' : '#FFF0F7' }]}>
          <Feather name={icon} size={18} color={item.category === 'environmental' ? colors.success : item.category === 'education' ? colors.violet : colors.primary} />
        </View>
        <View style={styles.cardCategory}><Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{categoryLabel[item.category]}</Text><Text style={[styles.cardDate, { color: colors.foreground }]}>{dateLabel(item.date)}</Text></View>
        {item.organisation.verified ? <View style={[styles.verified, { backgroundColor: '#E8F8F3' }]}><Feather name="check" size={12} color={colors.success} /><Text style={[styles.verifiedText, { color: colors.success }]}>Verified</Text></View> : null}
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
      <Text style={[styles.organisation, { color: colors.mutedForeground }]}>{item.organisation.name}</Text>
      <View style={styles.detailRow}><Feather name="map-pin" size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.mutedForeground }]}>{item.location}, {item.city}</Text></View>
      <View style={styles.cardFooter}>
        <View style={styles.rewardRow}><View style={[styles.rewardPill, { backgroundColor: colors.accent }]}><Text style={[styles.rewardText, { color: colors.violet }]}>+{item.xpReward} XP</Text></View>{money(item.monetaryRewardPence) ? <View style={[styles.rewardPill, { backgroundColor: '#E8F8F3' }]}><Text style={[styles.rewardText, { color: colors.success }]}>{money(item.monetaryRewardPence)}</Text></View> : null}</View>
        <Text style={[styles.places, { color: item.availablePlaces < 4 ? colors.primary : colors.mutedForeground }]}>{item.availablePlaces} places left</Text>
      </View>
    </Pressable>
  );
}

function LoadingState() {
  const colors = useColors();
  return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading experiences…</Text></View>;
}

function TelegramGate() {
  const colors = useColors();
  const botInfo = useGetBotInfo();
  return (
    <View style={[styles.gate, { backgroundColor: colors.background }]}>
      <View style={[styles.gateMark, { backgroundColor: colors.primary }]}><Feather name="compass" size={34} color={colors.primaryForeground} /></View>
      <Text style={[styles.gateTitle, { color: colors.foreground }]}>Turn experiences{'\n'}into impact.</Text>
      <Text style={[styles.gateBody, { color: colors.mutedForeground }]}>Discover volunteering near you, contribute to your community and earn XP for showing up.</Text>
      <View style={styles.gatePoints}>
        {['Real local opportunities', 'Verified participation', 'Rewards that recognise your time'].map((point) => <View key={point} style={styles.point}><Feather name="check-circle" size={17} color={colors.teal} /><Text style={[styles.pointText, { color: colors.foreground }]}>{point}</Text></View>)}
      </View>
      <Button label="Open in Telegram" icon="send" disabled={!botInfo.data?.username} onPress={() => openTelegramBot(botInfo.data?.username)} />
      <Text style={[styles.gateHint, { color: colors.mutedForeground }]}>This app uses your Telegram identity. No extra account or wallet needed.</Text>
    </View>
  );
}

function Onboarding({ user, onDone }: { user: User; onDone: () => void }) {
  const colors = useColors();
  const update = useUpdateMe();
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<ExperienceCategory[]>(user.interests ?? []);
  const [city, setCity] = useState(user.city ?? '');
  const [participationType, setParticipationType] = useState<ParticipationType>((user.participationType as ParticipationType) ?? 'join');
  const [bio, setBio] = useState(user.bio ?? '');
  const [name, setName] = useState(user.name);
  const steps = [
    { title: 'Turn experiences into impact.', body: 'Discover volunteering opportunities near you, contribute to your community and earn XP and rewards for your participation.' },
    { title: 'What do you want to get involved in?', body: 'Choose the causes that matter to you. We’ll use them to make discovery more relevant.' },
    { title: 'Where do you want to make an impact?', body: 'We use your city to show nearby opportunities. You can change it anytime.' },
    { title: 'How do you want to participate?', body: 'You can always do both. Start with what feels right today.' },
    { title: 'A little about you.', body: 'Use the name people will recognise. Your bio is optional.' },
  ];
  const last = step === steps.length - 1;
  const next = async () => {
    if (step === 1 && interests.length === 0) return;
    if (step === 2 && !city.trim()) return;
    if (last) {
      await update.mutateAsync({ data: { name: name.trim(), bio: bio.trim() || null, city: city.trim(), interests, participationType } });
      onDone();
    } else setStep((value) => value + 1);
  };
  if (step === 0) return <View style={[styles.onboarding, { backgroundColor: colors.background }]}><View style={[styles.onboardingOrb, { backgroundColor: colors.primary }]}><Feather name="compass" size={40} color={colors.primaryForeground} /></View><Text style={[styles.onboardingTitle, { color: colors.foreground }]}>{steps[step].title}</Text><Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>{steps[step].body}</Text><View style={styles.spacer} /><Button label="Get started" onPress={next} icon="arrow-right" /><Text style={[styles.gateHint, { color: colors.mutedForeground }]}>A Telegram-native way to find your next good thing.</Text></View>;
  return (
    <KeyboardAvoidingView style={[styles.onboarding, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${((step + 1) / steps.length) * 100}%` }]} /></View>
      <Text style={[styles.stepLabel, { color: colors.primary }]}>0{step + 1} / 05</Text>
      <Text style={[styles.onboardingSmallTitle, { color: colors.foreground }]}>{steps[step].title}</Text>
      <Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>{steps[step].body}</Text>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
        {step === 1 ? <View style={styles.choiceGrid}>{categories.slice(1).map((item) => { const selected = interests.includes(item.key as ExperienceCategory); return <Pressable key={item.key} onPress={() => setInterests((current) => selected ? current.filter((value) => value !== item.key) : [...current, item.key as ExperienceCategory])} style={[styles.choiceCard, { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.violet : colors.border }]}><Feather name={item.icon} size={22} color={selected ? colors.violet : colors.mutedForeground} /><Text style={[styles.choiceTitle, { color: colors.foreground }]}>{item.label}</Text><Feather name={selected ? 'check-circle' : 'circle'} size={18} color={selected ? colors.violet : colors.border} /></Pressable>; })}</View> : null}
        {step === 2 ? <View style={styles.formGroup}><TextInput value={city} onChangeText={setCity} placeholder="e.g. London" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} /><Text style={[styles.inputHint, { color: colors.mutedForeground }]}>Location permission can be added later. For now, your city is enough.</Text></View> : null}
        {step === 3 ? <View style={styles.choiceGrid}>{(['join', 'host', 'both'] as ParticipationType[]).map((value) => { const selected = participationType === value; const labels = { join: ['Join experiences', 'Participate in volunteering opportunities.'], host: ['Host experiences', 'Organise opportunities for your community.'], both: ['Both', 'Participate and host.'] }; return <Pressable key={value} onPress={() => setParticipationType(value)} style={[styles.participationCard, { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.violet : colors.border }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>{labels[value][0]}</Text><Text style={[styles.choiceBody, { color: colors.mutedForeground }]}>{labels[value][1]}</Text></Pressable>; })}</View> : null}
        {step === 4 ? <View style={styles.formGroup}><TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} /><TextInput value={user.username ? `@${user.username}` : ''} editable={false} style={[styles.input, styles.disabledInput, { color: colors.mutedForeground, borderColor: colors.input, backgroundColor: colors.muted }]} /><TextInput value={bio} onChangeText={setBio} multiline placeholder="Short bio (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} /></View> : null}
      </ScrollView>
      <Button label={update.isPending ? 'Saving…' : last ? 'Create profile' : 'Continue'} disabled={update.isPending || (step === 1 && interests.length === 0) || (step === 2 && !city.trim())} onPress={() => void next()} />
    </KeyboardAvoidingView>
  );
}

function Home({ user, go }: { user: User; go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const query = useListExperiences({ availableOnly: true });
  const participations = useListMyParticipations({ status: 'upcoming' });
  const items = query.data ?? [];
  const firstName = user.name.split(' ')[0];
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}><Header title={`Good morning, ${firstName}`} subtitle="Make an impact near you." /><View style={[styles.impactBanner, { backgroundColor: colors.foreground }]}><View style={styles.bannerCopy}><Text style={styles.bannerKicker}>YOUR NEXT GOOD THING</Text><Text style={styles.bannerTitle}>Small actions.{'\n'}Real impact.</Text><Pressable onPress={() => go('explore')}><Text style={[styles.bannerLink, { color: '#FF9DD5' }]}>Find an experience <Feather name="arrow-up-right" size={14} color="#FF9DD5" /></Text></Pressable></View><View style={[styles.bannerShape, { borderColor: colors.primary }]}><Feather name="feather" size={50} color={colors.primary} /></View></View><View style={styles.sectionHeader}><View><Text style={[styles.sectionEyebrow, { color: colors.primary }]}>DISCOVER</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recommended for you</Text></View><Pressable onPress={() => go('explore')}><Text style={[styles.seeAll, { color: colors.violet }]}>See all</Text></Pressable></View>{query.isLoading ? <LoadingState /> : items.length ? items.slice(0, 3).map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title="Your next experience is waiting" body="There are no published opportunities yet. Hosts can create the first one from Host tools." icon="feather" />}<View style={styles.sectionHeader}><View><Text style={[styles.sectionEyebrow, { color: colors.teal }]}>YOUR PROGRESS</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Keep showing up</Text></View><Pressable onPress={() => go('profile')}><Text style={[styles.seeAll, { color: colors.violet }]}>Profile</Text></Pressable></View><Pressable onPress={() => go('profile')} style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.progressTop}><View><Text style={[styles.progressLevel, { color: colors.foreground }]}>{user.level}</Text><Text style={[styles.progressXp, { color: colors.mutedForeground }]}>{user.xp} XP earned</Text></View><View style={[styles.xpBadge, { backgroundColor: colors.accent }]}><Feather name="trending-up" size={16} color={colors.violet} /></View></View><View style={[styles.progressTrack, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { backgroundColor: colors.teal, width: `${Math.min((user.xp % 500) / 5, 100)}%` }]} /></View><Text style={[styles.progressCaption, { color: colors.mutedForeground }]}>{participations.data?.length ?? 0} upcoming {participations.data?.length === 1 ? 'experience' : 'experiences'}</Text></Pressable><View style={{ height: 100 }} /></ScrollView>;
}

function Explore({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const [category, setCategory] = useState<ExperienceCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const query = useListExperiences({ category: category === 'all' ? undefined : category, search: search.trim() || undefined, availableOnly: true });
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}><Header title="Explore" subtitle="Find your next way to contribute." /><View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.input }]}><Feather name="search" size={18} color={colors.mutedForeground} /><TextInput value={search} onChangeText={setSearch} placeholder="Search experiences" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{categories.map((item) => { const selected = category === item.key; return <Pressable key={item.key} onPress={() => setCategory(item.key)} style={[styles.filter, { backgroundColor: selected ? colors.foreground : colors.card, borderColor: selected ? colors.foreground : colors.border }]}><Feather name={item.icon} size={14} color={selected ? colors.background : colors.mutedForeground} /><Text style={[styles.filterText, { color: selected ? colors.background : colors.mutedForeground }]}>{item.label}</Text></Pressable>; })}</ScrollView><View style={styles.resultsHeading}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available now</Text><Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{query.data?.length ?? 0} opportunities</Text></View>{query.isLoading ? <LoadingState /> : query.data?.length ? query.data.map((item) => <ExperienceCard key={item.id} item={item} onPress={() => go('experience', { id: String(item.id) })} />) : <EmptyState title="No experiences match yet" body="Try another category or come back when local hosts publish something new." />}<View style={{ height: 100 }} /></ScrollView>;
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
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}><Header title="Experience" onBack={() => go('explore')} /><View style={[styles.detailHero, { backgroundColor: colors.accent }]}><View style={[styles.detailHeroIcon, { backgroundColor: colors.card }]}><Feather name={categoryIcon[item.category]} size={25} color={colors.violet} /></View><Text style={[styles.detailCategory, { color: colors.violet }]}>{categoryLabel[item.category]}</Text><Text style={[styles.detailTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.organisation, { color: colors.inkSoft }]}>{item.organisation.name}{item.organisation.verified ? '  ·  Verified organisation' : ''}</Text></View><View style={styles.detailMetaGrid}><View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHEN</Text><Text style={[styles.metaValue, { color: colors.foreground }]}>{dateLabel(item.date)}</Text><Text style={[styles.metaSub, { color: colors.mutedForeground }]}>{item.startTime} – {item.endTime}</Text></View><View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>WHERE</Text><Text style={[styles.metaValue, { color: colors.foreground }]}>{item.city}</Text><Text style={[styles.metaSub, { color: colors.mutedForeground }]}>{item.location}</Text></View></View><Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>About this experience</Text><Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.description}</Text><View style={[styles.rewardPanel, { backgroundColor: colors.card, borderColor: colors.border }]}><View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>YOU’LL EARN</Text><Text style={[styles.detailReward, { color: colors.violet }]}>+{item.xpReward} XP</Text></View>{money(item.monetaryRewardPence) ? <View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>REWARD</Text><Text style={[styles.detailReward, { color: colors.success }]}>{money(item.monetaryRewardPence)}</Text></View> : null}<View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>PLACES</Text><Text style={[styles.detailReward, { color: colors.foreground }]}>{item.availablePlaces}</Text></View></View>{item.whatYouWillDo ? <View style={styles.infoBlock}><Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>What you’ll do</Text><Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.whatYouWillDo}</Text></View> : null}{item.whatToBring ? <View style={styles.infoBlock}><Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>What to bring</Text><Text style={[styles.detailBody, { color: colors.inkSoft }]}>{item.whatToBring}</Text></View> : null}<View style={styles.ctaWrap}>{item.joined && participation ? <View><View style={[styles.joinedBanner, { backgroundColor: '#E8F8F3' }]}><Feather name="check-circle" size={20} color={colors.success} /><View><Text style={[styles.joinedTitle, { color: colors.success }]}>You’re participating</Text><Text style={[styles.joinedSub, { color: colors.inkSoft }]}>{participation.status === 'verified' ? 'Completion verified and reward issued.' : participation.status === 'submitted' ? 'Awaiting host verification.' : 'Show up, then submit your completion.'}</Text></View></View>{['joined', 'attended'].includes(participation.status) ? <Button label={participation.status === 'attended' ? 'Submit completion' : 'Waiting for host attendance'} disabled={participation.status !== 'attended' || submit.isPending} onPress={() => void submit.mutateAsync({ participationId: participation.id })} /> : null}</View> : <Button label={join.isPending ? 'Joining…' : 'Join experience'} disabled={join.isPending || item.availablePlaces === 0} onPress={() => void join.mutateAsync({ experienceId: item.id })} />}</View><View style={{ height: 100 }} /></ScrollView>;
}

function Experiences({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const upcoming = useListMyParticipations({ status: 'upcoming' });
  const completed = useListMyParticipations({ status: 'completed' });
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming');
  const data = tab === 'upcoming' ? upcoming.data : completed.data;
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}><Header title="My experiences" subtitle="Your contribution, in progress." /><View style={[styles.segment, { backgroundColor: colors.muted }]}>{(['upcoming', 'completed'] as const).map((key) => <Pressable key={key} onPress={() => setTab(key)} style={[styles.segmentItem, tab === key && { backgroundColor: colors.card }]}><Text style={[styles.segmentText, { color: tab === key ? colors.foreground : colors.mutedForeground }]}>{key === 'upcoming' ? 'Upcoming' : 'Completed'}</Text></Pressable>)}</View>{data?.length ? data.map((item) => <Pressable key={item.id} onPress={() => go('experience', { id: String(item.experience.id) })} style={[styles.participationCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.cardTop}><View style={[styles.categoryIcon, { backgroundColor: colors.accent }]}><Feather name={categoryIcon[item.experience.category]} size={17} color={colors.violet} /></View><View style={styles.cardCategory}><Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{dateLabel(item.experience.date)}</Text><Text style={[styles.cardTitleSmall, { color: colors.foreground }]}>{item.experience.title}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></View><View style={styles.statusRow}><View style={[styles.statusPill, { backgroundColor: item.status === 'verified' ? '#E8F8F3' : colors.accent }]}><Text style={[styles.statusText, { color: item.status === 'verified' ? colors.success : colors.violet }]}>{item.status === 'verified' ? 'Verified' : item.status === 'submitted' ? 'Awaiting verification' : item.status}</Text></View><Text style={[styles.places, { color: colors.mutedForeground }]}>+{item.experience.xpReward} XP</Text></View></Pressable>) : <EmptyState title={tab === 'upcoming' ? 'Nothing booked yet' : 'Your impact history starts here'} body={tab === 'upcoming' ? 'Find an experience that fits your time and interests.' : 'Once a host verifies your contribution, it will show up here.'} icon={tab === 'upcoming' ? 'calendar' : 'award'} /> }<View style={{ height: 100 }} /></ScrollView>;
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
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}><Header title="Your profile" subtitle="Every contribution counts." /><View style={styles.profileHead}><View style={[styles.profileAvatar, { backgroundColor: colors.foreground }]}><Text style={[styles.profileInitial, { color: colors.primaryForeground }]}>{current.name.charAt(0).toUpperCase()}</Text></View><View style={styles.profileIdentity}><Text style={[styles.profileName, { color: colors.foreground }]}>{current.name}</Text><Text style={[styles.profileHandle, { color: colors.mutedForeground }]}>@{current.username ?? 'telegram'}</Text><View style={[styles.levelPill, { backgroundColor: colors.accent }]}><Feather name="star" size={13} color={colors.violet} /><Text style={[styles.levelText, { color: colors.violet }]}>{current.level}</Text></View></View><Pressable onPress={() => setEditing((value) => !value)} style={[styles.iconButton, { backgroundColor: colors.secondary }]}><Feather name={editing ? 'x' : 'edit-2'} size={17} color={colors.foreground} /></Pressable></View>{editing ? <View style={[styles.editPanel, { backgroundColor: colors.card, borderColor: colors.border }]}><TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]} /><TextInput value={bio} onChangeText={setBio} multiline placeholder="Short bio" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]} /><Button label={update.isPending ? 'Saving…' : 'Save profile'} disabled={update.isPending} onPress={() => void update.mutateAsync({ data: { city, bio: bio || null } }).then(() => setEditing(false))} /></View> : null}<View style={[styles.statsGrid, { backgroundColor: colors.card, borderColor: colors.border }]}><View><Text style={[styles.statValue, { color: colors.foreground }]}>{current.xp}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>XP earned</Text></View><View><Text style={[styles.statValue, { color: colors.foreground }]}>{current.completedCount}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Completed</Text></View><View><Text style={[styles.statValue, { color: colors.foreground }]}>{current.hostedCount}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Hosted</Text></View></View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contribution history</Text>{completed.data?.length ? completed.data.slice(0, 3).map((item) => <View key={item.id} style={styles.historyRow}><View style={[styles.historyDot, { backgroundColor: colors.teal }]} /><View style={styles.historyCopy}><Text style={[styles.historyTitle, { color: colors.foreground }]}>{item.experience.title}</Text><Text style={[styles.historySub, { color: colors.mutedForeground }]}>{dateLabel(item.experience.date)} · +{item.experience.xpReward} XP</Text></View><Feather name="check-circle" size={17} color={colors.success} /></View>) : <Text style={[styles.mutedParagraph, { color: colors.mutedForeground }]}>Verified contributions will appear here.</Text>}<View style={styles.socialHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Friends</Text><Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{friends.data?.length ?? 0} connected</Text></View><View style={[styles.friendAdd, { borderColor: colors.border, backgroundColor: colors.card }]}><TextInput value={username} onChangeText={setUsername} placeholder="@username" placeholderTextColor={colors.mutedForeground} style={[styles.friendInput, { color: colors.foreground }]} /><Pressable disabled={!username.trim() || createFriend.isPending} onPress={() => void createFriend.mutateAsync({ data: { username: username.replace(/^@/, '') } }).then(() => setUsername(''))} style={[styles.addButton, { backgroundColor: colors.foreground }]}><Feather name="user-plus" size={16} color={colors.background} /></Pressable></View>{requests.data?.map((request) => <View key={request.id} style={[styles.requestRow, { backgroundColor: colors.accent }]}><Text style={[styles.requestText, { color: colors.foreground }]}>{request.user.name} wants to connect</Text><Pressable onPress={() => void accept.mutateAsync({ requestId: request.id })}><Text style={[styles.requestAction, { color: colors.violet }]}>Accept</Text></Pressable></View>)}{friends.data?.length ? <Text style={[styles.friendList, { color: colors.inkSoft }]}>{friends.data.map((friend) => `@${friend.username ?? friend.name}`).join('  ·  ')}</Text> : null}{current.participationType !== 'join' ? <Button label="Open host tools" secondary onPress={() => go('host')} /> : null}<View style={{ height: 100 }} /></ScrollView>;
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
  const field = (key: keyof ExperienceCreateInput, placeholder: string, multiline = false) => <TextInput value={form[key] == null ? '' : String(form[key])} onChangeText={(value) => set(key, value)} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} style={[styles.input, multiline && styles.bioInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} />;
  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"><Header title="Create experience" subtitle="Give your community a way to show up." onBack={() => go('host')} /><Text style={[styles.formSection, { color: colors.primary }]}>ORGANISATION</Text>{field('organisationName', 'Organisation name')}{field('organisationDescription', 'What does your organisation do?', true)}<Text style={[styles.formSection, { color: colors.primary }]}>THE EXPERIENCE</Text>{field('title', 'Experience title')}{field('description', 'Describe what participants will do', true)}<View style={styles.choiceGrid}>{categories.slice(1).map((item) => <Pressable key={item.key} onPress={() => set('category', item.key)} style={[styles.smallChoice, { backgroundColor: form.category === item.key ? colors.accent : colors.card, borderColor: form.category === item.key ? colors.violet : colors.border }]}><Feather name={item.icon} size={16} color={form.category === item.key ? colors.violet : colors.mutedForeground} /><Text style={[styles.smallChoiceText, { color: colors.foreground }]}>{item.label}</Text></Pressable>)}</View><Text style={[styles.formSection, { color: colors.primary }]}>WHEN & WHERE</Text>{field('date', 'Date (YYYY-MM-DD)')}{field('startTime', 'Start time (e.g. 10:00)')}{field('endTime', 'End time (e.g. 13:00)')}{field('location', 'Meeting point')}{field('city', 'City')}<Text style={[styles.formSection, { color: colors.primary }]}>CAPACITY & REWARDS</Text>{field('capacity', 'Maximum participants')}{field('xpReward', 'XP reward')}{field('monetaryRewardPence', 'Money reward in pence (optional)')}<Text style={[styles.inputHint, { color: colors.mutedForeground }]}>For example, enter 2000 for a £20 reward. Payment is handled manually in this MVP.</Text>{field('whatYouWillDo', 'What will participants do?', true)}{field('whatToBring', 'What should participants bring?', true)}<Button label={create.isPending ? 'Publishing…' : 'Publish experience'} disabled={!valid || create.isPending} onPress={() => void publish()} /><View style={{ height: 100 }} /></ScrollView></KeyboardAvoidingView>;
}

function Host({ go }: { go: (screen: Screen, params?: Record<string, string>) => void }) {
  const colors = useColors();
  const overview = useGetHostOverview();
  const experiences = useListHostExperiences();
  const [selected, setSelected] = useState<number | null>(null);
  const participants = useListExperienceParticipants(selected ?? 0, { query: { queryKey: getListExperienceParticipantsQueryKey(selected ?? 0), enabled: selected !== null } });
  const attend = useMarkAttendance();
  const verify = useVerifyParticipation();
  const reject = useRejectParticipation();
  const pending = (participants.data ?? []).filter((item) => item.status === 'submitted');
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}><Header title="Host tools" subtitle={overview.data?.organisation?.name ?? 'Create your first opportunity'} onBack={() => go('home')} /><View style={styles.hostStats}>{[['Upcoming', overview.data?.upcomingExperiences ?? 0], ['Participants', overview.data?.participantCount ?? 0], ['To verify', overview.data?.pendingVerifications ?? 0]].map(([label, value]) => <View key={String(label)} style={[styles.hostStat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.hostStatValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>)}</View><Button label="Create experience" icon="plus" onPress={() => go('create')} /><View style={styles.socialHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your experiences</Text><Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{experiences.data?.length ?? 0} published</Text></View>{experiences.data?.length ? experiences.data.map((item) => <Pressable key={item.id} onPress={() => setSelected(item.id)} style={[styles.participationCard, { backgroundColor: selected === item.id ? colors.accent : colors.card, borderColor: selected === item.id ? colors.violet : colors.border }]}><View style={styles.cardTop}><View style={[styles.categoryIcon, { backgroundColor: colors.accent }]}><Feather name={categoryIcon[item.category]} size={17} color={colors.violet} /></View><View style={styles.cardCategory}><Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{dateLabel(item.date)} · {item.availablePlaces} spots left</Text><Text style={[styles.cardTitleSmall, { color: colors.foreground }]}>{item.title}</Text></View><Feather name={selected === item.id ? 'chevron-down' : 'chevron-right'} size={18} color={colors.mutedForeground} /></View></Pressable>) : <EmptyState title="No experience published" body="Create a real volunteering opportunity and it will appear here." icon="edit-3" />}{selected !== null ? <View><Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 12 }]}>Participants</Text>{participants.isLoading ? <LoadingState /> : participants.data?.length ? participants.data.map((item) => <View key={item.id} style={[styles.participantRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.participantAvatar, { backgroundColor: colors.secondary }]}><Text style={[styles.participantInitial, { color: colors.foreground }]}>{item.participant.name.charAt(0)}</Text></View><View style={styles.participantCopy}><Text style={[styles.participantName, { color: colors.foreground }]}>{item.participant.name}</Text><Text style={[styles.participantStatus, { color: colors.mutedForeground }]}>{item.participant.username ? `@${item.participant.username} · ` : ''}{item.status}</Text></View>{item.status === 'joined' ? <Pressable onPress={() => void attend.mutateAsync({ participationId: item.id })} style={[styles.miniAction, { backgroundColor: colors.secondary }]}><Text style={[styles.miniActionText, { color: colors.foreground }]}>Attend</Text></Pressable> : null}{item.status === 'submitted' ? <View style={styles.actionPair}><Pressable onPress={() => void verify.mutateAsync({ participationId: item.id })} style={[styles.miniAction, { backgroundColor: '#E8F8F3' }]}><Text style={[styles.miniActionText, { color: colors.success }]}>Verify</Text></Pressable><Pressable onPress={() => void reject.mutateAsync({ participationId: item.id })} style={[styles.miniAction, { backgroundColor: colors.muted }]}><Text style={[styles.miniActionText, { color: colors.destructive }]}>Reject</Text></Pressable></View> : null}{item.status === 'verified' ? <Feather name="check-circle" size={18} color={colors.success} /> : null}</View>) : <EmptyState title="No participants yet" body="When people join, you’ll manage attendance and completion here." icon="users" />}</View> : null}<View style={{ height: 100 }} /></ScrollView>;
}

function BottomNav({ active, go }: { active: Screen; go: (screen: Screen) => void }) {
  const colors = useColors();
  const items: Array<{ key: Screen; label: string; icon: IconName }> = [{ key: 'home', label: 'Home', icon: 'home' }, { key: 'explore', label: 'Explore', icon: 'compass' }, { key: 'experiences', label: 'My experiences', icon: 'calendar' }, { key: 'profile', label: 'Profile', icon: 'user' }];
  return <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'web' ? 34 : 12 }]}>{items.map((item) => { const selected = active === item.key; return <Pressable key={item.key} onPress={() => go(item.key)} style={styles.navItem}><Feather name={item.icon} size={20} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.navLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>{item.label}</Text></Pressable>; })}</View>;
}

export default function App() {
  const params = useLocalSearchParams<{ screen?: string; id?: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const colors = useColors();
  const [onboarded, setOnboarded] = useState(false);
  const screen = (params.screen as Screen) || 'home';
  const go = (next: Screen, nextParams?: Record<string, string>) => router.replace({ pathname: '/', params: { screen: next, ...nextParams } });
  const needsOnboarding = Boolean(user && (!user.city || !user.interests?.length || !user.participationType) && !onboarded);
  const content = useMemo(() => {
    if (!user) return null;
    if (screen === 'experience') return <Detail id={Number(params.id)} go={go} />;
    if (screen === 'explore') return <Explore go={go} />;
    if (screen === 'experiences') return <Experiences go={go} />;
    if (screen === 'profile') return <Profile user={user} go={go} />;
    if (screen === 'host') return <Host go={go} />;
    if (screen === 'create') return <Create go={go} />;
    return <Home user={user} go={go} />;
  }, [user, screen, params.id]);
  if (loading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Connecting to Telegram…</Text></View>;
  if (!user) return <TelegramGate />;
  if (needsOnboarding) return <Onboarding user={user} onDone={() => setOnboarded(true)} />;
  const noNav = ['experience', 'create', 'host'].includes(screen);
  return <View style={[styles.app, { backgroundColor: colors.background }]}>{content}{!noNav ? <BottomNav active={screen} go={go} /> : null}</View>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 100, gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  headerTitle: { fontSize: 26, letterSpacing: -0.7, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 3 },
  avatar: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  impactBanner: { minHeight: 188, borderRadius: 26, padding: 22, flexDirection: 'row', overflow: 'hidden' },
  bannerCopy: { flex: 1, justifyContent: 'space-between' },
  bannerKicker: { color: '#FF9DD5', fontSize: 10, letterSpacing: 1.5, fontFamily: 'Inter_700Bold' },
  bannerTitle: { color: '#FFFFFF', fontSize: 29, lineHeight: 33, letterSpacing: -1, fontFamily: 'Inter_700Bold' },
  bannerLink: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  bannerShape: { width: 108, height: 108, borderRadius: 54, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', transform: [{ rotate: '-15deg' }] },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, marginBottom: 1 },
  sectionEyebrow: { fontSize: 10, letterSpacing: 1.5, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  sectionTitle: { fontSize: 20, letterSpacing: -0.4, fontFamily: 'Inter_700Bold' },
  seeAll: { fontSize: 13, fontFamily: 'Inter_600SemiBold', paddingBottom: 2 },
  experienceCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardCategory: { flex: 1, gap: 2 },
  categoryText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  cardDate: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  verifiedText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  cardTitle: { fontSize: 19, lineHeight: 23, letterSpacing: -0.3, fontFamily: 'Inter_700Bold' },
  cardTitleSmall: { fontSize: 15, lineHeight: 19, fontFamily: 'Inter_600SemiBold' },
  organisation: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 3 },
  rewardRow: { flexDirection: 'row', gap: 6 },
  rewardPill: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  rewardText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  places: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  progressCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLevel: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  progressXp: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  xpBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 7, borderRadius: 5, overflow: 'hidden' },
  progressCaption: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 68, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 9 },
  navItem: { alignItems: 'center', gap: 4, minWidth: 72 },
  navLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  button: { minHeight: 51, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  emptyState: { borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center', gap: 8, marginTop: 4 },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 290, fontFamily: 'Inter_400Regular' },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 10 },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  gate: { flex: 1, paddingHorizontal: 28, paddingTop: 82, paddingBottom: 34 },
  gateMark: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  gateTitle: { fontSize: 40, lineHeight: 42, letterSpacing: -1.6, fontFamily: 'Inter_700Bold' },
  gateBody: { fontSize: 16, lineHeight: 24, fontFamily: 'Inter_400Regular', marginTop: 16, maxWidth: 330 },
  gatePoints: { gap: 15, marginTop: 34, marginBottom: 28 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  gateHint: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 15, fontFamily: 'Inter_400Regular' },
  onboarding: { flex: 1, paddingHorizontal: 24, paddingTop: 62, paddingBottom: 26 },
  onboardingOrb: { width: 86, height: 86, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  onboardingTitle: { fontSize: 37, lineHeight: 40, letterSpacing: -1.5, fontFamily: 'Inter_700Bold' },
  onboardingSmallTitle: { fontSize: 28, lineHeight: 32, letterSpacing: -1, fontFamily: 'Inter_700Bold', marginTop: 16 },
  onboardingBody: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 13, maxWidth: 340 },
  spacer: { flex: 1 },
  progressFill: { height: '100%', borderRadius: 5 },
  stepLabel: { fontSize: 11, letterSpacing: 1.5, fontFamily: 'Inter_700Bold', marginTop: 20 },
  onboardingContent: { paddingVertical: 28, gap: 16 },
  choiceGrid: { gap: 10 },
  choiceCard: { minHeight: 74, borderRadius: 18, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  choiceTitle: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  choiceBody: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 5 },
  participationCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 3 },
  formGroup: { gap: 10 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, fontFamily: 'Inter_400Regular' },
  disabledInput: { opacity: 0.65 },
  bioInput: { minHeight: 94, textAlignVertical: 'top' },
  inputHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', paddingHorizontal: 3 },
  searchBox: { minHeight: 51, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  filterRow: { gap: 8, paddingVertical: 2 },
  filter: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  resultsHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5 },
  resultCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  detailHero: { borderRadius: 25, padding: 21, gap: 9, marginBottom: 5 },
  detailHeroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  detailCategory: { fontSize: 11, letterSpacing: 1.2, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
  detailTitle: { fontSize: 30, lineHeight: 33, letterSpacing: -1.1, fontFamily: 'Inter_700Bold' },
  detailMetaGrid: { flexDirection: 'row', gap: 36, paddingVertical: 15 },
  metaLabel: { fontSize: 10, letterSpacing: 1.3, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  metaValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  metaSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  detailSectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 5 },
  detailBody: { fontSize: 14, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  rewardPanel: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  detailReward: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  infoBlock: { gap: 3 },
  ctaWrap: { marginTop: 6 },
  joinedBanner: { borderRadius: 17, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 10 },
  joinedTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  joinedSub: { fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: 'Inter_400Regular' },
  segment: { borderRadius: 13, padding: 4, flexDirection: 'row', gap: 4 },
  segmentItem: { flex: 1, borderRadius: 10, alignItems: 'center', paddingVertical: 10 },
  segmentText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 5, marginBottom: 8 },
  profileAvatar: { width: 66, height: 66, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  profileIdentity: { flex: 1, gap: 3 },
  profileName: { fontSize: 21, letterSpacing: -0.5, fontFamily: 'Inter_700Bold' },
  profileHandle: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  levelPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, marginTop: 3 },
  levelText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  iconButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  editPanel: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  statsGrid: { borderWidth: 1, borderRadius: 19, flexDirection: 'row', justifyContent: 'space-between', padding: 17, marginVertical: 7 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E7DEE9' },
  historyDot: { width: 9, height: 9, borderRadius: 5 },
  historyCopy: { flex: 1, gap: 3 },
  historyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  historySub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  mutedParagraph: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  socialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 },
  friendAdd: { borderWidth: 1, borderRadius: 14, minHeight: 49, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, overflow: 'hidden' },
  friendInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  addButton: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center' },
  requestRow: { borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  requestText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  requestAction: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  friendList: { fontSize: 13, lineHeight: 21, fontFamily: 'Inter_500Medium' },
  formSection: { fontSize: 10, letterSpacing: 1.5, fontFamily: 'Inter_700Bold', marginTop: 10, marginBottom: -3 },
  smallChoice: { flex: 1, borderRadius: 13, borderWidth: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', gap: 5 },
  smallChoiceText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  hostStats: { flexDirection: 'row', gap: 8 },
  hostStat: { flex: 1, borderWidth: 1, borderRadius: 17, padding: 13, gap: 4 },
  hostStatValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  participantRow: { minHeight: 66, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  participantAvatar: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  participantInitial: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  participantCopy: { flex: 1, gap: 3 },
  participantName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  participantStatus: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  miniAction: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  miniActionText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  actionPair: { flexDirection: 'row', gap: 5 },
});
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useGetMyXpAwards,
  getGetMyXpAwardsQueryKey,
  type ExperienceCategory,
  type XpAward,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useMotionPreferences } from '@/context/MotionContext';
import { useColors } from '@/hooks/useColors';
import { ExperienceCategoryArtwork } from '@/components/ExperienceCategoryArtwork';

type MomentInput =
  | {
      kind: 'started';
      experienceTitle: string;
      xpReward?: number;
      hasMilestones?: boolean;
      artworkCategory?: ExperienceCategory;
    }
  | {
      kind: 'waitlisted';
      experienceTitle: string;
    }
  | {
      kind: 'completion-submitted';
      experienceTitle: string;
      xpReward: number;
      milestoneTitle?: string;
      artworkCategory?: ExperienceCategory;
    };

type Moment = (MomentInput | {
  kind: 'earned';
  amount: number;
  title: string;
  status: XpAward['status'];
}) & { key: string };

type MomentContextValue = {
  present: (moment: MomentInput) => void;
};

const MomentContext = createContext<MomentContextValue | null>(null);

function isFreshXpAward(award: XpAward) {
  return Number.isSafeInteger(award.amount)
    && award.amount > 0
    && award.sourceType !== 'legacy_balance'
    && !award.id.startsWith('legacy:');
}

function xpLabel(amount: number) {
  return `${amount.toLocaleString()} XP`;
}

function presentationCopy(moment: Moment) {
  if (moment.kind === 'earned') {
    return {
      eyebrow: 'XP EARNED',
      title: 'You earned XP',
      detail: moment.title,
      description: moment.status === 'pending'
        ? 'Your contribution has been recognised. Redeem this reward from your profile when you’re ready.'
        : 'This reward has been added to your XP balance.',
      amount: moment.amount,
      amountLabel: 'XP AWARDED',
    };
  }

  if (moment.kind === 'started') {
    return {
      eyebrow: 'EXPERIENCE STARTED',
      title: 'You’re in',
      detail: moment.experienceTitle,
      description: moment.hasMilestones
        ? 'Take part and complete the verified milestones to earn this experience’s XP.'
        : 'Take part, then submit your completion for host verification.',
      amount: moment.xpReward && moment.xpReward > 0 ? moment.xpReward : null,
      amountLabel: moment.hasMilestones ? 'XP ACROSS VERIFIED MILESTONES' : 'XP AFTER VERIFICATION',
    };
  }

  if (moment.kind === 'waitlisted') {
    return {
      eyebrow: 'EXPERIENCE UPDATE',
      title: 'You’re on the waitlist',
      detail: moment.experienceTitle,
      description: 'We’ll let you know if a place opens up.',
      amount: null,
      amountLabel: '',
    };
  }

  return {
    eyebrow: moment.milestoneTitle ? 'MILESTONE SUBMITTED' : 'COMPLETION SUBMITTED',
    title: moment.milestoneTitle ? 'Milestone submitted' : 'Completion submitted',
    detail: moment.milestoneTitle
      ? `${moment.experienceTitle} · ${moment.milestoneTitle}`
      : moment.experienceTitle,
    description: moment.xpReward > 0
      ? 'Your host will verify your contribution before this XP is added.'
      : 'Your host will review your contribution and update its status.',
    amount: moment.xpReward > 0 ? moment.xpReward : null,
    amountLabel: moment.xpReward > 0 ? 'XP AWAITING VERIFICATION' : '',
  };
}

function ExperienceMomentModal({
  moment,
  onDismiss,
}: {
  moment: Moment;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useMotionPreferences();
  const copy = presentationCopy(moment);
  const backgroundColor = colors.welcome.background;
  const foregroundColor = colors.welcome.foreground;
  const amount = copy.amount ? `+${copy.amount.toLocaleString()}` : null;
  const shareMessage = moment.kind === 'earned'
    ? `I earned ${xpLabel(moment.amount)} for ${moment.title} on Experiences.fun.`
    : moment.kind === 'started'
      ? `I just joined ${moment.experienceTitle} on Experiences.fun.`
      : moment.kind === 'waitlisted'
        ? `I joined the waitlist for ${moment.experienceTitle} on Experiences.fun.`
        : `I submitted my contribution for ${moment.experienceTitle} on Experiences.fun.`;

  const shareMoment = async () => {
    try {
      await Share.share({ message: shareMessage, title: 'Experiences.fun' });
    } catch {
      Alert.alert('Could not share this update', 'Please try again.');
    }
  };

  return (
    <Modal
      animationType={reduceMotion || Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={onDismiss}
      presentationStyle="fullScreen"
      statusBarTranslucent
      transparent={false}
      visible
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.screen,
          styles.screenFill,
          {
            backgroundColor,
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 18),
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 12) + 16,
          },
        ]}
        testID="experience-moment-screen"
      >
        <StatusBar barStyle="light-content" backgroundColor={backgroundColor} />
        <View style={styles.content}>
          <View style={styles.hero}>
            <View style={[styles.heroOrbit, { borderColor: `${colors.accent}55` }]} />
            <View style={[styles.heroHalo, { backgroundColor: `${colors.primary}18` }]} />
            <View style={[styles.heroMedallion, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
              {moment.kind !== 'earned' && 'artworkCategory' in moment && moment.artworkCategory ? (
                <ExperienceCategoryArtwork category={moment.artworkCategory} size={82} />
              ) : (
                <View style={styles.coinStack}>
                  <View style={[styles.coinDepth, { backgroundColor: colors.welcome.border }]} />
                  <View style={[styles.xpCoin, { backgroundColor: colors.welcome.gold, borderColor: colors.welcome.surface }]}>
                    <View style={[styles.xpCoinRing, { borderColor: colors.welcome.surface }]} />
                    <Text style={[styles.xpCoinText, { color: backgroundColor }]}>XP</Text>
                  </View>
                </View>
              )}
            </View>
            <View style={[styles.heroSpark, { backgroundColor: colors.welcome.gold }]}>
              <Feather name="zap" size={17} color={backgroundColor} />
            </View>
            {amount ? (
              <View style={styles.amountStack} testID="experience-moment-amount">
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.amount, styles.amountBack, { color: colors.primary }]}
                >
                  {amount}
                </Text>
                <Text
                  accessibilityLabel={`${amount} XP`}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.amount, { color: foregroundColor }]}
                >
                  {amount}
                </Text>
              </View>
            ) : null}
            {copy.amountLabel ? (
              <Text style={[styles.amountLabel, { color: colors.accent }]}>{copy.amountLabel}</Text>
            ) : null}
          </View>

          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: colors.welcome.muted }]}>{copy.eyebrow}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: foregroundColor }]} testID="experience-moment-title">
              {copy.title}
            </Text>
            <Text style={[styles.detail, { color: foregroundColor }]}>{copy.detail}</Text>
            <Text style={[styles.description, { color: colors.welcome.muted }]}>{copy.description}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share this update"
            onPress={() => { void shareMoment(); }}
            style={({ pressed }) => [
              styles.shareButton,
              { borderColor: colors.welcome.border, opacity: pressed ? 0.72 : 1 },
            ]}
            testID="experience-moment-share"
          >
            <Feather name="share" size={21} color={foregroundColor} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.continueButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.82 : 1 },
            ]}
            testID="experience-moment-continue"
          >
            <Text style={[styles.continueText, { color: colors.accentForeground }]}>CONTINUE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function ExperienceMomentProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [queue, setQueue] = useState<Moment[]>([]);
  const nextMomentId = useRef(0);
  const seenAwards = useRef<Set<string> | null>(null);
  const trackedUserId = useRef<number | null>(null);
  const awardsQuery = useGetMyXpAwards({
    query: {
      queryKey: getGetMyXpAwardsQueryKey(),
      enabled: !loading && user?.userType === 'participant',
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    },
  });

  const present = useCallback((moment: MomentInput) => {
    nextMomentId.current += 1;
    setQueue((current) => [
      ...current,
      { ...moment, key: `moment:${nextMomentId.current}` },
    ]);
  }, []);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (trackedUserId.current !== userId) {
      trackedUserId.current = userId;
      seenAwards.current = null;
      setQueue([]);
    }

    if (!user || user.userType !== 'participant' || !awardsQuery.data) return;

    const validAwards = awardsQuery.data.awards.filter(isFreshXpAward);
    if (!seenAwards.current) {
      seenAwards.current = new Set(validAwards.map((award) => award.id));
      return;
    }

    const seen = seenAwards.current;
    if (!seen) return;
    const newAwards = validAwards
      .filter((award) => !seen.has(award.id))
      .sort((left, right) => Date.parse(left.awardedAt) - Date.parse(right.awardedAt));
    for (const award of newAwards) seen.add(award.id);
    if (!newAwards.length) return;

    setQueue((current) => {
      const queuedKeys = new Set(current.map((moment) => moment.key));
      return [
        ...current,
        ...newAwards
          .map((award): Moment => ({
            key: `award:${award.id}`,
            kind: 'earned',
            amount: award.amount,
            title: award.title,
            status: award.status,
          }))
          .filter((moment) => !queuedKeys.has(moment.key)),
      ];
    });
  }, [awardsQuery.data, user?.id, user?.userType]);

  const dismiss = useCallback(() => {
    setQueue((current) => current.slice(1));
  }, []);

  return (
    <MomentContext.Provider value={{ present }}>
      {children}
      {queue[0] ? <ExperienceMomentModal moment={queue[0]} onDismiss={dismiss} /> : null}
    </MomentContext.Provider>
  );
}

export function useExperienceMoment() {
  const context = useContext(MomentContext);
  if (!context) {
    throw new Error('useExperienceMoment must be used within ExperienceMomentProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18, justifyContent: 'space-between' },
  screenFill: { width: '100%', height: '100%' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30, paddingBottom: 12 },
  hero: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  heroOrbit: { position: 'absolute', top: 0, width: 184, height: 184, borderWidth: 1, borderRadius: 92 },
  heroHalo: { position: 'absolute', top: 16, width: 152, height: 152, borderRadius: 76 },
  heroMedallion: { width: 126, height: 126, borderWidth: 1, borderRadius: 63, alignItems: 'center', justifyContent: 'center' },
  coinStack: { width: 82, height: 86, alignItems: 'center', justifyContent: 'flex-start' },
  coinDepth: { position: 'absolute', top: 5, width: 76, height: 76, borderRadius: 38 },
  xpCoin: { width: 82, height: 82, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderRadius: 41 },
  xpCoinRing: { position: 'absolute', top: 8, right: 8, bottom: 8, left: 8, borderWidth: 1, borderRadius: 30 },
  xpCoinText: { fontSize: 26, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  heroSpark: { position: 'absolute', top: 12, right: '27%', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  amountStack: { width: '100%', maxWidth: 350, minHeight: 78, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  amount: { fontSize: 64, lineHeight: 72, letterSpacing: -2, fontFamily: 'Inter_700Bold', textAlign: 'center', width: '100%' },
  amountBack: { position: 'absolute', top: 5 },
  amountLabel: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: -2 },
  copy: { width: '100%', maxWidth: 370, alignItems: 'center', gap: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.45, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  detail: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  description: { maxWidth: 340, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareButton: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 14 },
  continueButton: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 18 },
  continueText: { fontSize: 14, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
});

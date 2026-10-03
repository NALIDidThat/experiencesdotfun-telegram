import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getListExperienceChallengesQueryKey,
  useAcceptExperienceChallenge,
  useCreateExperienceChallenge,
  useDeclineExperienceChallenge,
  useListExperienceChallenges,
  useListExperiences,
  useListFriends,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';

type Props = { onOpenExperience: (experienceId: number) => void };
type Selection = { id: number; label: string };

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export function ExperienceChallengesScreen({ onOpenExperience }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const challengesQuery = useListExperienceChallenges();
  const friendsQuery = useListFriends();
  const experiencesQuery = useListExperiences();
  const createChallenge = useCreateExperienceChallenge();
  const acceptChallenge = useAcceptExperienceChallenge();
  const declineChallenge = useDeclineExperienceChallenge();
  const [chosenExperience, setChosenExperience] = useState<Selection | null>(null);
  const [chosenFriend, setChosenFriend] = useState<Selection | null>(null);
  const [experiencePickerOpen, setExperiencePickerOpen] = useState(false);
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const challenges = challengesQuery.data ?? [];
  const friends = friendsQuery.data ?? [];
  const openExperiences = useMemo(
    () => (experiencesQuery.data ?? []).filter((experience) => experience.status === 'published' && experience.availablePlaces > 0),
    [experiencesQuery.data],
  );
  const pendingIncomingCount = challenges.filter((challenge) => challenge.direction === 'incoming' && challenge.status === 'pending').length;

  const refreshChallenges = () =>
    queryClient.invalidateQueries({ queryKey: getListExperienceChallengesQueryKey() });

  const submitChallenge = () => {
    if (!chosenExperience || !chosenFriend || createChallenge.isPending) return;
    setNotice('');
    createChallenge.mutate(
      { data: { experienceId: chosenExperience.id, friendId: chosenFriend.id } },
      {
        onSuccess: async () => {
          await refreshChallenges();
          setChosenExperience(null);
          setChosenFriend(null);
          setNotice('Invitation sent to your friend.');
        },
        onError: () => setNotice('This invitation could not be sent. Check your selections and try again.'),
      },
    );
  };

  const respond = (challengeId: number, decision: 'accept' | 'decline') => {
    const mutation = decision === 'accept' ? acceptChallenge : declineChallenge;
    mutation.mutate({ challengeId }, {
      onSuccess: refreshChallenges,
      onError: () => setNotice('Your response could not be saved. Please try again.'),
    });
  };

  const loading = challengesQuery.isLoading || friendsQuery.isLoading || experiencesQuery.isLoading;
  const error = challengesQuery.isError || friendsQuery.isError || experiencesQuery.isError;
  const retry = () => {
    challengesQuery.refetch();
    friendsQuery.refetch();
    experiencesQuery.refetch();
  };

  const statusCopy = (status: string) => {
    if (status === 'completed') return 'Verified completion';
    if (status === 'accepted') return 'Accepted · completion not yet verified';
    if (status === 'declined') return 'Declined';
    return 'Awaiting a response';
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerText}>
          <Text style={[styles.kicker, { color: colors.primary }]}>MAKE IT A SHARED PLAN</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Challenges</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Invite an accepted friend to an experience already happening near you.
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.muted }]}>
          <Feather name="users" size={19} color={colors.primary} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.createPanel, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <View style={styles.panelHeading}>
            <View style={[styles.panelNumber, { backgroundColor: colors.primary }]}>
              <Text style={[styles.panelNumberText, { color: colors.primaryForeground }]}>01</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>Bring someone along</Text>
              <Text style={[styles.panelHint, { color: colors.mutedForeground }]}>Choose a published experience and a friend.</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => { setExperiencePickerOpen(!experiencePickerOpen); setFriendPickerOpen(false); }}
            style={[styles.selector, { backgroundColor: colors.card, borderColor: experiencePickerOpen ? colors.primary : colors.border }]}
          >
            <View style={[styles.selectorIcon, { backgroundColor: colors.muted }]}>
              <Feather name="map-pin" size={15} color={colors.primary} />
            </View>
            <View style={styles.selectorCopy}>
              <Text style={[styles.selectorLabel, { color: colors.mutedForeground }]}>EXPERIENCE</Text>
              <Text numberOfLines={1} style={[styles.selectorValue, { color: chosenExperience ? colors.foreground : colors.mutedForeground }]}>
                {chosenExperience?.label ?? 'Select an open experience'}
              </Text>
            </View>
            <Feather name={experiencePickerOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
          </Pressable>
          {experiencePickerOpen && (
            <View style={[styles.optionsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {experiencesQuery.isLoading ? <OptionLoading color={colors.primary} /> :
                openExperiences.length ? openExperiences.map((experience) => (
                  <Pressable
                    key={experience.id}
                    onPress={() => {
                      setChosenExperience({ id: experience.id, label: experience.title });
                      setExperiencePickerOpen(false);
                    }}
                    style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.optionTitle, { color: colors.foreground }]}>{experience.title}</Text>
                      <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>{formatDate(experience.date)} · {experience.city}</Text>
                    </View>
                    {chosenExperience?.id === experience.id && <Feather name="check" size={17} color={colors.primary} />}
                  </Pressable>
                )) : <Text style={[styles.noOptions, { color: colors.mutedForeground }]}>No open experiences available right now.</Text>}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => { setFriendPickerOpen(!friendPickerOpen); setExperiencePickerOpen(false); }}
            style={[styles.selector, { backgroundColor: colors.card, borderColor: friendPickerOpen ? colors.primary : colors.border }]}
          >
            <View style={[styles.selectorIcon, { backgroundColor: colors.muted }]}>
              <Feather name="user" size={15} color={colors.primary} />
            </View>
            <View style={styles.selectorCopy}>
              <Text style={[styles.selectorLabel, { color: colors.mutedForeground }]}>ACCEPTED FRIEND</Text>
              <Text numberOfLines={1} style={[styles.selectorValue, { color: chosenFriend ? colors.foreground : colors.mutedForeground }]}>
                {chosenFriend?.label ?? 'Choose a friend'}
              </Text>
            </View>
            <Feather name={friendPickerOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
          </Pressable>
          {friendPickerOpen && (
            <View style={[styles.optionsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {friendsQuery.isLoading ? <OptionLoading color={colors.primary} /> :
                friends.length ? friends.map((friend) => (
                  <Pressable
                    key={friend.id}
                    onPress={() => {
                      setChosenFriend({ id: friend.id, label: friend.name });
                      setFriendPickerOpen(false);
                    }}
                    style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.initials, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.initialsText, { color: colors.primary }]}>{friend.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>{friend.name}</Text>
                      {!!friend.city && <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>{friend.city}</Text>}
                    </View>
                    {chosenFriend?.id === friend.id && <Feather name="check" size={17} color={colors.primary} />}
                  </Pressable>
                )) : <Text style={[styles.noOptions, { color: colors.mutedForeground }]}>Accepted friends will appear here.</Text>}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            testID="send-experience-challenge"
            onPress={submitChallenge}
            disabled={!chosenExperience || !chosenFriend || createChallenge.isPending}
            style={[styles.sendButton, { backgroundColor: chosenExperience && chosenFriend ? colors.primary : colors.border }]}
          >
            {createChallenge.isPending
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Feather name="send" size={15} color={colors.primaryForeground} />}
            <Text style={[styles.sendButtonText, { color: chosenExperience && chosenFriend ? colors.primaryForeground : colors.mutedForeground }]}>
              Send invitation
            </Text>
          </Pressable>
          {!!notice && <Text style={[styles.notice, { color: notice.includes('could not') ? colors.destructive : colors.success }]}>{notice}</Text>}
          <Text style={[styles.footnote, { color: colors.mutedForeground }]}>Only friends you have accepted can be invited.</Text>
        </View>

        <View style={styles.listHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your invitations</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              {pendingIncomingCount ? `${pendingIncomingCount} waiting for your response` : 'The plans shared with you'}
            </Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.foreground }]}>{challenges.length}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBlock}>
            {[0, 1].map((item) => <View key={item} style={[styles.skeletonCard, { backgroundColor: colors.muted }]} />)}
          </View>
        ) : error ? (
          <View style={[styles.stateCard, { borderColor: colors.border }]}>
            <Feather name="wifi-off" size={20} color={colors.mutedForeground} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Could not load your plans</Text>
            <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>Check your connection and try again.</Text>
            <Pressable onPress={retry} style={styles.retryButton}><Text style={{ color: colors.primary, fontWeight: '700' }}>Try again</Text></Pressable>
          </View>
        ) : challenges.length === 0 ? (
          <View style={[styles.stateCard, { borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Feather name="users" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>A plan is better shared</Text>
            <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
              Invitations you send or receive will live here. Start by inviting an accepted friend above.
            </Text>
          </View>
        ) : (
          challenges.map((challenge) => {
            const incomingPending = challenge.direction === 'incoming' && challenge.status === 'pending';
            const otherPerson = challenge.direction === 'incoming' ? challenge.challenger : challenge.challenged;
            const isResponding = acceptChallenge.isPending || declineChallenge.isPending;
            return (
              <View key={challenge.id} style={[styles.challengeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.challengeTopline}>
                  <View style={[styles.directionDot, { backgroundColor: incomingPending ? colors.primary : colors.success }]} />
                  <Text style={[styles.directionLabel, { color: colors.mutedForeground }]}>
                    {challenge.direction === 'incoming' ? 'FROM' : 'TO'} {otherPerson.name.toUpperCase()}
                  </Text>
                  <View style={[
                    styles.statusPill,
                    { backgroundColor: challenge.status === 'completed' ? colors.success : colors.muted },
                  ]}>
                    {challenge.status === 'completed' && <Feather name="check-circle" size={12} color={colors.primaryForeground} />}
                    <Text style={[
                      styles.statusText,
                      { color: challenge.status === 'completed' ? colors.primaryForeground : colors.mutedForeground },
                    ]}>{statusCopy(challenge.status)}</Text>
                  </View>
                </View>
                <Text style={[styles.challengeTitle, { color: colors.foreground }]}>{challenge.experienceTitle}</Text>
                <View style={styles.challengeMetaRow}>
                  <Feather name="calendar" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.challengeMeta, { color: colors.mutedForeground }]}>{formatDate(challenge.experienceDate)}</Text>
                  <View style={[styles.metaDot, { backgroundColor: colors.border }]} />
                  <Feather name="map-pin" size={13} color={colors.mutedForeground} />
                  <Text numberOfLines={1} style={[styles.challengeMeta, { color: colors.mutedForeground, flex: 1 }]}>{challenge.experienceCity}</Text>
                </View>
                {incomingPending ? (
                  <View style={styles.responseRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => respond(challenge.id, 'decline')}
                      disabled={isResponding}
                      style={[styles.declineButton, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.declineText, { color: colors.mutedForeground }]}>Decline</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => respond(challenge.id, 'accept')}
                      disabled={isResponding}
                      style={[styles.acceptButton, { backgroundColor: colors.primary }]}
                    >
                      {isResponding ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={15} color={colors.primaryForeground} />}
                      <Text style={[styles.acceptText, { color: colors.primaryForeground }]}>Accept invitation</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.timeline, { borderTopColor: colors.border }]}>
                    <Feather name={challenge.status === 'completed' ? 'check-circle' : challenge.status === 'accepted' ? 'check' : 'clock'} size={14} color={challenge.status === 'completed' ? colors.success : colors.mutedForeground} />
                    <Text style={[styles.timelineText, { color: colors.mutedForeground }]}>
                      {challenge.status === 'completed'
                        ? `Verified${challenge.completedAt ? ` ${formatDate(challenge.completedAt.slice(0, 10))}` : ''}`
                        : challenge.status === 'accepted'
                          ? `Accepted${challenge.acceptedAt ? ` ${formatDate(challenge.acceptedAt.slice(0, 10))}` : ''} · attendance is not yet verified`
                          : challenge.status === 'declined' ? 'This invitation was declined' : 'Invitation sent'}
                    </Text>
                  </View>
                )}
                <Pressable onPress={() => onOpenExperience(challenge.experienceId)} style={styles.experienceLink}>
                  <Text style={[styles.experienceLinkText, { color: colors.primary }]}>View experience</Text>
                  <Feather name="arrow-up-right" size={14} color={colors.primary} />
                </Pressable>
              </View>
            );
          })
        )}
        <View style={{ height: Platform.OS === 'web' ? 36 : 20 }} />
      </ScrollView>
    </View>
  );
}

function OptionLoading({ color }: { color: string }) {
  return <View style={styles.optionLoading}><ActivityIndicator size="small" color={color} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 70 : 14, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { flex: 1, paddingRight: 12 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.6, marginTop: 4 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 270 },
  headerIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  createPanel: { borderRadius: 22, borderWidth: 1, padding: 14 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  panelNumber: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  panelNumberText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  panelTitle: { fontSize: 16, fontWeight: '700' },
  panelHint: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  selector: { minHeight: 60, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 9 },
  selectorIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  selectorCopy: { flex: 1, minWidth: 0 },
  selectorLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  selectorValue: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  optionsPanel: { borderWidth: 1, borderRadius: 14, marginTop: -4, marginBottom: 9, overflow: 'hidden' },
  optionRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  optionTitle: { fontSize: 13, fontWeight: '600' },
  optionMeta: { fontSize: 10, marginTop: 3 },
  noOptions: { padding: 14, fontSize: 12, lineHeight: 17 },
  initials: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontWeight: '700', fontSize: 13 },
  optionLoading: { padding: 18, alignItems: 'center' },
  sendButton: { minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 3 },
  sendButtonText: { fontSize: 13, fontWeight: '700' },
  notice: { fontSize: 11, textAlign: 'center', marginTop: 9, lineHeight: 16 },
  footnote: { fontSize: 10, textAlign: 'center', marginTop: 9 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 12, paddingHorizontal: 3 },
  sectionTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  sectionCaption: { fontSize: 11, marginTop: 3 },
  countPill: { minWidth: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  countText: { fontSize: 12, fontWeight: '700' },
  loadingBlock: { gap: 10 },
  skeletonCard: { height: 148, borderRadius: 19, opacity: 0.8 },
  stateCard: { minHeight: 205, borderWidth: 1, borderRadius: 20, justifyContent: 'center', alignItems: 'center', padding: 24 },
  stateTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 11 },
  stateCopy: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 250, marginTop: 5 },
  retryButton: { padding: 10, marginTop: 3 },
  emptyIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  challengeCard: { borderWidth: 1, borderRadius: 19, padding: 14, marginBottom: 10 },
  challengeTopline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  directionDot: { width: 6, height: 6, borderRadius: 3 },
  directionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, flex: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 9, maxWidth: '58%' },
  statusText: { fontSize: 9, fontWeight: '700', flexShrink: 1 },
  challengeTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', marginTop: 12 },
  challengeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  challengeMeta: { fontSize: 11 },
  metaDot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 2 },
  responseRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  declineButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  declineText: { fontSize: 12, fontWeight: '600' },
  acceptButton: { minHeight: 42, flex: 1, flexDirection: 'row', gap: 7, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  acceptText: { fontSize: 12, fontWeight: '700' },
  timeline: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 12 },
  timelineText: { fontSize: 10, lineHeight: 15, flex: 1 },
  experienceLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 10 },
  experienceLinkText: { fontSize: 11, fontWeight: '700' },
});
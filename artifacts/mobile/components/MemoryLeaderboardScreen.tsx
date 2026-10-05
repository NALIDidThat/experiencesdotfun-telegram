import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useGetMemoryGameLeaderboard,
} from '@workspace/api-client-react';
import type { MemoryGameLeaderboardEntry } from '@workspace/api-client-react';
import { useMemoryGameColors } from '@/hooks/useMemoryGameColors';

type Scope = 'friends' | 'global';

type Props = {
  memoryXp: number;
  onClose: () => void;
  onFindPeople: () => void;
};

function LeaderboardRow({
  entry,
  rank,
}: {
  entry: MemoryGameLeaderboardEntry;
  rank: number;
}) {
  const colors = useMemoryGameColors();
  const rankColor = rank === 1
    ? colors.accent
    : rank === 2
      ? colors.secondary
      : rank === 3
        ? colors.primary
        : colors.welcome.muted;

  return (
    <View
      testID={`memory-leaderboard-entry-${rank}`}
      style={[
        styles.row,
        {
          backgroundColor: entry.isCurrentUser ? `${colors.primary}0B` : colors.welcome.surface,
          borderColor: entry.isCurrentUser ? colors.primary : colors.welcome.border,
        },
      ]}
    >
      <View style={[styles.rankBadge, { backgroundColor: `${rankColor}22` }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>#{rank}</Text>
      </View>
      {entry.avatarUrl ? (
        <Image source={{ uri: entry.avatarUrl }} style={[styles.avatar, { backgroundColor: colors.muted }]} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.muted }]}>
          <Feather name="user" size={17} color={colors.welcome.muted} />
        </View>
      )}
      <View style={styles.playerCopy}>
        <Text numberOfLines={1} style={[styles.playerName, { color: colors.welcome.foreground }]}>
          {entry.name}{entry.isCurrentUser ? ' · You' : ''}
        </Text>
        <Text style={[styles.playerSub, { color: colors.welcome.subdued }]}>
          Level {entry.highestLevel} · {entry.levelsCompleted} cleared · best {entry.bestRun}/7 · {entry.accuracy}% accuracy
        </Text>
      </View>
      <View style={styles.xpColumn}>
        <Text style={[styles.xpValue, { color: colors.welcome.gold }]}>{entry.memoryXp}</Text>
        <Text style={[styles.xpLabel, { color: colors.welcome.subdued }]}>Memory XP</Text>
      </View>
    </View>
  );
}

export function MemoryLeaderboardScreen({ memoryXp, onClose, onFindPeople }: Props) {
  const colors = useMemoryGameColors();
  const [scope, setScope] = useState<Scope>('friends');
  const [page, setPage] = useState(1);
  const query = useGetMemoryGameLeaderboard({ scope, page, pageSize: 20 });
  const response = query.data;
  const entries = response?.entries ?? [];
  const currentUserEntry = response?.currentUserEntry ?? null;
  const currentUserOnPage = entries.some((entry) => entry.isCurrentUser);

  return (
    <View style={[styles.screen, { backgroundColor: colors.welcome.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Memory Game"
          onPress={onClose}
          style={[styles.iconButton, { backgroundColor: colors.muted, borderColor: colors.border }]}
          testID="memory-leaderboard-back"
        >
          <Feather name="chevron-left" size={23} color={colors.welcome.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.teal }]}>MEMORY GAME</Text>
          <Text style={[styles.title, { color: colors.welcome.foreground }]}>Leaderboard</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="award" size={19} color={colors.welcome.gold} />
        </View>
      </View>

      <View style={[styles.xpSummary, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <View style={[styles.xpSummaryIcon, { backgroundColor: `${colors.accent}18` }]}>
          <Feather name="star" size={18} color={colors.welcome.gold} />
        </View>
        <View style={styles.xpSummaryCopy}>
          <Text style={[styles.summaryLabel, { color: colors.welcome.subdued }]}>YOUR MEMORY XP</Text>
          <Text style={[styles.summaryValue, { color: colors.welcome.foreground }]}>{memoryXp}</Text>
        </View>
        <Text style={[styles.summaryHint, { color: colors.welcome.muted }]}>Earned in this game</Text>
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        {(['friends', 'global'] as const).map((value) => {
          const selected = scope === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                setScope(value);
                setPage(1);
              }}
              style={[
                styles.tab,
                selected && { backgroundColor: colors.primary },
              ]}
              testID={`memory-leaderboard-tab-${value}`}
            >
              <Feather
                name={value === 'friends' ? 'users' : 'globe'}
                size={15}
                color={selected ? colors.primaryForeground : colors.welcome.muted}
              />
              <Text style={[styles.tabText, { color: selected ? colors.primaryForeground : colors.welcome.muted }]}>
                {value === 'friends' ? 'Friends' : 'Global'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {query.isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.teal} />
          <Text style={[styles.stateText, { color: colors.welcome.muted }]}>Loading rankings…</Text>
        </View>
      ) : query.isError ? (
        <View style={styles.state}>
          <Feather name="wifi-off" size={25} color={colors.welcome.subdued} />
          <Text style={[styles.stateTitle, { color: colors.welcome.foreground }]}>Rankings are unavailable</Text>
          <Text style={[styles.stateText, { color: colors.welcome.muted }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
            style={[styles.smallButton, { backgroundColor: colors.primary }]}
            testID="memory-leaderboard-retry"
          >
            <Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>Try again</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.state}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name={scope === 'friends' ? 'users' : 'award'} size={24} color={colors.teal} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.welcome.foreground }]}>
            {scope === 'friends'
              ? response?.hasFriends ? 'No friends have played yet' : 'Your friends list is empty'
              : 'No rankings yet'}
          </Text>
          <Text style={[styles.stateText, { color: colors.welcome.muted }]}>
            {scope === 'friends'
              ? response?.hasFriends
                ? 'Play a level and invite your friends to join the challenge.'
                : 'Connect with people to compare your Memory Game progress.'
              : 'Be the first to complete a level and set a score.'}
          </Text>
          {scope === 'friends' && !response?.hasFriends ? (
            <Pressable
              accessibilityRole="button"
              onPress={onFindPeople}
              style={[styles.smallButton, { backgroundColor: colors.primary }]}
              testID="memory-leaderboard-find-people"
            >
              <Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>Find people</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="memory-leaderboard-list"
        >
          <View style={styles.listHeading}>
            <Text style={[styles.listTitle, { color: colors.welcome.foreground }]}>
              {scope === 'friends' ? 'Friends ranking' : 'Global ranking'}
            </Text>
            <Text style={[styles.listMeta, { color: colors.welcome.subdued }]}>
              {response?.totalPlayers ?? 0} {response?.totalPlayers === 1 ? 'player' : 'players'}
            </Text>
          </View>
          {entries.map((entry) => (
            <LeaderboardRow entry={entry} key={entry.rank} rank={entry.rank} />
          ))}
          {currentUserEntry && !currentUserOnPage ? (
            <View style={[styles.currentRankWrap, { borderTopColor: colors.border }]}>
              <Text style={[styles.currentRankLabel, { color: colors.welcome.subdued }]}>YOUR RANK</Text>
              <LeaderboardRow entry={currentUserEntry} rank={currentUserEntry.rank} />
            </View>
          ) : null}
          <View style={styles.pagination}>
            {page > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                style={[styles.pageButton, { borderColor: colors.welcome.border }]}
              >
                <Feather name="chevron-left" size={16} color={colors.welcome.foreground} />
                <Text style={[styles.pageText, { color: colors.welcome.foreground }]}>Previous</Text>
              </Pressable>
            ) : <View />}
            {response?.hasMore ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage((current) => current + 1)}
                style={[styles.pageButton, { borderColor: colors.welcome.border }]}
                testID="memory-leaderboard-next-page"
              >
                <Text style={[styles.pageText, { color: colors.welcome.foreground }]}>Next</Text>
                <Feather name="chevron-right" size={16} color={colors.welcome.foreground} />
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 74, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 2 },
  headerIcon: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  xpSummary: { marginHorizontal: 18, marginTop: 8, padding: 14, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  xpSummaryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  xpSummaryCopy: { flex: 1 },
  summaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 21, marginTop: 1 },
  summaryHint: { fontFamily: 'Inter_500Medium', fontSize: 10, maxWidth: 86, textAlign: 'right' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 15, borderWidth: 1, marginHorizontal: 18, marginTop: 14 },
  tab: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11 },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 36, gap: 10 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, textAlign: 'center', marginTop: 3 },
  stateText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 310 },
  smallButton: { minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 7 },
  smallButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  listContent: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 24, gap: 9 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  listTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  listMeta: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  row: { minHeight: 68, borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: { minWidth: 38, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  playerCopy: { flex: 1, minWidth: 0 },
  playerName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  playerSub: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  xpColumn: { alignItems: 'flex-end', minWidth: 60 },
  xpValue: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  xpLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 },
  currentRankWrap: { marginTop: 10, gap: 7, borderTopWidth: 1, paddingTop: 12 },
  currentRankLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, marginTop: 6 },
  pageButton: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pageText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});

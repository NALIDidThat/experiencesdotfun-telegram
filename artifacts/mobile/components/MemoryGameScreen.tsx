import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMemoryGameLeaderboardQueryKey,
  getGetMemoryGameStatsQueryKey,
  useGetMemoryGameStats,
  usePauseMemoryGameAttempt,
  useResumeMemoryGameAttempt,
  useStartMemoryGameAttempt,
  useSubmitMemoryGameAttempt,
} from '@workspace/api-client-react';
import type {
  MemoryGameAttempt,
  MemoryGameAttemptResult,
  MemoryGameStats,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { MemoryLeaderboardScreen } from '@/components/MemoryLeaderboardScreen';

type Props = {
  onBack: () => void;
  onFindPeople: () => void;
};

type Panel = 'help' | 'leaderboard' | null;

function timestamp(value: Date | string) {
  return typeof value === 'string' ? new Date(value).getTime() : value.getTime();
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, { opacity: disabled ? 0.55 : pressed ? 0.82 : 1 }]}
      testID={testID}
    >
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={styles.primaryButtonFill}
      >
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{label}</Text>
        {icon ? <Feather name={icon} size={17} color={colors.primaryForeground} /> : null}
      </LinearGradient>
    </Pressable>
  );
}

function QuietButton({
  label,
  icon,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quietButton,
        { borderColor: colors.welcome.border, opacity: pressed ? 0.78 : 1 },
      ]}
      testID={testID}
    >
      <Feather name={icon} size={15} color={colors.welcome.muted} />
      <Text style={[styles.quietButtonText, { color: colors.welcome.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function ScreenHeader({
  title,
  eyebrow = 'MEMORY GAME',
  onBack,
  onLeaderboard,
}: {
  title: string;
  eyebrow?: string;
  onBack: () => void;
  onLeaderboard: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={styles.headerButton}
        testID="memory-game-back"
      >
        <Feather name="chevron-left" size={23} color={colors.welcome.foreground} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={[styles.headerEyebrow, { color: colors.teal }]}>{eyebrow}</Text>
        <Text style={[styles.headerTitle, { color: colors.welcome.foreground }]}>{title}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Memory Game leaderboard"
        onPress={onLeaderboard}
        style={styles.headerButton}
        testID="memory-game-leaderboard"
      >
        <Feather name="award" size={19} color={colors.welcome.gold} />
      </Pressable>
    </View>
  );
}

function MessageCard({ children, tone = 'error' }: { children: string; tone?: 'error' | 'info' }) {
  const colors = useColors();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.messageCard,
        {
          backgroundColor: tone === 'error' ? '#492334' : '#20293A',
          borderColor: tone === 'error' ? '#804050' : colors.welcome.border,
        },
      ]}
    >
      <Feather
        name={tone === 'error' ? 'alert-circle' : 'info'}
        size={16}
        color={tone === 'error' ? colors.welcome.error : colors.teal}
      />
      <Text style={[styles.messageText, { color: colors.welcome.foreground }]}>{children}</Text>
    </View>
  );
}

function GameGrid({
  attempt,
  isMemorizing,
  selectedIndices,
  onToggle,
  disabled,
  now,
}: {
  attempt: MemoryGameAttempt;
  isMemorizing: boolean;
  selectedIndices: number[];
  onToggle: (index: number) => void;
  disabled: boolean;
  now: number;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, attempt.columns);
  const gridWidth = Math.min(width - 44, 360);
  const gap = columns >= 5 ? 6 : 8;
  const tileSize = Math.floor((gridWidth - gap * (columns - 1)) / columns);
  const astronautSet = new Set(attempt.astronautIndices);
  const selectedSet = new Set(selectedIndices);
  const remainingMs = Math.max(0, timestamp(attempt.memorizeUntilAt) - now);
  const countdown = Math.ceil(remainingMs / 1000);
  const showPattern = isMemorizing && attempt.phase !== 'paused';

  return (
    <View style={[styles.grid, { width: gridWidth, gap }]}>
      {Array.from({ length: attempt.rows }, (_, row) => (
        <View key={`row-${row}`} style={[styles.gridRow, { gap }]}>
          {Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;
            const isAstronaut = showPattern && astronautSet.has(index);
            const isSelected = selectedSet.has(index);
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={
                  showPattern
                    ? isAstronaut ? `Tile ${index + 1}, astronaut` : `Tile ${index + 1}`
                    : `Tile ${index + 1}${isSelected ? ', selected' : ''}`
                }
                accessibilityState={{ selected: isSelected, disabled: disabled || showPattern }}
                disabled={disabled || showPattern}
                onPress={() => onToggle(index)}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: showPattern
                      ? isAstronaut ? '#3A2851' : colors.welcome.surface
                      : isSelected ? '#432243' : colors.welcome.surface,
                    borderColor: showPattern && isAstronaut
                      ? colors.welcome.gold
                      : isSelected ? colors.primary : colors.welcome.border,
                    borderWidth: (showPattern && isAstronaut) || isSelected ? 2 : 1,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
                testID={`memory-game-tile-${index}`}
              >
                {isAstronaut ? (
                  <FontAwesome5 name="user-astronaut" size={Math.max(18, tileSize * 0.38)} color={colors.welcome.gold} />
                ) : isSelected ? (
                  <Feather name="check" size={Math.max(18, tileSize * 0.32)} color={colors.primaryForeground} />
                ) : (
                  <View style={[styles.tileDot, { backgroundColor: colors.welcome.border }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.gridFooter}>
        {showPattern ? (
          <>
            <Feather name="eye" size={14} color={colors.welcome.gold} />
            <Text style={[styles.gridFooterText, { color: colors.welcome.muted }]}>
              Pattern disappears in {countdown}s
            </Text>
          </>
        ) : (
          <>
            <Feather name="check-square" size={14} color={colors.teal} />
            <Text style={[styles.gridFooterText, { color: colors.welcome.muted }]}>
              {selectedIndices.length} selected
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function StatsStrip({ stats }: { stats: MemoryGameStats }) {
  const colors = useColors();
  const values = [
    { label: 'Memory XP', value: stats.memoryXp, icon: 'star' as const },
    { label: 'Levels cleared', value: stats.levelsCompleted, icon: 'check-circle' as const },
    { label: 'Best run', value: `${stats.bestRun}/7`, icon: 'award' as const },
  ];
  return (
    <View style={styles.statsStrip}>
      {values.map((item) => (
        <View
          key={item.label}
          style={[styles.statCard, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}
        >
          <Feather name={item.icon} size={14} color={colors.teal} />
          <Text numberOfLines={1} style={[styles.statValue, { color: colors.welcome.foreground }]}>{item.value}</Text>
          <Text numberOfLines={1} style={[styles.statLabel, { color: colors.welcome.subdued }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function GameIntro({
  stats,
  needsTutorial,
  isBusy,
  error,
  onStart,
  onHelp,
}: {
  stats: MemoryGameStats;
  needsTutorial: boolean;
  isBusy: boolean;
  error: string | null;
  onStart: () => void;
  onHelp: () => void;
}) {
  const colors = useColors();
  const level = Math.min(Math.max(stats.currentLevel, 1), 7);
  return (
    <ScrollView
      contentContainerStyle={styles.introContent}
      showsVerticalScrollIndicator={false}
      testID="memory-game-home"
    >
      <View style={styles.hero}>
        <LinearGradient
          colors={[colors.secondary, '#351570', colors.primary]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroOrbOne} />
        <View style={styles.heroOrbTwo} />
        <View style={styles.heroTitleRow}>
          <View style={styles.heroIcon}>
            <FontAwesome5 name="user-astronaut" size={21} color={colors.welcome.gold} />
          </View>
          <View style={styles.heroPill}>
            <Text style={[styles.heroPillText, { color: colors.welcome.foreground }]}>7 LEVELS</Text>
          </View>
        </View>
        <Text style={[styles.heroTitle, { color: colors.welcome.foreground }]}>
          Ready for liftoff?
        </Text>
        <Text style={[styles.heroBody, { color: '#F3EFFF' }]}>
          Watch the astronauts, then tap every tile you remember.
        </Text>
        <View style={styles.heroReward}>
          <Feather name="star" size={15} color={colors.welcome.gold} />
          <Text style={[styles.heroRewardText, { color: colors.welcome.foreground }]}>
            +5 Memory XP for every level cleared
          </Text>
        </View>
      </View>

      <View style={styles.introSection}>
        <View style={styles.levelHeading}>
          <View>
            <Text style={[styles.sectionEyebrow, { color: colors.teal }]}>
              {needsTutorial ? 'FIRST FLIGHT' : 'YOUR PROGRESS'}
            </Text>
            <Text style={[styles.sectionTitle, { color: colors.welcome.foreground }]}>
              {needsTutorial ? 'How to play' : `Level ${level} of 7`}
            </Text>
          </View>
          {!needsTutorial ? (
            <View style={[styles.levelBadge, { borderColor: colors.welcome.border, backgroundColor: colors.welcome.surface }]}>
              <Feather name="target" size={15} color={colors.welcome.gold} />
              <Text style={[styles.levelBadgeText, { color: colors.welcome.foreground }]}>{level}/7</Text>
            </View>
          ) : null}
        </View>

        {needsTutorial ? (
          <View style={[styles.instructionCard, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
            <InstructionRow number="1" title="Memorize" body="Study the highlighted astronaut tiles before the timer runs out." />
            <View style={[styles.instructionDivider, { backgroundColor: colors.welcome.border }]} />
            <InstructionRow number="2" title="Recall" body="Tap every astronaut tile, and leave the empty tiles untouched." />
            <View style={[styles.instructionDivider, { backgroundColor: colors.welcome.border }]} />
            <InstructionRow number="3" title="Climb" body="Clear a level to earn 5 Memory XP and unlock the next one." />
          </View>
        ) : (
          <Text style={[styles.progressBody, { color: colors.welcome.muted }]}>
            {stats.currentLevel === 1 && stats.levelsCompleted > 0
              ? 'Your previous run is saved. Start a fresh run whenever you are ready.'
              : 'Each level gives you less time to remember more astronauts.'}
          </Text>
        )}

        <StatsStrip stats={stats} />
        <View style={styles.separateXpNote}>
          <Feather name="lock" size={13} color={colors.welcome.subdued} />
          <Text style={[styles.separateXpText, { color: colors.welcome.subdued }]}>
            Memory XP is separate from your overall Experiences.fun XP.
          </Text>
        </View>
        {error ? <MessageCard>{error}</MessageCard> : null}
        <PrimaryButton
          label={isBusy ? 'Starting…' : needsTutorial ? 'Start the game' : 'Start level'}
          icon={isBusy ? undefined : 'arrow-right'}
          onPress={onStart}
          disabled={isBusy}
          testID="memory-game-start"
        />
        <QuietButton label="How to play" icon="help-circle" onPress={onHelp} testID="memory-game-help" />
      </View>
    </ScrollView>
  );
}

function InstructionRow({ number, title, body }: { number: string; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={styles.instructionRow}>
      <View style={[styles.instructionNumber, { backgroundColor: '#F2078920' }]}>
        <Text style={[styles.instructionNumberText, { color: colors.primary }]}>{number}</Text>
      </View>
      <View style={styles.instructionCopy}>
        <Text style={[styles.instructionTitle, { color: colors.welcome.foreground }]}>{title}</Text>
        <Text style={[styles.instructionBody, { color: colors.welcome.muted }]}>{body}</Text>
      </View>
    </View>
  );
}

function GamePlay({
  attempt,
  now,
  selectedIndices,
  onToggle,
  onSubmit,
  onPause,
  onRetry,
  onHelp,
  busy,
  error,
}: {
  attempt: MemoryGameAttempt;
  now: number;
  selectedIndices: number[];
  onToggle: (index: number) => void;
  onSubmit: () => void;
  onPause: () => void;
  onRetry: () => void;
  onHelp: () => void;
  busy: boolean;
  error: string | null;
}) {
  const colors = useColors();
  const memorizeUntil = timestamp(attempt.memorizeUntilAt);
  const isMemorizing = attempt.phase === 'memorize' && now < memorizeUntil;
  const isExpired = now >= timestamp(attempt.expiresAt);
  const progress = isMemorizing && attempt.memorizationMs > 0
    ? Math.max(0, Math.min(1, (memorizeUntil - now) / attempt.memorizationMs))
    : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.gameContent}
      showsVerticalScrollIndicator={false}
      testID="memory-game-play"
    >
      <View style={styles.gameLevelRow}>
        <View style={styles.gameLevelCopy}>
          <Text style={[styles.sectionEyebrow, { color: colors.teal }]}>LEVEL {attempt.level} OF 7</Text>
          <Text style={[styles.sectionTitle, { color: colors.welcome.foreground }]}>
            {isExpired ? 'Session expired' : isMemorizing ? 'Remember the pattern' : 'Find the astronauts'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause game"
          onPress={onPause}
          disabled={busy || isExpired}
          style={[styles.pauseButton, { borderColor: colors.welcome.border, opacity: busy || isExpired ? 0.5 : 1 }]}
          testID="memory-game-pause"
        >
          <Feather name="pause" size={16} color={colors.welcome.foreground} />
          <Text style={[styles.pauseText, { color: colors.welcome.foreground }]}>Pause</Text>
        </Pressable>
      </View>

      <View style={[styles.phaseCard, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <View style={styles.phaseCopy}>
          <View style={styles.phaseTitleRow}>
            <View style={[styles.phaseDot, { backgroundColor: isMemorizing ? colors.welcome.gold : colors.teal }]} />
            <Text style={[styles.phaseTitle, { color: colors.welcome.foreground }]}>
              {isExpired ? 'Time is up' : isMemorizing ? 'Memorize' : 'Recall'}
            </Text>
          </View>
          <Text style={[styles.phaseSubtitle, { color: colors.welcome.muted }]}>
            {isExpired
              ? 'This attempt has expired. Restart the level to try again.'
              : isMemorizing
                ? `${attempt.astronautCount} astronauts are on the grid.`
                : 'Tap each tile that had an astronaut.'}
          </Text>
        </View>
        {isMemorizing ? (
          <Text style={[styles.phaseCountdown, { color: colors.welcome.gold }]}>
            {Math.ceil(Math.max(0, memorizeUntil - now) / 1000)}s
          </Text>
        ) : (
          <Text style={[styles.phaseCount, { color: colors.teal }]}>
            {selectedIndices.length}/{attempt.astronautCount}
          </Text>
        )}
        {isMemorizing ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.welcome.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.welcome.gold, width: `${progress * 100}%` }]} />
          </View>
        ) : null}
      </View>

      {isExpired ? (
        <View style={styles.expiredCard}>
          <Feather name="clock" size={24} color={colors.welcome.error} />
          <Text style={[styles.expiredTitle, { color: colors.welcome.foreground }]}>This attempt expired</Text>
          <Text style={[styles.expiredBody, { color: colors.welcome.muted }]}>
            Your progress is saved. Restart this level to keep going.
          </Text>
        </View>
      ) : (
        <GameGrid
          attempt={attempt}
          isMemorizing={isMemorizing}
          selectedIndices={selectedIndices}
          onToggle={onToggle}
          disabled={busy}
          now={now}
        />
      )}
      {error ? <MessageCard>{error}</MessageCard> : null}
      {isExpired ? (
        <PrimaryButton label="Retry this level" icon="rotate-ccw" onPress={onRetry} disabled={busy} />
      ) : isMemorizing ? (
        <View style={[styles.waitButton, { borderColor: colors.welcome.border }]}>
          <ActivityIndicator color={colors.teal} size="small" />
          <Text style={[styles.waitText, { color: colors.welcome.muted }]}>Watch carefully…</Text>
        </View>
      ) : (
        <PrimaryButton
          label={busy ? 'Checking…' : 'Check my answer'}
          icon={busy ? undefined : 'check'}
          onPress={onSubmit}
          disabled={busy}
          testID="memory-game-submit"
        />
      )}
      <QuietButton label="How to play" icon="help-circle" onPress={onHelp} testID="memory-game-help" />
    </ScrollView>
  );
}

function PausedPanel({
  attempt,
  busy,
  error,
  onResume,
  onRetry,
}: {
  attempt: MemoryGameAttempt;
  busy: boolean;
  error: string | null;
  onResume: () => void;
  onRetry: () => void;
}) {
  const colors = useColors();
  const pausedAt = attempt.pausedAt ? timestamp(attempt.pausedAt) : Date.now();
  const isExpired = Date.now() >= timestamp(attempt.expiresAt);
  const resumeLabel = attempt.resumePhase === 'memorize' ? 'Resume memorizing' : 'Resume recall';
  return (
    <View style={styles.centerPanel} testID="memory-game-paused">
      <View style={[styles.pauseArtwork, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <Feather name="pause" size={30} color={colors.welcome.gold} />
      </View>
      <Text style={[styles.centerEyebrow, { color: colors.teal }]}>LEVEL {attempt.level} OF 7</Text>
      <Text style={[styles.centerTitle, { color: colors.welcome.foreground }]}>Game paused</Text>
      <Text style={[styles.centerBody, { color: colors.welcome.muted }]}>
        {isExpired
          ? 'This attempt has expired. Restart this level when you are ready.'
          : attempt.resumePhase === 'memorize'
            ? `Your pattern is saved with ${Math.ceil(Math.max(0, attempt.remainingMs) / 1000)} seconds left.`
            : 'Your selected tiles are saved. Take a moment, then continue.'}
      </Text>
      {pausedAt > timestamp(attempt.expiresAt) ? (
        <MessageCard>This attempt has expired.</MessageCard>
      ) : null}
      {error ? <MessageCard>{error}</MessageCard> : null}
      {!isExpired ? (
        <PrimaryButton label={busy ? 'Resuming…' : resumeLabel} icon="play" onPress={onResume} disabled={busy} testID="memory-game-resume" />
      ) : null}
      <QuietButton
        label={isExpired ? 'Start this level again' : 'Retry this level'}
        icon="rotate-ccw"
        onPress={onRetry}
        testID="memory-game-retry"
      />
    </View>
  );
}

function ResultPanel({
  result,
  busy,
  error,
  onNext,
  onRetry,
  onLeaderboard,
}: {
  result: MemoryGameAttemptResult;
  busy: boolean;
  error: string | null;
  onNext: () => void;
  onRetry: () => void;
  onLeaderboard: () => void;
}) {
  const colors = useColors();
  const rankBefore = result.globalRankBefore;
  const rankAfter = result.globalRankAfter;
  let rankCopy: string | null = null;
  if (rankAfter !== null && rankBefore !== null && rankAfter < rankBefore) {
    rankCopy = `You moved up ${rankBefore - rankAfter} ${rankBefore - rankAfter === 1 ? 'place' : 'places'} globally.`;
  } else if (rankAfter !== null && rankBefore === null) {
    rankCopy = `You are now ranked #${rankAfter} globally.`;
  } else if (rankAfter !== null) {
    rankCopy = `Your global rank is #${rankAfter}.`;
  }
  return (
    <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false} testID="memory-game-result">
      <View style={[styles.resultIcon, { backgroundColor: result.successful ? '#FFD16620' : '#F2078920' }]}>
        <Feather
          name={result.successful ? result.runCompleted ? 'award' : 'check' : 'rotate-ccw'}
          size={28}
          color={result.successful ? colors.welcome.gold : colors.primary}
        />
      </View>
      <Text style={[styles.centerEyebrow, { color: colors.teal }]}>LEVEL {result.level} OF 7</Text>
      <Text style={[styles.centerTitle, { color: colors.welcome.foreground }]}>
        {result.successful ? result.runCompleted ? 'Full run complete!' : 'Level cleared!' : 'Not quite yet'}
      </Text>
      <Text style={[styles.centerBody, { color: colors.welcome.muted }]}>
        {result.successful
          ? `${result.correctSelections} astronaut tiles remembered correctly.`
          : `${result.correctSelections} of the astronaut tiles were selected. Your progress is saved.`}
      </Text>

      <View style={[styles.rewardCard, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <View style={[styles.rewardIcon, { backgroundColor: '#FFD16620' }]}>
          <Feather name="star" size={17} color={colors.welcome.gold} />
        </View>
        <View style={styles.rewardCopy}>
          <Text style={[styles.rewardTitle, { color: colors.welcome.foreground }]}>
            {result.successful ? `+${result.xpAwarded} Memory XP` : 'Memory XP unchanged'}
          </Text>
          <Text style={[styles.rewardSub, { color: colors.welcome.subdued }]}>
            {result.successful ? 'Added to your Memory Game score' : 'Clear the level to earn 5 Memory XP'}
          </Text>
        </View>
        <Text style={[styles.rewardTotal, { color: colors.welcome.gold }]}>{result.stats.memoryXp}</Text>
      </View>

      {rankCopy ? (
        <View style={[styles.rankChange, { backgroundColor: '#20293A', borderColor: colors.welcome.border }]}>
          <Feather name="trending-up" size={16} color={colors.teal} />
          <Text style={[styles.rankChangeText, { color: colors.welcome.foreground }]}>{rankCopy}</Text>
        </View>
      ) : null}
      {error ? <MessageCard>{error}</MessageCard> : null}

      {result.successful ? (
        <PrimaryButton
          label={busy ? 'Starting…' : result.runCompleted ? 'Start a new run' : 'Next level'}
          icon="arrow-right"
          onPress={onNext}
          disabled={busy}
          testID="memory-game-next-level"
        />
      ) : (
        <PrimaryButton
          label={busy ? 'Restarting…' : 'Retry this level'}
          icon="rotate-ccw"
          onPress={onRetry}
          disabled={busy}
          testID="memory-game-retry"
        />
      )}
      <QuietButton label="Memory leaderboard" icon="award" onPress={onLeaderboard} testID="memory-game-result-leaderboard" />
    </ScrollView>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  return (
    <ScrollView contentContainerStyle={styles.helpContent} showsVerticalScrollIndicator={false} testID="memory-game-help-panel">
      <View style={[styles.helpIcon, { backgroundColor: '#6805F222' }]}>
        <Feather name="help-circle" size={25} color={colors.teal} />
      </View>
      <Text style={[styles.centerEyebrow, { color: colors.teal }]}>QUICK GUIDE</Text>
      <Text style={[styles.centerTitle, { color: colors.welcome.foreground }]}>How to play</Text>
      <Text style={[styles.centerBody, { color: colors.welcome.muted }]}>
        Remember where the astronauts appear. When they disappear, select those tiles and submit your answer.
      </Text>
      <View style={[styles.helpCard, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <InstructionRow number="1" title="Watch" body="The pattern is visible only for a short time." />
        <View style={[styles.instructionDivider, { backgroundColor: colors.welcome.border }]} />
        <InstructionRow number="2" title="Select" body="Choose every astronaut tile. Empty tiles count against your answer." />
        <View style={[styles.instructionDivider, { backgroundColor: colors.welcome.border }]} />
        <InstructionRow number="3" title="Earn" body="A correct level awards 5 Memory XP. Seven levels make a full run." />
      </View>
      <PrimaryButton label="Back to game" icon="arrow-left" onPress={onClose} testID="memory-game-help-close" />
    </ScrollView>
  );
}

export function MemoryGameScreen({ onBack, onFindPeople }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const statsQuery = useGetMemoryGameStats();
  const startAttempt = useStartMemoryGameAttempt();
  const pauseAttempt = usePauseMemoryGameAttempt();
  const resumeAttempt = useResumeMemoryGameAttempt();
  const submitAttempt = useSubmitMemoryGameAttempt();
  const [localAttempt, setLocalAttempt] = useState<MemoryGameAttempt | null | undefined>(undefined);
  const [statsOverride, setStatsOverride] = useState<MemoryGameStats | null>(null);
  const [result, setResult] = useState<MemoryGameAttemptResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [now, setNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [exitPending, setExitPending] = useState(false);
  const activeAttempt = localAttempt === undefined
    ? statsQuery.data?.activeAttempt ?? null
    : localAttempt;
  const stats = statsOverride ?? statsQuery.data?.stats;
  const busy = startAttempt.isPending || pauseAttempt.isPending || resumeAttempt.isPending || submitAttempt.isPending || exitPending;
  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 48) : insets.top + 8;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(timer);
  }, []);

  const invalidateGameQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetMemoryGameStatsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMemoryGameLeaderboardQueryKey() }),
    ]);
  };

  const beginAttempt = async (restart: boolean) => {
    setActionError(null);
    setSelectedIndices([]);
    try {
      const attempt = await startAttempt.mutateAsync({ data: { restart } });
      setLocalAttempt(attempt);
      setResult(null);
      void invalidateGameQueries();
    } catch (error) {
      setActionError(errorMessage(error, 'We could not start the game. Try again.'));
    }
  };

  const pauseActiveAttempt = async () => {
    if (!activeAttempt) return null;
    setActionError(null);
    try {
      const attempt = await pauseAttempt.mutateAsync({ attemptId: activeAttempt.id });
      setLocalAttempt(attempt);
      setSelectedIndices(attempt.selectedIndices);
      return attempt;
    } catch (error) {
      setActionError(errorMessage(error, 'We could not pause the game. Try again.'));
      return null;
    }
  };

  const handleExit = async () => {
    if (!activeAttempt || activeAttempt.phase === 'paused' || now >= timestamp(activeAttempt.expiresAt)) {
      onBack();
      return;
    }
    setExitPending(true);
    const paused = await pauseActiveAttempt();
    setExitPending(false);
    if (paused) onBack();
  };

  const handleResume = async () => {
    if (!activeAttempt) return;
    setActionError(null);
    try {
      const attempt = await resumeAttempt.mutateAsync({ attemptId: activeAttempt.id });
      setLocalAttempt(attempt);
      setSelectedIndices(attempt.selectedIndices);
    } catch (error) {
      setActionError(errorMessage(error, 'We could not resume the game. Try again.'));
    }
  };

  const handleSubmit = async () => {
    if (!activeAttempt) return;
    setActionError(null);
    const attemptBeforeSubmit = activeAttempt;
    try {
      const submitted = await submitAttempt.mutateAsync({
        attemptId: activeAttempt.id,
        data: { selectedIndices: [...selectedIndices].sort((left, right) => left - right) },
      });
      setResult(submitted);
      setStatsOverride(submitted.stats);
      setLocalAttempt(null);
      setSelectedIndices([]);
      void invalidateGameQueries();
    } catch (error) {
      setActionError(errorMessage(error, 'We could not check your answer. Try again.'));
      setLocalAttempt(attemptBeforeSubmit);
    }
  };

  const handleToggleTile = (index: number) => {
    setSelectedIndices((current) => current.includes(index)
      ? current.filter((selected) => selected !== index)
      : [...current, index]);
  };

  if (panel === 'leaderboard') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.welcome.background, paddingTop: topInset, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <StatusBar barStyle="light-content" />
        <MemoryLeaderboardScreen
          memoryXp={stats?.memoryXp ?? 0}
          onClose={() => setPanel(null)}
          onFindPeople={() => {
            setPanel(null);
            onFindPeople();
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.welcome.background,
          paddingTop: topInset,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
      testID="memory-game-screen"
    >
      <StatusBar barStyle="light-content" />
      {panel === 'help' ? (
        <>
          <ScreenHeader title="How to play" onBack={() => setPanel(null)} onLeaderboard={() => setPanel('leaderboard')} />
          <HelpPanel onClose={() => setPanel(null)} />
        </>
      ) : result ? (
        <>
          <ScreenHeader title="Level result" onBack={handleExit} onLeaderboard={() => setPanel('leaderboard')} />
          <ResultPanel
            result={result}
            busy={busy}
            error={actionError}
            onNext={() => void beginAttempt(false)}
            onRetry={() => void beginAttempt(true)}
            onLeaderboard={() => setPanel('leaderboard')}
          />
        </>
      ) : statsQuery.isLoading && !statsQuery.data ? (
        <>
          <ScreenHeader title="Loading…" onBack={onBack} onLeaderboard={() => setPanel('leaderboard')} />
          <View style={styles.centerPanel}>
            <ActivityIndicator color={colors.teal} size="large" />
            <Text style={[styles.centerBody, { color: colors.welcome.muted }]}>Loading your game progress…</Text>
          </View>
        </>
      ) : statsQuery.isError && !statsQuery.data ? (
        <>
          <ScreenHeader title="Game unavailable" onBack={onBack} onLeaderboard={() => setPanel('leaderboard')} />
          <View style={styles.centerPanel}>
            <View style={[styles.helpIcon, { backgroundColor: colors.welcome.surface }]}>
              <Feather name="wifi-off" size={24} color={colors.welcome.subdued} />
            </View>
            <Text style={[styles.centerTitle, { color: colors.welcome.foreground }]}>Couldn’t load the game</Text>
            <Text style={[styles.centerBody, { color: colors.welcome.muted }]}>
              Check your connection and try again. Your saved progress will remain on your profile.
            </Text>
            <PrimaryButton label="Try again" icon="refresh-cw" onPress={() => void statsQuery.refetch()} testID="memory-game-retry-load" />
          </View>
        </>
      ) : panel === null && activeAttempt?.phase === 'paused' ? (
        <>
          <ScreenHeader title="Game paused" onBack={handleExit} onLeaderboard={() => setPanel('leaderboard')} />
          <PausedPanel
            attempt={activeAttempt}
            busy={busy}
            error={actionError}
            onResume={() => void handleResume()}
            onRetry={() => void beginAttempt(true)}
          />
        </>
      ) : panel === null && activeAttempt ? (
        <>
          <ScreenHeader title={`Level ${activeAttempt.level}`} onBack={handleExit} onLeaderboard={() => setPanel('leaderboard')} />
          <GamePlay
            attempt={activeAttempt}
            now={now}
            selectedIndices={selectedIndices}
            onToggle={handleToggleTile}
            onSubmit={() => void handleSubmit()}
            onPause={() => void pauseActiveAttempt()}
            onRetry={() => void beginAttempt(true)}
            onHelp={() => setPanel('help')}
            busy={busy}
            error={actionError}
          />
        </>
      ) : (
        <>
          <ScreenHeader title="Memory Game" onBack={onBack} onLeaderboard={() => setPanel('leaderboard')} />
          {stats ? (
            <GameIntro
              stats={stats}
              needsTutorial={Boolean(statsQuery.data?.needsTutorial && !result)}
              isBusy={busy}
              error={actionError}
              onStart={() => void beginAttempt(false)}
              onHelp={() => setPanel('help')}
            />
          ) : (
            <View style={styles.centerPanel}>
              <ActivityIndicator color={colors.teal} />
              <Text style={[styles.centerBody, { color: colors.welcome.muted }]}>Loading your progress…</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  header: { minHeight: 66, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerButton: { width: 40, height: 40, borderRadius: 15, backgroundColor: '#1A1D2B', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.6 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 2 },
  introContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 18 },
  hero: { minHeight: 206, borderRadius: 24, overflow: 'hidden', padding: 20, justifyContent: 'center' },
  heroOrbOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#FFFFFF0D', right: -58, top: -71 },
  heroOrbTwo: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF0B', right: 29, bottom: -34 },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  heroIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' },
  heroPill: { backgroundColor: '#FFFFFF1A', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  heroPillText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.3 },
  heroBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, maxWidth: 280, marginTop: 7 },
  heroReward: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  heroRewardText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  introSection: { gap: 13 },
  levelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.4 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, marginTop: 4 },
  levelBadge: { borderWidth: 1, borderRadius: 13, minWidth: 64, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  levelBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  progressBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: -3 },
  instructionCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 4, gap: 0 },
  instructionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  instructionNumber: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  instructionNumberText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  instructionCopy: { flex: 1 },
  instructionTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  instructionBody: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  instructionDivider: { height: 1, marginLeft: 43 },
  statsStrip: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, minWidth: 0, minHeight: 77, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 9 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 5 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 },
  separateXpNote: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  separateXpText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 50, borderRadius: 16, overflow: 'hidden' },
  primaryButtonFill: { flex: 1, minHeight: 50, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  quietButton: { minHeight: 43, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quietButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  gameContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 25, alignItems: 'center', gap: 14 },
  gameLevelRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  gameLevelCopy: { flex: 1 },
  pauseButton: { minHeight: 37, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pauseText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  phaseCard: { width: '100%', minHeight: 76, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11, flexWrap: 'wrap' },
  phaseCopy: { flex: 1, minWidth: 180 },
  phaseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  phaseDot: { width: 7, height: 7, borderRadius: 4 },
  phaseTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  phaseSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4, lineHeight: 14 },
  phaseCountdown: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  phaseCount: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  progressTrack: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  grid: { alignItems: 'center', alignSelf: 'center' },
  gridRow: { flexDirection: 'row', justifyContent: 'center' },
  tile: { borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tileDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.65 },
  gridFooter: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  gridFooterText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  waitButton: { width: '100%', minHeight: 50, borderWidth: 1, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  waitText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  expiredCard: { minHeight: 185, width: '100%', borderRadius: 21, backgroundColor: '#1A1D2B', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 9 },
  expiredTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 3 },
  expiredBody: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 260 },
  messageCard: { minHeight: 43, width: '100%', borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  centerPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, paddingBottom: 30, gap: 13 },
  centerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.6, marginTop: 9, textAlign: 'center' },
  centerTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, textAlign: 'center', marginTop: 2 },
  centerBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  pauseArtwork: { width: 75, height: 75, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  resultContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 12 },
  resultIcon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rewardCard: { width: '100%', minHeight: 70, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rewardIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rewardCopy: { flex: 1 },
  rewardTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  rewardSub: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  rewardTotal: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  rankChange: { width: '100%', minHeight: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankChangeText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  helpContent: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 25, alignItems: 'center', justifyContent: 'center', gap: 13 },
  helpIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  helpCard: { width: '100%', borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, marginVertical: 7 },
});

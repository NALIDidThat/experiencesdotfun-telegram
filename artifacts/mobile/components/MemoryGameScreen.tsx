import React, { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from '@/components/LinearGradient';
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
import { useMemoryGameColors } from '@/hooks/useMemoryGameColors';
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
  iconOnLeft = false,
  endIcon,
  prominent = false,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  iconOnLeft?: boolean;
  endIcon?: keyof typeof Feather.glyphMap;
  prominent?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const colors = useMemoryGameColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        prominent && styles.primaryButtonProminent,
        { opacity: disabled ? 0.55 : pressed ? 0.82 : 1 },
      ]}
      testID={testID}
    >
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={[styles.primaryButtonFill, prominent && styles.primaryButtonFillProminent]}
      >
        {icon && iconOnLeft ? <Feather name={icon} size={19} color={colors.primaryForeground} /> : null}
        <Text style={[styles.primaryButtonText, prominent && styles.primaryButtonTextProminent, { color: colors.primaryForeground }]}>{label}</Text>
        {endIcon ? <Feather name={endIcon} size={17} color={colors.primaryForeground} /> : null}
        {icon && !iconOnLeft && !endIcon ? <Feather name={icon} size={17} color={colors.primaryForeground} /> : null}
      </LinearGradient>
    </Pressable>
  );
}

function QuietButton({
  label,
  icon,
  endIcon,
  dark = false,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  endIcon?: keyof typeof Feather.glyphMap;
  dark?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useMemoryGameColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quietButton,
        dark && styles.quietButtonDark,
        {
          borderColor: dark ? `${colors.space.border}B0` : colors.welcome.border,
          backgroundColor: dark ? `${colors.space.surface}B8` : colors.card,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
      testID={testID}
    >
      <Feather name={icon} size={15} color={dark ? colors.space.muted : colors.welcome.muted} />
      <Text style={[styles.quietButtonText, { color: dark ? colors.space.foreground : colors.welcome.foreground }]}>{label}</Text>
      {endIcon ? <Feather name={endIcon} size={15} color={dark ? colors.space.muted : colors.welcome.muted} /> : null}
    </Pressable>
  );
}

function ScreenHeader({
  title,
  eyebrow = 'MEMORY GAME',
  dark = false,
  controlsOnly = false,
  onBack,
  onLeaderboard,
}: {
  title: string;
  eyebrow?: string;
  dark?: boolean;
  controlsOnly?: boolean;
  onBack: () => void;
  onLeaderboard: () => void;
}) {
  const colors = useMemoryGameColors();
  return (
    <View style={[styles.header, controlsOnly && styles.headerControlsOnly]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={[styles.headerButton, {
          backgroundColor: dark ? `${colors.space.surface}C8` : colors.muted,
          borderColor: dark ? `${colors.space.border}B0` : colors.border,
        }]}
        testID="memory-game-back"
      >
        <Feather name="chevron-left" size={23} color={dark ? colors.space.foreground : colors.welcome.foreground} />
      </Pressable>
      {!controlsOnly ? (
        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: dark ? colors.space.muted : colors.teal }]}>{eyebrow}</Text>
          <Text style={[styles.headerTitle, { color: dark ? colors.space.foreground : colors.welcome.foreground }]}>{title}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Memory Game leaderboard"
        onPress={onLeaderboard}
        style={[styles.headerButton, {
          backgroundColor: dark ? `${colors.space.surface}C8` : colors.muted,
          borderColor: dark ? `${colors.space.border}B0` : colors.border,
        }]}
        testID="memory-game-leaderboard"
      >
        <Feather name="award" size={19} color={dark ? colors.space.gold : colors.welcome.gold} />
      </Pressable>
    </View>
  );
}

function MessageCard({ children, tone = 'error', dark = false }: { children: string; tone?: 'error' | 'info'; dark?: boolean }) {
  const colors = useMemoryGameColors();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.messageCard,
        {
          backgroundColor: tone === 'error' ? `${colors.destructive}12` : `${colors.accent}12`,
          borderColor: tone === 'error' ? `${colors.destructive}40` : `${colors.accent}40`,
        },
      ]}
    >
      <Feather
        name={tone === 'error' ? 'alert-circle' : 'info'}
        size={16}
        color={tone === 'error' ? (dark ? colors.space.error : colors.welcome.error) : colors.teal}
      />
      <Text style={[styles.messageText, { color: dark ? colors.space.foreground : colors.welcome.foreground }]}>{children}</Text>
    </View>
  );
}

function GameGrid({
  attempt,
  isMemorizing,
  selectedIndices,
  onToggle,
  disabled,
}: {
  attempt: MemoryGameAttempt;
  isMemorizing: boolean;
  selectedIndices: number[];
  onToggle: (index: number) => void;
  disabled: boolean;
}) {
  const colors = useMemoryGameColors();
  const { width, height } = useWindowDimensions();
  const columns = Math.max(1, attempt.columns);
  const gridWidth = Math.min(width - 44, 360);
  const gap = columns >= 8 ? 3 : columns >= 5 ? 5 : 8;
  const tileSize = Math.min(
    Math.floor((gridWidth - gap * (columns - 1)) / columns),
    Math.floor(Math.max(24, (height - 510) / attempt.rows)),
  );
  const astronautSet = new Set(attempt.astronautIndices);
  const selectedSet = new Set(selectedIndices);
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
                      ? isAstronaut ? `${colors.secondary}42` : `${colors.space.surface}B8`
                      : isSelected ? `${colors.primary}E8` : `${colors.space.surface}D8`,
                    borderColor: showPattern && isAstronaut
                      ? colors.secondary
                      : isSelected ? colors.primary : colors.space.border,
                    borderWidth: (showPattern && isAstronaut) || isSelected ? 2 : 1,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
                testID={`memory-game-tile-${index}`}
              >
                {isAstronaut ? (
                  <FontAwesome5 name="user-astronaut" size={Math.max(18, tileSize * 0.38)} color={colors.accent} />
                ) : isSelected ? (
                  <Feather name="check" size={Math.max(18, tileSize * 0.32)} color={colors.primaryForeground} />
                ) : (
                  <View style={[styles.tileDot, { backgroundColor: colors.space.border }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.gridFooter}>
        {showPattern ? (
          <>
          <Feather name="eye" size={14} color={colors.space.gold} />
            <Text style={[styles.gridFooterText, { color: colors.space.muted }]}>
              Study the highlighted tiles
            </Text>
          </>
        ) : (
          <>
          <Feather name="check-square" size={14} color={colors.teal} />
            <Text style={[styles.gridFooterText, { color: colors.space.muted }]}>
              {selectedIndices.length} selected
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function StatsStrip({ stats }: { stats: MemoryGameStats }) {
  const colors = useMemoryGameColors();
  const values = [
    { label: 'Game score', value: stats.memoryXp, icon: 'star' as const },
    { label: 'Levels cleared', value: stats.levelsCompleted, icon: 'check-circle' as const },
    { label: 'Best run', value: `${stats.bestRun}/100`, icon: 'award' as const },
  ];
  return (
    <View style={styles.statsStrip}>
      {values.map((item) => (
        <View
          key={item.label}
          style={[styles.statCard, { backgroundColor: `${colors.space.surface}D9`, borderColor: `${colors.space.border}D0` }]}
        >
          <Feather name={item.icon} size={18} color={item.icon === 'star' ? colors.primary : item.icon === 'award' ? colors.secondary : colors.teal} />
          <Text numberOfLines={1} style={[styles.statValue, { color: colors.space.foreground }]}>{item.value}</Text>
          <Text numberOfLines={1} style={[styles.statLabel, { color: colors.space.muted }]}>{item.label}</Text>
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
  const colors = useMemoryGameColors();
  const level = Math.min(Math.max(stats.currentLevel, 1), 100);
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const perks: { icon: keyof typeof Feather.glyphMap; label: string; color: string }[] = [
    { icon: 'star', label: '+5 game-score points per level', color: colors.primary },
    { icon: 'zap', label: '50 official XP daily limit', color: colors.secondary },
    { icon: 'award', label: 'Up to 100 levels', color: colors.space.gold },
  ];
  return (
    <ImageBackground
      source={require('../assets/images/memory-game-space-background.png')}
      resizeMode="cover"
      style={styles.introContent}
      testID="memory-game-home"
    >
      <LinearGradient
        colors={[`${colors.space.background}C8`, `${colors.space.background}48`, `${colors.space.background}B8`]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.introContentInner}>
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroBrand}>
              <View style={[styles.heroIcon, { backgroundColor: `${colors.secondary}30`, borderColor: `${colors.primary}65` }]}>
                <FontAwesome5 name="gamepad" size={19} color={colors.primary} />
              </View>
              <Text style={[styles.heroBrandText, { color: colors.accent }]}>MEMORY GAME</Text>
            </View>
            <View style={[styles.heroPill, { backgroundColor: `${colors.space.surface}B8`, borderColor: `${colors.space.border}D0` }]}>
              <Feather name="award" size={12} color={colors.space.gold} />
              <Text style={[styles.heroPillText, { color: colors.space.foreground }]}>UP TO 100 LEVELS</Text>
            </View>
          </View>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact, { color: colors.space.foreground }]}>
            Ready for{' '}
            <Text style={{ color: colors.primary }}>liftoff?</Text>
          </Text>
          <Text style={[styles.heroBody, { color: colors.space.foreground }]}>
            Watch the astronauts, then tap every tile you remember.
          </Text>
          <View style={styles.heroPerks}>
            {perks.map((perk) => (
              <View key={perk.label} style={styles.heroReward}>
                <Feather name={perk.icon} size={16} color={perk.color} />
                <Text style={[styles.heroRewardText, { color: colors.space.foreground }]}>{perk.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.introSection}>
          <View style={[styles.progressCard, { backgroundColor: `${colors.space.surface}D9`, borderColor: `${colors.space.border}D0` }]}>
            <View style={styles.levelHeading}>
              <View style={styles.progressCopy}>
                <Text style={[styles.sectionEyebrow, { color: colors.accent }]}>
                  {needsTutorial ? 'FIRST FLIGHT' : 'YOUR PROGRESS'}
                </Text>
                <Text style={[styles.sectionTitle, { color: colors.space.foreground }]}>
                  {needsTutorial ? 'How to play' : `Level ${level} of 100`}
                </Text>
              </View>
              <View style={[styles.levelBadge, { borderColor: `${colors.space.border}D0`, backgroundColor: `${colors.space.background}75` }]}>
                <Feather name="target" size={15} color={colors.accent} />
                <Text style={[styles.levelBadgeText, { color: colors.space.foreground }]}>{level}/100</Text>
              </View>
            </View>
            <View style={[styles.introProgressTrack, { backgroundColor: `${colors.space.background}C8` }]}>
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                end={{ x: 1, y: 0 }}
                start={{ x: 0, y: 0 }}
                style={[styles.introProgressFill, { width: `${level}%` }]}
              />
            </View>
            <Text style={[styles.progressBody, { color: colors.space.muted }]}>
              {needsTutorial
                ? 'Memorize the highlighted tiles, then tap each astronaut.'
                : stats.currentLevel === 1 && stats.levelsCompleted > 0
                  ? 'Your previous run is saved. Start a fresh run whenever you are ready.'
                  : 'Patterns grow as you progress. Recall time: 3 seconds for levels 1–5, then 5 seconds.'}
            </Text>
          </View>

          <StatsStrip stats={stats} />
          <View style={[styles.separateXpNote, { backgroundColor: `${colors.space.surface}C8`, borderColor: `${colors.space.border}B8` }]}>
            <Feather name="lock" size={14} color={colors.space.subdued} />
            <Text style={[styles.separateXpText, { color: colors.space.muted }]}>
              Your game score keeps growing. Official Memory Game XP is capped at 50 per day.
            </Text>
          </View>
          {error ? <MessageCard dark>{error}</MessageCard> : null}
          <PrimaryButton
            label={isBusy ? 'Starting…' : needsTutorial ? 'Start the game' : `Start level ${level}`}
            icon={isBusy ? undefined : 'play'}
            iconOnLeft
            endIcon={isBusy ? undefined : 'arrow-right'}
            prominent
            onPress={onStart}
            disabled={isBusy}
            testID="memory-game-start"
          />
          <QuietButton label="How to play" icon="help-circle" endIcon="chevron-right" dark onPress={onHelp} testID="memory-game-help" />
        </View>
      </View>
    </ImageBackground>
  );
}

function InstructionRow({ number, title, body }: { number: string; title: string; body: string }) {
  const colors = useMemoryGameColors();
  return (
    <View style={styles.instructionRow}>
      <View style={[styles.instructionNumber, { backgroundColor: `${colors.primary}24`, borderColor: `${colors.primary}50` }]}>
        <Text style={[styles.instructionNumberText, { color: colors.primary }]}>{number}</Text>
      </View>
      <View style={styles.instructionCopy}>
        <Text style={[styles.instructionTitle, { color: colors.space.foreground }]}>{title}</Text>
        <Text style={[styles.instructionBody, { color: colors.space.muted }]}>{body}</Text>
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
  const colors = useMemoryGameColors();
  const memorizeUntil = timestamp(attempt.memorizeUntilAt);
  const isMemorizing = attempt.phase === 'memorize' && now < memorizeUntil;
  const isExpired = now >= timestamp(attempt.expiresAt);
  return (
    <View
      style={styles.gameContent}
      testID="memory-game-play"
    >
      <View style={styles.gameLevelRow}>
        <View style={styles.gameLevelCopy}>
            <Text style={[styles.sectionEyebrow, { color: colors.accent }]}>LEVEL {attempt.level} OF 100</Text>
          <Text style={[styles.sectionTitle, { color: colors.space.foreground }]}>
            {isExpired ? 'Session expired' : isMemorizing ? 'Remember the pattern' : 'Find the astronauts'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause game"
          onPress={onPause}
          disabled={busy || isExpired}
          style={[styles.pauseButton, { backgroundColor: `${colors.space.surface}D8`, borderColor: colors.space.border, opacity: busy || isExpired ? 0.5 : 1 }]}
          testID="memory-game-pause"
        >
          <Feather name="pause" size={16} color={colors.space.foreground} />
          <Text style={[styles.pauseText, { color: colors.space.foreground }]}>Pause</Text>
        </Pressable>
      </View>

      <View style={[styles.phaseCard, { backgroundColor: `${colors.space.surface}E8`, borderColor: colors.space.border }]}>
        <View style={styles.phaseCopy}>
          <View style={styles.phaseTitleRow}>
            <View style={[styles.phaseDot, { backgroundColor: isMemorizing ? colors.space.gold : colors.teal }]} />
            <Text style={[styles.phaseTitle, { color: colors.space.foreground }]}>
              {isExpired ? 'Time is up' : isMemorizing ? 'Memorize' : 'Recall'}
            </Text>
          </View>
          <Text style={[styles.phaseSubtitle, { color: colors.space.muted }]}>
            {isExpired
              ? 'This attempt has expired. Restart the level to try again.'
              : isMemorizing
                ? `${attempt.astronautCount} astronauts are on the grid.`
                : 'Tap each tile that had an astronaut.'}
          </Text>
        </View>
        {isMemorizing ? (
          <View accessibilityLabel={`${Math.ceil(Math.max(0, memorizeUntil - now) / 1000)} seconds remaining`} style={styles.countdownPips}>
            {Array.from({ length: 5 }, (_, index) => (
              <View
                key={index}
                style={[styles.countdownPip, {
                  backgroundColor: index < Math.ceil(Math.max(0, memorizeUntil - now) / 1000)
                    ? colors.space.gold
                    : colors.space.border,
                }]}
              />
            ))}
            <Text style={[styles.phaseCountdown, { color: colors.space.gold }]}>
              {Math.ceil(Math.max(0, memorizeUntil - now) / 1000)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.phaseCount, { color: colors.teal }]}>
            {selectedIndices.length}/{attempt.astronautCount}
          </Text>
        )}
      </View>

      {isExpired ? (
        <View style={[styles.expiredCard, { backgroundColor: colors.space.surface, borderColor: colors.space.border }]}>
          <Feather name="clock" size={24} color={colors.space.error} />
          <Text style={[styles.expiredTitle, { color: colors.space.foreground }]}>This attempt expired</Text>
          <Text style={[styles.expiredBody, { color: colors.space.muted }]}>
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
        />
      )}
      {error ? <MessageCard dark>{error}</MessageCard> : null}
      {isExpired ? (
        <PrimaryButton label="Retry this level" icon="rotate-ccw" onPress={onRetry} disabled={busy} />
      ) : isMemorizing ? (
        <View style={[styles.waitButton, { backgroundColor: `${colors.space.surface}B8`, borderColor: colors.space.border }]}>
          <ActivityIndicator color={colors.teal} size="small" />
          <Text style={[styles.waitText, { color: colors.space.muted }]}>Watch carefully…</Text>
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
      <QuietButton label="How to play" icon="help-circle" dark onPress={onHelp} testID="memory-game-help" />
    </View>
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
  const colors = useMemoryGameColors();
  const pausedAt = attempt.pausedAt ? timestamp(attempt.pausedAt) : Date.now();
  const isExpired = Date.now() >= timestamp(attempt.expiresAt);
  const resumeLabel = attempt.resumePhase === 'memorize' ? 'Resume memorizing' : 'Resume recall';
  return (
    <View style={styles.centerPanel} testID="memory-game-paused">
      <View style={[styles.pauseArtwork, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <Feather name="pause" size={30} color={colors.welcome.gold} />
      </View>
      <Text style={[styles.centerEyebrow, { color: colors.teal }]}>LEVEL {attempt.level} OF 100</Text>
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
  const colors = useMemoryGameColors();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const rankBefore = result.globalRankBefore;
  const rankAfter = result.globalRankAfter;
  const nextLevel = Math.min(100, result.level + 1);
  let rankCopy: string | null = null;
  if (rankAfter !== null && rankBefore !== null && rankAfter < rankBefore) {
    rankCopy = `You moved up ${rankBefore - rankAfter} ${rankBefore - rankAfter === 1 ? 'place' : 'places'} globally.`;
  } else if (rankAfter !== null && rankBefore === null) {
    rankCopy = `You are now ranked #${rankAfter} globally.`;
  } else if (rankAfter !== null) {
    rankCopy = `Your global rank is #${rankAfter}.`;
  }
  return (
    <View style={[styles.resultContent, compact && styles.resultContentCompact]} testID="memory-game-result">
      <View style={styles.resultProgressRow}>
        <View style={styles.resultGameLabel}>
          <View style={[styles.resultGameIcon, { backgroundColor: `${colors.secondary}14` }]}>
            <Feather name="grid" size={17} color={colors.secondary} />
          </View>
          <Text style={[styles.resultGameText, { color: colors.welcome.foreground }]}>LEVEL PROGRESS</Text>
        </View>
        <View style={styles.resultProgress}>
          <Text style={[styles.resultProgressText, { color: colors.welcome.foreground }]}>{result.level} / 100</Text>
          <View style={[styles.resultProgressTrack, { backgroundColor: colors.welcome.border }]}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.resultProgressFill, { width: `${Math.min(100, Math.max(4, result.level))}%` }]}
            />
          </View>
        </View>
      </View>

      <View style={[styles.resultSpace, compact && styles.resultSpaceCompact]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.resultPlanet, { backgroundColor: `${colors.accent}18` }]} />
        <View style={[styles.resultOrbit, { borderColor: `${colors.secondary}32` }]} />
        <Feather name="star" size={16} color={colors.primary} style={styles.resultStarOne} />
        <Feather name="star" size={12} color={colors.welcome.gold} style={styles.resultStarTwo} />
        <Feather name="star" size={13} color={colors.secondary} style={styles.resultStarThree} />
        <View style={[styles.resultAstronautHalo, { backgroundColor: `${colors.secondary}12` }]}>
          <FontAwesome5
            name={result.successful ? 'user-astronaut' : 'space-shuttle'}
            size={compact ? 53 : 67}
            color={colors.secondary}
          />
        </View>
      </View>

      <View style={[styles.resultBanner, compact && styles.resultBannerCompact]} testID="memory-game-result-banner">
        <LinearGradient
          colors={result.successful ? [colors.secondary, colors.primary] : [colors.primary, colors.secondary]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.resultBannerOrb, { backgroundColor: colors.primaryForeground, opacity: 0.09 }]} />
        <View style={[styles.resultBannerOrbSmall, { borderColor: colors.primaryForeground, opacity: 0.14 }]} />
        <Feather name="star" size={17} color={colors.primaryForeground} style={[styles.resultBannerStar, { opacity: 0.72 }]} />
        <Text style={[styles.resultBannerEyebrow, { color: colors.primaryForeground }]}>
          LEVEL {result.level} OF 100
        </Text>
        <Text style={[styles.resultBannerTitle, compact && styles.resultBannerTitleCompact, { color: colors.primaryForeground }]}>
          {result.successful ? result.runCompleted ? 'Full run complete!' : 'Level cleared!' : 'Try again'}
        </Text>
        <Text style={[styles.resultBannerBody, { color: colors.primaryForeground }]}>
          {result.successful
            ? `${result.correctSelections} astronaut tiles remembered correctly.`
            : `You found ${result.correctSelections} of ${result.correctTileIndices.length} astronauts.`}
        </Text>
      </View>

      <View style={[styles.resultRewardCard, compact && styles.resultRewardCardCompact, { backgroundColor: colors.welcome.surface, borderColor: colors.welcome.border }]}>
        <View style={[styles.resultRewardIcon, { backgroundColor: `${colors.primary}12` }]}>
          <Feather name="star" size={25} color={colors.primary} />
        </View>
        <View style={styles.rewardCopy}>
          <Text style={[styles.rewardTitle, { color: colors.welcome.foreground }]}>
            {result.successful ? `+${result.xpAwarded} game-score points` : 'Game score unchanged'}
          </Text>
          <Text style={[styles.resultRewardSub, { color: colors.welcome.subdued }]}>
            {result.successful
              ? result.officialXpAwarded > 0
                ? `+${result.officialXpAwarded} official XP · 50 XP daily limit`
                : 'Daily official XP limit reached'
              : 'Clear the level to add 5 points to your game score'}
          </Text>
        </View>
        <View style={[styles.resultScoreDivider, { backgroundColor: colors.welcome.border }]} />
        <View style={styles.resultScoreColumn}>
          <Text style={[styles.resultScoreLabel, { color: colors.welcome.subdued }]}>SCORE</Text>
          <Text style={[styles.resultScore, { color: colors.primary }]}>{result.stats.memoryXp}</Text>
        </View>
      </View>

      {rankCopy ? (
        <View style={[styles.resultRankCard, compact && styles.resultRankCardCompact, { backgroundColor: `${colors.teal}12` }]}>
          <View style={[styles.resultRankIcon, { backgroundColor: `${colors.teal}16` }]}>
            <Feather name="award" size={19} color={colors.teal} />
          </View>
          <Text style={[styles.resultRankText, { color: colors.welcome.foreground }]}>{rankCopy}</Text>
          <Feather name="trending-up" size={22} color={colors.teal} />
        </View>
      ) : null}
      {error ? <MessageCard>{error}</MessageCard> : null}

      {result.successful ? (
        <PrimaryButton
          label={busy ? 'Starting…' : result.runCompleted ? 'Start a new run' : `Continue to Level ${nextLevel}`}
          icon="play"
          iconOnLeft
          endIcon="arrow-right"
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
      <QuietButton label="Memory leaderboard" icon="award" endIcon="arrow-right" onPress={onLeaderboard} testID="memory-game-result-leaderboard" />
    </View>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  const colors = useMemoryGameColors();
  return (
    <View style={styles.helpContent} testID="memory-game-help-panel">
      <View style={[styles.helpIcon, { backgroundColor: `${colors.secondary}24`, borderColor: `${colors.secondary}65`, borderWidth: 1 }]}>
        <Feather name="help-circle" size={25} color={colors.accent} />
      </View>
      <Text style={[styles.centerEyebrow, { color: colors.accent }]}>QUICK GUIDE</Text>
      <Text style={[styles.centerTitle, { color: colors.space.foreground }]}>How to play</Text>
      <Text style={[styles.centerBody, { color: colors.space.muted }]}>
        Remember where the astronauts appear. When they disappear, select those tiles and submit your answer.
      </Text>
      <View style={[styles.helpCard, { backgroundColor: `${colors.space.surface}E8`, borderColor: colors.space.border }]}>
        <InstructionRow number="1" title="Watch" body="The pattern is visible only for a short time." />
        <View style={[styles.instructionDivider, { backgroundColor: colors.space.border }]} />
        <InstructionRow number="2" title="Select" body="Choose every astronaut tile. Empty tiles count against your answer." />
        <View style={[styles.instructionDivider, { backgroundColor: colors.space.border }]} />
        <InstructionRow number="3" title="Earn" body="Each cleared level adds 5 game-score points. Official game XP is limited to 50 per day; progress still counts after that." />
      </View>
      <View style={styles.helpAction}>
        <PrimaryButton label="Back to game" icon="arrow-left" onPress={onClose} testID="memory-game-help-close" />
      </View>
    </View>
  );
}

export function MemoryGameScreen({ onBack, onFindPeople }: Props) {
  const colors = useMemoryGameColors();
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
  const showingGameIntro = panel === null && !result && !activeAttempt;
  const showingGameInteraction = panel === 'help' || Boolean(activeAttempt && activeAttempt.phase !== 'paused' && !result);
  const isDarkGameScreen = showingGameIntro || showingGameInteraction;
  const topInset = Platform.OS === 'web'
    ? Math.max(insets.top, isDarkGameScreen ? 12 : result ? 67 : 48)
    : insets.top + 8;

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
      void Haptics.notificationAsync(
        submitted.successful
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      ).catch(() => undefined);
      void invalidateGameQueries();
    } catch (error) {
      setActionError(errorMessage(error, 'We could not check your answer. Try again.'));
      setLocalAttempt(attemptBeforeSubmit);
    }
  };

  const handleToggleTile = (index: number) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setSelectedIndices((current) => current.includes(index)
      ? current.filter((selected) => selected !== index)
      : [...current, index]);
  };

  if (panel === 'leaderboard') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.welcome.background, paddingTop: topInset, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <StatusBar barStyle="dark-content" />
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
          backgroundColor: isDarkGameScreen ? colors.space.background : colors.welcome.background,
          paddingTop: topInset,
          paddingBottom: Math.max(insets.bottom, isDarkGameScreen ? 28 : 10),
        },
      ]}
      testID="memory-game-screen"
    >
      {isDarkGameScreen ? (
        <LinearGradient
          colors={[colors.space.background, `${colors.secondary}12`, colors.space.background]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <StatusBar barStyle={isDarkGameScreen ? 'light-content' : 'dark-content'} />
      {panel === 'help' ? (
        <>
          <ScreenHeader title="How to play" dark controlsOnly onBack={() => setPanel(null)} onLeaderboard={() => setPanel('leaderboard')} />
          <HelpPanel onClose={() => setPanel(null)} />
        </>
      ) : result ? (
        <>
          <ScreenHeader title="Memory Game" eyebrow="LEVEL COMPLETE" onBack={handleExit} onLeaderboard={() => setPanel('leaderboard')} />
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
          <ScreenHeader title={`Level ${activeAttempt.level}`} dark onBack={handleExit} onLeaderboard={() => setPanel('leaderboard')} />
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
          <ScreenHeader title="Memory Game" dark controlsOnly onBack={onBack} onLeaderboard={() => setPanel('leaderboard')} />
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
  headerControlsOnly: { minHeight: 48 },
  headerButton: { width: 40, height: 40, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.6 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 2 },
  introContent: { flex: 1, minHeight: 0 },
  introContentInner: { flex: 1, minHeight: 0, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 7, justifyContent: 'space-between' },
  hero: { minHeight: 260, justifyContent: 'flex-start', paddingTop: 2 },
  heroCompact: { minHeight: 202 },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17, gap: 8 },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroBrandText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2.4 },
  heroPill: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroPillText: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1 },
  heroTitle: { maxWidth: 286, fontFamily: 'Inter_700Bold', fontSize: 42, lineHeight: 46, letterSpacing: -1.2 },
  heroTitleCompact: { maxWidth: 250, fontSize: 35, lineHeight: 38 },
  heroBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, maxWidth: 246, marginTop: 8 },
  heroPerks: { gap: 7, marginTop: 14 },
  heroReward: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroRewardText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  introSection: { gap: 8 },
  progressCard: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 12, gap: 9 },
  levelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  progressCopy: { flex: 1 },
  sectionEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.4 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 3 },
  levelBadge: { borderWidth: 1, borderRadius: 13, minWidth: 73, height: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  levelBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  introProgressTrack: { width: '100%', height: 13, borderRadius: 7, overflow: 'hidden' },
  introProgressFill: { height: '100%', borderRadius: 7 },
  progressBody: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  instructionCard: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, gap: 0 },
  instructionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  instructionNumber: { width: 32, height: 32, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  instructionNumberText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  instructionCopy: { flex: 1 },
  instructionTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  instructionBody: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  instructionDivider: { height: 1, marginLeft: 43 },
  statsStrip: { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, minWidth: 0, minHeight: 75, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 4 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 },
  separateXpNote: { minHeight: 42, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 8 },
  separateXpText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 46, borderRadius: 15, overflow: 'hidden' },
  primaryButtonFill: { flex: 1, minHeight: 46, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  primaryButtonProminent: { minHeight: 55, borderRadius: 28 },
  primaryButtonFillProminent: { minHeight: 55, paddingHorizontal: 20 },
  primaryButtonTextProminent: { fontSize: 16 },
  quietButton: { minHeight: 38, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quietButtonDark: { minHeight: 43, borderRadius: 22 },
  quietButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  gameContent: { flex: 1, minHeight: 0, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 7, alignItems: 'center', justifyContent: 'space-evenly', gap: 9 },
  gameLevelRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  gameLevelCopy: { flex: 1 },
  pauseButton: { minHeight: 39, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pauseText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  phaseCard: { width: '100%', minHeight: 72, borderWidth: 1, borderRadius: 19, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  phaseCopy: { flex: 1, minWidth: 150 },
  phaseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  phaseDot: { width: 7, height: 7, borderRadius: 4 },
  phaseTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  phaseSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4, lineHeight: 14 },
  phaseCountdown: { fontFamily: 'Inter_700Bold', fontSize: 25, minWidth: 22, textAlign: 'right' },
  countdownPips: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countdownPip: { width: 5, height: 12, borderRadius: 3 },
  phaseCount: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  grid: { alignItems: 'center', alignSelf: 'center' },
  gridRow: { flexDirection: 'row', justifyContent: 'center' },
  tile: { borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tileDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.72 },
  gridFooter: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  gridFooterText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  waitButton: { width: '100%', minHeight: 52, borderWidth: 1, borderRadius: 19, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  waitText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  expiredCard: { minHeight: 185, width: '100%', borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 9 },
  expiredTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 3 },
  expiredBody: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 260 },
  messageCard: { minHeight: 43, width: '100%', borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  centerPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, paddingBottom: 30, gap: 13 },
  centerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.6, marginTop: 9, textAlign: 'center' },
  centerTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, textAlign: 'center', marginTop: 2 },
  centerBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  pauseArtwork: { width: 75, height: 75, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  resultContent: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 22, paddingTop: 4, paddingBottom: 4, gap: 7 },
  resultContentCompact: { gap: 5 },
  resultProgressRow: { width: '100%', minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultGameLabel: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  resultGameIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  resultGameText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 },
  resultProgress: { width: 126, gap: 4 },
  resultProgressText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.5 },
  resultProgressTrack: { width: '100%', height: 7, borderRadius: 5, overflow: 'hidden' },
  resultProgressFill: { height: '100%', borderRadius: 5 },
  resultSpace: { width: '100%', height: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  resultSpaceCompact: { height: 72 },
  resultPlanet: { position: 'absolute', width: 145, height: 145, borderRadius: 73, top: 16, backgroundColor: 'transparent' },
  resultOrbit: { position: 'absolute', width: 215, height: 64, borderWidth: 2, borderRadius: 50, transform: [{ rotate: '-12deg' }] },
  resultAstronautHalo: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  resultStarOne: { position: 'absolute', left: '12%', top: 28 },
  resultStarTwo: { position: 'absolute', right: '16%', top: 17 },
  resultStarThree: { position: 'absolute', right: '10%', bottom: 21 },
  resultBanner: { width: '100%', minHeight: 172, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 7 },
  resultBannerCompact: { minHeight: 132, paddingVertical: 11, gap: 5 },
  resultBannerOrb: { position: 'absolute', width: 106, height: 106, borderRadius: 53, left: -38, top: -38 },
  resultBannerOrbSmall: { position: 'absolute', width: 74, height: 74, borderRadius: 37, right: -27, bottom: -27, borderWidth: 12 },
  resultBannerStar: { position: 'absolute', right: 48, top: 25 },
  resultBannerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 3 },
  resultBannerTitle: { fontFamily: 'Inter_700Bold', fontSize: 34, lineHeight: 40, letterSpacing: -0.7, textAlign: 'center' },
  resultBannerTitleCompact: { fontSize: 29, lineHeight: 34 },
  resultBannerBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
  resultRewardCard: { width: '100%', minHeight: 78, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  resultRewardCardCompact: { minHeight: 66, paddingVertical: 7, gap: 8 },
  resultRewardIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rewardCopy: { flex: 1 },
  rewardTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  resultRewardSub: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 4 },
  resultScoreDivider: { width: 1, height: 46 },
  resultScoreColumn: { minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  resultScoreLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 2 },
  resultScore: { fontFamily: 'Inter_700Bold', fontSize: 29, lineHeight: 33 },
  resultRankCard: { width: '100%', minHeight: 58, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultRankCardCompact: { minHeight: 48, paddingVertical: 6 },
  resultRankIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  resultRankText: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 12 },
  helpContent: { flex: 1, minHeight: 0, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12, alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  helpIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  helpCard: { width: '100%', borderWidth: 1, borderRadius: 21, paddingHorizontal: 13, marginTop: 7, marginBottom: 0 },
  helpAction: { width: '100%', marginTop: 'auto' },
});

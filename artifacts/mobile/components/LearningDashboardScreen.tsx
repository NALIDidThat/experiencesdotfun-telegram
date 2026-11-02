import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetLearningDeckQueryKey,
  getListLearningDecksQueryKey,
  getListLearningResearchQueryKey,
  useCreateLearningDeck,
  useCreateLearningResearch,
  useDeleteLearningDeck,
  useDeleteLearningResearch,
  useGetLearningDeck,
  useListLearningDecks,
  useListLearningResearch,
  type LearningFlashcardDeck,
  type LearningResearch,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ExperienceCategoryArtwork } from '@/components/ExperienceCategoryArtwork';

type ScreenProps = {
  itemId?: string;
  onBack: () => void;
};

type LibraryProps = {
  onOpenLearning: () => void;
  onStudyDeck: (deckId: number) => void;
  onCreateDeckFromResearch: (researchId: number) => void;
};

const itemRoute = (itemId?: string) => {
  const match = /^(deck|research)-(\d+)$/.exec(itemId ?? '');
  if (!match) return { deckId: null, researchId: null };
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return { deckId: null, researchId: null };
  return match[1] === 'deck'
    ? { deckId: id, researchId: null }
    : { deckId: null, researchId: id };
};

function openSource(url: string) {
  if (!/^https:\/\//i.test(url)) return;
  void Linking.openURL(url).catch(() => {
    Alert.alert('Source unavailable', 'This link could not be opened.');
  });
}

export function LearningDashboardScreen({ itemId, onBack }: ScreenProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const routeItem = useMemo(() => itemRoute(itemId), [itemId]);
  const [activeDeckId, setActiveDeckId] = useState<number | null>(routeItem.deckId);
  const [selectedResearchId, setSelectedResearchId] = useState<number | null>(routeItem.researchId);
  const [prompt, setPrompt] = useState('');
  const [latestResearch, setLatestResearch] = useState<LearningResearch | null>(null);
  const researchQuery = useListLearningResearch();
  const deckQuery = useListLearningDecks();
  const createResearch = useCreateLearningResearch();
  const createDeck = useCreateLearningDeck();

  useEffect(() => {
    setActiveDeckId(routeItem.deckId);
    setSelectedResearchId(routeItem.researchId);
  }, [routeItem.deckId, routeItem.researchId]);

  const invalidateLibrary = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListLearningResearchQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListLearningDecksQueryKey() }),
    ]);
  };

  const researchTopic = () => {
    const cleanPrompt = prompt.trim();
    if (cleanPrompt.length < 3) return;
    createResearch.mutate(
      { data: { prompt: cleanPrompt } },
      {
        onSuccess: async (research) => {
          setLatestResearch(research);
          setPrompt('');
          await invalidateLibrary();
        },
      },
    );
  };

  const makeFlashcards = () => {
    const cleanPrompt = prompt.trim();
    if (selectedResearchId === null && cleanPrompt.length < 3) return;
    createDeck.mutate(
      {
        data: selectedResearchId === null
          ? { prompt: cleanPrompt }
          : { researchId: selectedResearchId },
      },
      {
        onSuccess: async ({ deck, research }) => {
          setLatestResearch(research);
          setSelectedResearchId(null);
          setPrompt('');
          await invalidateLibrary();
          await queryClient.invalidateQueries({ queryKey: getGetLearningDeckQueryKey(deck.id) });
          setActiveDeckId(deck.id);
        },
      },
    );
  };

  if (activeDeckId !== null) {
    return (
      <FlashcardStudyView
        deckId={activeDeckId}
        onBack={() => {
          if (routeItem.deckId !== null) onBack();
          else setActiveDeckId(null);
        }}
      />
    );
  }

  const selectedResearch = researchQuery.data?.find((item) => item.id === selectedResearchId);
  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={84}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={styles.iconButton}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: colors.primary }]}>RESEARCH & LEARN</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Make curiosity stick</Text>
        </View>
        <ExperienceCategoryArtwork category="education" size={54} />
      </View>

      <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What would you like to learn?</Text>
        <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>
          Ask for source-backed research, or turn a topic into a short flashcard deck.
        </Text>
        {selectedResearchId !== null ? (
          <View style={[styles.selectedResearch, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="bookmark" size={15} color={colors.primary} />
            <Text numberOfLines={2} style={[styles.selectedResearchText, { color: colors.foreground }]}>
              {selectedResearch?.title ?? 'Your saved research'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear selected research"
              onPress={() => setSelectedResearchId(null)}
              style={styles.inlineIcon}
            >
              <Feather name="x" size={17} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder={selectedResearchId === null ? 'For example: how urban gardens improve wellbeing' : 'Optional: add a focus for these cards'}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          editable={!createResearch.isPending && !createDeck.isPending}
          accessibilityLabel="Research or flashcard topic"
          style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
        />
        {createResearch.isError || createDeck.isError ? (
          <View accessibilityRole="alert" style={[styles.errorNotice, { backgroundColor: colors.destructive + '10' }]}>
            <Feather name="alert-circle" size={15} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              This request could not be completed. Please try again.
            </Text>
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            testID="research-and-save"
            disabled={prompt.trim().length < 3 || createResearch.isPending || createDeck.isPending}
            onPress={researchTopic}
            style={[
              styles.secondaryButton,
              { borderColor: colors.border, opacity: prompt.trim().length < 3 || createResearch.isPending ? 0.55 : 1 },
            ]}
          >
            {createResearch.isPending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="search" size={16} color={colors.primary} />}
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Research & save</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="create-flashcards"
            disabled={(selectedResearchId === null && prompt.trim().length < 3) || createDeck.isPending || createResearch.isPending}
            onPress={makeFlashcards}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: (selectedResearchId === null && prompt.trim().length < 3) || createDeck.isPending ? 0.55 : 1 },
            ]}
          >
            {createDeck.isPending
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Feather name="layers" size={16} color={colors.primaryForeground} />}
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Create flashcards</Text>
          </Pressable>
        </View>
        <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>
          Research and decks are saved privately to Activity → Learning.
        </Text>
      </View>

      {latestResearch ? (
        <ResearchResultCard research={latestResearch} onMakeCards={() => {
          setSelectedResearchId(latestResearch.id);
          setPrompt('');
        }} />
      ) : null}

      <LearningLibraryPanel
        onOpenLearning={() => {
          setSelectedResearchId(null);
          setActiveDeckId(null);
        }}
        onStudyDeck={setActiveDeckId}
        onCreateDeckFromResearch={setSelectedResearchId}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

export function LearningLibraryPanel({
  onOpenLearning,
  onStudyDeck,
  onCreateDeckFromResearch,
}: LibraryProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const researchQuery = useListLearningResearch();
  const deckQuery = useListLearningDecks();
  const deleteResearch = useDeleteLearningResearch();
  const deleteDeck = useDeleteLearningDeck();
  const researches = researchQuery.data ?? [];
  const decks = deckQuery.data ?? [];
  const isLoading = researchQuery.isLoading || deckQuery.isLoading;
  const isError = researchQuery.isError || deckQuery.isError;

  const confirmDeleteResearch = (research: LearningResearch) => {
    Alert.alert('Delete saved research?', 'This removes it from your Learning activity. Flashcard decks will remain saved.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteResearch.mutate(
          { researchId: research.id },
          {
            onSuccess: async () => {
              await queryClient.invalidateQueries({ queryKey: getListLearningResearchQueryKey() });
            },
          },
        ),
      },
    ]);
  };

  const confirmDeleteDeck = (deck: LearningFlashcardDeck) => {
    Alert.alert('Delete this flashcard deck?', 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteDeck.mutate(
          { deckId: deck.id },
          {
            onSuccess: async () => {
              await queryClient.invalidateQueries({ queryKey: getListLearningDecksQueryKey() });
            },
          },
        ),
      },
    ]);
  };

  return (
    <View style={styles.library}>
      <View style={styles.libraryHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your learning library</Text>
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>
            Saved research and decks, kept private to your profile.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Research a new topic"
          onPress={onOpenLearning}
          style={styles.iconButton}
        >
          <Feather name="plus" size={19} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>Loading your saved learning</Text>
        </View>
      ) : isError ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>Your learning library couldn’t be loaded.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void researchQuery.refetch();
              void deckQuery.refetch();
            }}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : researches.length === 0 && decks.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name="book-open" size={21} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Your saved learning starts here</Text>
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>
            Research a question or create your first flashcard deck.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenLearning}
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 14 }]}
          >
            <Feather name="search" size={15} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Start learning</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {decks.map((deck) => (
            <View key={`deck-${deck.id}`} style={[styles.libraryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Study ${deck.title}, ${deck.cards.length} cards`}
                onPress={() => onStudyDeck(deck.id)}
                style={styles.libraryCardMain}
              >
                <View style={[styles.libraryIcon, { backgroundColor: colors.primary + '14' }]}>
                  <Feather name="layers" size={17} color={colors.primary} />
                </View>
                <View style={styles.libraryCopy}>
                  <Text style={[styles.cardEyebrow, { color: colors.primary }]}>FLASHCARD DECK · {deck.cards.length} CARDS</Text>
                  <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.foreground }]}>{deck.title}</Text>
                  <Text numberOfLines={2} style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{deck.description}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${deck.title}`}
                onPress={() => confirmDeleteDeck(deck)}
                style={[styles.deleteAction, { borderTopColor: colors.border }]}
              >
                <Feather name="trash-2" size={13} color={colors.mutedForeground} />
                <Text style={[styles.deleteText, { color: colors.mutedForeground }]}>Delete deck</Text>
              </Pressable>
            </View>
          ))}
          {researches.map((research) => (
            <ResearchResultCard
              key={`research-${research.id}`}
              research={research}
              onMakeCards={() => onCreateDeckFromResearch(research.id)}
              onDelete={() => confirmDeleteResearch(research)}
            />
          ))}
        </>
      )}
    </View>
  );
}

function ResearchResultCard({
  research,
  onMakeCards,
  onDelete,
}: {
  research: LearningResearch;
  onMakeCards: () => void;
  onDelete?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.researchCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 4 }]}>
      <View style={styles.researchTopline}>
        <Feather name="search" size={15} color={colors.primary} />
        <Text style={[styles.cardEyebrow, { color: colors.primary }]}>SAVED RESEARCH</Text>
        <View style={{ flex: 1 }} />
        {onDelete ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete research: ${research.title}`} onPress={onDelete} style={styles.inlineIcon}>
            <Feather name="trash-2" size={15} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{research.title}</Text>
      <Text numberOfLines={5} style={[styles.researchContent, { color: colors.mutedForeground }]}>{research.content}</Text>
      {research.sources.length ? (
        <View style={styles.sourcesRow}>
          {research.sources.slice(0, 4).map((source, index) => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${source.title}`}
              onPress={() => openSource(source.url)}
              style={[styles.sourceChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Feather name="external-link" size={11} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.sourceText, { color: colors.primary }]}>
                {source.title || `Source ${index + 1}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>No external sources were returned for this item.</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onMakeCards}
        style={[styles.makeCardsAction, { borderTopColor: colors.border }]}
      >
        <Feather name="layers" size={14} color={colors.primary} />
        <Text style={[styles.linkText, { color: colors.primary }]}>Make flashcards from this</Text>
        <Feather name="arrow-right" size={14} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function FlashcardStudyView({ deckId, onBack }: { deckId: number; onBack: () => void }) {
  const colors = useColors();
  const deckQuery = useGetLearningDeck(deckId, {
    query: {
      enabled: Number.isSafeInteger(deckId) && deckId > 0,
      queryKey: getGetLearningDeckQueryKey(deckId),
    },
  });
  const deck = deckQuery.data;
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const card = deck?.cards[cardIndex];
  const progress = deck?.cards.length ? ((cardIndex + 1) / deck.cards.length) * 100 : 0;

  useEffect(() => {
    setCardIndex(0);
    setShowAnswer(false);
    setKnownCount(0);
    setFinished(false);
  }, [deck?.id]);

  const markCard = (known: boolean) => {
    if (!deck) return;
    if (known) setKnownCount((count) => count + 1);
    setShowAnswer(false);
    if (cardIndex + 1 >= deck.cards.length) setFinished(true);
    else setCardIndex((index) => index + 1);
  };

  if (deckQuery.isLoading) {
    return (
      <View style={[styles.studyScreen, { backgroundColor: colors.background }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.studyBack}>
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (deckQuery.isError || !deck || !card) {
    return (
      <View style={[styles.studyScreen, { backgroundColor: colors.background }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.studyBack}>
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>This deck couldn’t be opened</Text>
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>Return to your Learning activity and try again.</Text>
        </View>
      </View>
    );
  }

  if (finished) {
    return (
      <View style={[styles.studyScreen, { backgroundColor: colors.background }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.studyBack}>
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={[styles.completionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 8 }]}>
          <View style={[styles.completionIcon, { backgroundColor: colors.primary + '15' }]}>
            <Feather name="check" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.kicker, { color: colors.primary }]}>DECK COMPLETE</Text>
          <Text style={[styles.studyTitle, { color: colors.foreground }]}>{deck.title}</Text>
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>
            You marked {knownCount} of {deck.cards.length} cards as known. Revisit any time to strengthen recall.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCardIndex(0);
              setShowAnswer(false);
              setKnownCount(0);
              setFinished(false);
            }}
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 18 }]}
          >
            <Feather name="rotate-ccw" size={15} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Study again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.studyScreen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.studyContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.studyHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.iconButton}>
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: colors.primary }]}>FLASHCARD DECK</Text>
          <Text numberOfLines={2} style={[styles.studyTitle, { color: colors.foreground }]}>{deck.title}</Text>
        </View>
      </View>
      <View style={styles.progressMeta}>
        <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>Card {cardIndex + 1} of {deck.cards.length}</Text>
        <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{knownCount} known</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress}%` }]} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showAnswer ? 'Hide answer' : 'Reveal answer'}
        testID="learning-flashcard"
        onPress={() => setShowAnswer((value) => !value)}
        style={[
          styles.flashcard,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 10 },
        ]}
      >
        <Text style={[styles.cardEyebrow, { color: colors.primary }]}>{showAnswer ? 'ANSWER' : 'QUESTION'}</Text>
        <Text style={[styles.flashcardText, { color: colors.foreground }]}>
          {showAnswer ? card.answer : card.question}
        </Text>
        <View style={[styles.flipHint, { borderTopColor: colors.border }]}>
          <Feather name="rotate-cw" size={14} color={colors.mutedForeground} />
          <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>Tap to {showAnswer ? 'see question' : 'reveal answer'}</Text>
        </View>
      </Pressable>
      {showAnswer ? (
        <View style={styles.studyActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => markCard(false)}
            style={[styles.secondaryButton, { borderColor: colors.border, flex: 1 }]}
          >
            <Feather name="rotate-ccw" size={15} color={colors.foreground} />
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Review again</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => markCard(true)}
            style={[styles.primaryButton, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Feather name="check" size={15} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Got it</Text>
          </Pressable>
        </View>
      ) : null}
      {card.sourceUrls.length ? (
        <View style={styles.cardSources}>
          <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>SOURCES</Text>
          {card.sourceUrls.map((url, index) => (
            <Pressable key={url} accessibilityRole="link" onPress={() => openSource(url)} style={styles.cardSourceLink}>
              <Feather name="external-link" size={13} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.linkText, { color: colors.primary }]}>Source {index + 1}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  content: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 70 : 14,
    paddingBottom: Platform.OS === 'web' ? 110 : 120,
    gap: 18,
  },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  iconButton: { minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  title: { fontSize: 25, lineHeight: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.55, marginTop: 3 },
  createCard: { borderWidth: 1, padding: 17 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  bodyCopy: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 4 },
  selectedResearch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 9, marginTop: 13 },
  selectedResearchText: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  inlineIcon: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  promptInput: { minHeight: 96, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13, lineHeight: 19, textAlignVertical: 'top', marginTop: 15 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  primaryButtonText: { fontSize: 11, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  secondaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderRadius: 14 },
  secondaryButtonText: { fontSize: 11, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  privacyNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 10 },
  errorNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, padding: 9, marginTop: 12 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  library: { gap: 10 },
  libraryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  loadingRow: { minHeight: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 18, padding: 18 },
  emptyIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  linkText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_700Bold' },
  libraryCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 2 },
  libraryCardMain: { minHeight: 93, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  libraryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  libraryCopy: { flex: 1, minWidth: 0 },
  cardEyebrow: { fontSize: 8, lineHeight: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  cardTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold', marginTop: 4 },
  deleteAction: { minHeight: 35, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 61 },
  deleteText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  researchCard: { borderWidth: 1, padding: 13, marginBottom: 2 },
  researchTopline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  researchContent: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 8 },
  sourcesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sourceChip: { maxWidth: '100%', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8 },
  sourceText: { maxWidth: 190, fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  makeCardsAction: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 7 },
  studyScreen: { flex: 1, minHeight: 0 },
  studyContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 70 : 16, paddingBottom: Platform.OS === 'web' ? 110 : 120 },
  studyBack: { minWidth: 45, minHeight: 45, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  studyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  studyTitle: { fontSize: 20, lineHeight: 25, fontFamily: 'Inter_700Bold', letterSpacing: -0.35, marginTop: 3 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 18 },
  progressFill: { height: '100%', borderRadius: 3 },
  flashcard: { minHeight: 350, borderWidth: 1, padding: 23, justifyContent: 'center', alignItems: 'center' },
  flashcardText: { fontSize: 24, lineHeight: 33, textAlign: 'center', letterSpacing: -0.45, fontFamily: 'Inter_700Bold', marginTop: 18, maxWidth: 420 },
  flipHint: { position: 'absolute', bottom: 0, left: 18, right: 18, minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth },
  studyActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  cardSources: { gap: 8, marginTop: 18 },
  cardSourceLink: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 7 },
  completionCard: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', borderWidth: 1, margin: 20, padding: 24 },
  completionIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
});

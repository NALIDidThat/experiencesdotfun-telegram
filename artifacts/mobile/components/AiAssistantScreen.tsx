import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetAiAssistantConversationQueryKey,
  getGetExperienceQueryKey,
  getListExperiencesQueryKey,
  getListAiAssistantConversationsQueryKey,
  getListExperienceChallengesQueryKey,
  getListMyParticipationsQueryKey,
  useCreateAiAssistantConversation,
  useCreateExperienceChallenge,
  useDeleteAiAssistantConversation,
  useGetAiAssistantConversation,
  useJoinExperience,
  useListAiAssistantConversations,
  type AiAssistantAction,
  type AiAssistantMessage,
  type Participation,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { streamAiAssistantMessage } from '@/lib/ai-assistant-stream';

type Props = { onOpenExperience: (experienceId: number) => void };
type LocalMessage = Partial<AiAssistantMessage> & {
  localId: string;
  role: 'user' | 'assistant';
  content: string;
  actions: AiAssistantAction[];
};

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function AiAssistantScreen({ onOpenExperience }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState('');
  const [streamError, setStreamError] = useState('');
  const [actionToConfirm, setActionToConfirm] = useState<AiAssistantAction | null>(null);
  const [joinedParticipations, setJoinedParticipations] = useState<Record<number, Participation>>({});
  const [joinPendingId, setJoinPendingId] = useState<number | null>(null);
  const [joinError, setJoinError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const joinPendingRef = useRef<number | null>(null);
  const listQuery = useListAiAssistantConversations();
  const conversations = listQuery.data ?? [];
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const detailQuery = useGetAiAssistantConversation(selectedId ?? 0, {
    query: {
      enabled: selectedId !== null,
      queryKey: getGetAiAssistantConversationQueryKey(selectedId ?? 0),
    },
  });
  const createConversation = useCreateAiAssistantConversation();
  const createChallenge = useCreateExperienceChallenge();
  const joinExperience = useJoinExperience();
  const deleteConversation = useDeleteAiAssistantConversation();
  const savedMessages = detailQuery.data?.messages ?? [];

  useEffect(() => {
    if (selectedId === null && conversations.length) {
      setSelectedId(conversations[0].id);
    } else if (selectedId !== null && !conversations.some((item) => item.id === selectedId)) {
      setSelectedId(conversations[0]?.id ?? null);
    }
  }, [conversations, selectedId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const invalidateConversation = async (id?: number) => {
    await queryClient.invalidateQueries({ queryKey: getListAiAssistantConversationsQueryKey() });
    if (id !== undefined) {
      await queryClient.invalidateQueries({ queryKey: getGetAiAssistantConversationQueryKey(id) });
    }
  };

  const createNewConversation = () => {
    createConversation.mutate(undefined, {
      onSuccess: async (conversation) => {
        await invalidateConversation(conversation.id);
        setLocalMessages([]);
        setSelectedId(conversation.id);
      },
      onError: () => setStreamError('Could not start a conversation. Please try again.'),
    });
  };

  const removeConversation = () => {
    if (selectedId === null) return;
    Alert.alert('Delete conversation?', 'This conversation and its saved history will be removed.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteConversation.mutate(
          { conversationId: selectedId },
          {
            onSuccess: async () => {
              const deletedId = selectedId;
              setSelectedId(null);
              setLocalMessages([]);
              await invalidateConversation(deletedId);
            },
            onError: () => setStreamError('Could not delete this conversation. Please try again.'),
          },
        ),
      },
    ]);
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || selectedId === null || streaming) return;
    const conversationId = selectedId;
    const userLocalId = `user-${Date.now()}`;
    const assistantLocalId = `assistant-${Date.now()}`;
    setDraft('');
    setStreamError('');
    setStreamStatus('Finding relevant local experiences');
    setStreaming(true);
    setLocalMessages((items) => [
      ...items,
      { localId: userLocalId, role: 'user', content, actions: [] },
      { localId: assistantLocalId, role: 'assistant', content: '', actions: [] },
    ]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamAiAssistantMessage(conversationId, { content }, {
        signal: controller.signal,
        onStatus: setStreamStatus,
        onContent: (chunk) => {
          setLocalMessages((items) => items.map((message) =>
            message.localId === assistantLocalId
              ? { ...message, content: message.content + chunk }
              : message,
          ));
        },
      });
      await invalidateConversation(conversationId);
      setLocalMessages((items) => items.filter((message) => message.localId !== userLocalId && message.localId !== assistantLocalId));
    } catch (error) {
      if (!controller.signal.aborted) {
        setStreamError(error instanceof Error ? error.message : 'The response could not be completed.');
        setLocalMessages((items) => items.filter((message) => message.localId !== assistantLocalId));
      }
    } finally {
      setStreaming(false);
      setStreamStatus('');
      abortRef.current = null;
    }
  };

  const confirmChallenge = () => {
    if (!actionToConfirm) return;
    const action = actionToConfirm;
    if (action.type !== 'challenge_friend' || action.friendId === null) return;
    setActionToConfirm(null);
    createChallenge.mutate(
      { data: { experienceId: action.experienceId, friendId: action.friendId } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getListExperienceChallengesQueryKey() });
          setStreamError('');
          Alert.alert('Invitation sent', `Your invitation for ${action.experienceTitle} is ready.`);
        },
        onError: () => setStreamError('The invitation could not be sent. Please try again.'),
      },
    );
  };

  const confirmJoin = () => {
    if (!actionToConfirm || actionToConfirm.type !== 'join_experience') return;
    const action = actionToConfirm;
    if (joinPendingRef.current !== null || joinedParticipations[action.experienceId]) return;
    joinPendingRef.current = action.experienceId;
    setJoinPendingId(action.experienceId);
    setJoinError('');
    joinExperience.mutate(
      { experienceId: action.experienceId },
      {
        onSuccess: async (participation) => {
          setJoinedParticipations((current) => ({
            ...current,
            [action.experienceId]: participation,
          }));
          setActionToConfirm(null);
          joinPendingRef.current = null;
          setJoinPendingId(null);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetExperienceQueryKey(action.experienceId) }),
            queryClient.invalidateQueries({ queryKey: getListExperiencesQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getListMyParticipationsQueryKey() }),
          ]);
        },
        onError: () => {
          joinPendingRef.current = null;
          setJoinPendingId(null);
          setJoinError('Could not join this experience. Please try again.');
        },
      },
    );
  };

  const renderAction = (action: AiAssistantAction) => (
    <View key={action.id} style={[styles.actionCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.actionTop}>
        <Feather
          name={action.type === 'view_experience' ? 'map-pin' : action.type === 'join_experience' ? 'log-in' : 'users'}
          size={15}
          color={colors.primary}
        />
        <Text style={[styles.actionEyebrow, { color: colors.mutedForeground }]}>
          {action.type === 'view_experience' ? 'LOCAL EXPERIENCE' : action.type === 'join_experience' ? 'PARTICIPATION' : 'INVITATION SUGGESTION'}
        </Text>
      </View>
      <Text style={[styles.actionTitle, { color: colors.foreground }]}>{action.experienceTitle}</Text>
      <Text style={[styles.actionMeta, { color: colors.mutedForeground }]}>
        {dateLabel(action.experienceDate)} · {action.experienceCity}
        {action.friendName ? ` · with ${action.friendName}` : ''}
      </Text>
      {action.type === 'join_experience' && joinedParticipations[action.experienceId] ? (
        <View style={[styles.actionSuccess, { borderTopColor: colors.border }]}>
          <Feather name="check-circle" size={15} color={colors.success} />
          <Text style={[styles.actionSuccessText, { color: colors.success }]}>
            {joinedParticipations[action.experienceId].status === 'waitlisted' ? 'You’re on the waitlist' : 'You’ve joined this experience'}
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={action.type === 'join_experience' && joinPendingId !== null}
          onPress={() => {
            if (action.type === 'view_experience') {
              onOpenExperience(action.experienceId);
            } else {
              setJoinError('');
              setActionToConfirm(action);
            }
          }}
          style={[styles.actionButton, { borderColor: colors.border, opacity: action.type === 'join_experience' && joinPendingId !== null ? 0.55 : 1 }]}
        >
          <Text style={[styles.actionButtonText, { color: colors.primary }]}>
            {action.type === 'view_experience'
              ? 'View experience'
              : action.type === 'join_experience'
                ? joinPendingId === action.experienceId ? 'Joining…' : 'Review before joining'
                : `Review invitation${action.friendName ? ` for ${action.friendName}` : ''}`}
          </Text>
          <Feather name={action.type === 'join_experience' ? 'arrow-right' : 'arrow-up-right'} size={15} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );

  const renderMessage = (message: LocalMessage | AiAssistantMessage, index: number) => {
    const isUser = message.role === 'user';
    return (
      <View key={'localId' in message ? message.localId : `saved-${message.id ?? index}`} style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={[styles.assistantMark, { backgroundColor: colors.primary }]}>
            <Feather name="compass" size={14} color={colors.primaryForeground} />
          </View>
        )}
        <View style={[
          styles.messageBody,
          isUser ? [styles.userBubble, { backgroundColor: colors.primary }] : [styles.assistantBubble, { backgroundColor: colors.muted }],
        ]}>
          {!!message.content && <Text style={[styles.messageText, { color: isUser ? colors.primaryForeground : colors.foreground }]}>{message.content}</Text>}
          {!isUser && message.actions?.map(renderAction)}
          {!isUser && !message.content && streaming && (
            <View style={styles.typingLine}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{streamStatus || 'Preparing a thoughtful answer'}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR LOCAL GUIDE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Find your next way in</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new conversation"
          testID="new-ai-conversation"
          onPress={createNewConversation}
          disabled={createConversation.isPending}
          style={[styles.iconButton, { borderColor: colors.border }]}
        >
          {createConversation.isPending
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Feather name="plus" size={19} color={colors.primary} />}
        </Pressable>
      </View>

      {listQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading your conversations</Text>
        </View>
      ) : listQuery.isError ? (
        <View style={styles.centerState}>
          <Feather name="wifi-off" size={22} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Conversations unavailable</Text>
          <Pressable onPress={() => listQuery.refetch()} style={styles.textAction}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {conversations.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.conversationStrip} contentContainerStyle={styles.conversationStripContent}>
              {conversations.map((conversation) => (
                <Pressable
                  key={conversation.id}
                  onPress={() => { setSelectedId(conversation.id); setLocalMessages([]); setStreamError(''); }}
                  style={[
                    styles.conversationChip,
                    { borderColor: conversation.id === selectedId ? colors.primary : colors.border, backgroundColor: conversation.id === selectedId ? colors.muted : colors.card },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.conversationTitle, { color: colors.foreground }]}>{conversation.title || 'Local discovery'}</Text>
                  <Text style={[styles.conversationDate, { color: colors.mutedForeground }]}>{dateLabel(conversation.updatedAt)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {selectedId !== null && (
            <View style={[styles.subHeader, { borderBottomColor: colors.border }]}>
              <Text numberOfLines={1} style={[styles.activeTitle, { color: colors.foreground }]}>{activeConversation?.title || 'New conversation'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Delete conversation" onPress={removeConversation} style={styles.deleteButton}>
                <Feather name="trash-2" size={17} color={colors.mutedForeground} />
              </Pressable>
            </View>
          )}

          <ScrollView
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {selectedId === null ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyMark, { backgroundColor: colors.muted }]}>
                  <Feather name="map" size={23} color={colors.primary} />
                </View>
                <Text style={[styles.stateTitle, { color: colors.foreground }]}>A good place to begin</Text>
                <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                  Start a conversation to find real local experiences and plan who you might go with.
                </Text>
                <Pressable onPress={createNewConversation} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Start exploring</Text>
                </Pressable>
              </View>
            ) : detailQuery.isLoading ? (
              <View style={styles.centerState}>
                <View style={[styles.skeletonLine, { backgroundColor: colors.muted }]} />
                <View style={[styles.skeletonLine, { width: '68%', backgroundColor: colors.muted }]} />
                <View style={[styles.skeletonLine, { width: '82%', alignSelf: 'flex-end', backgroundColor: colors.muted }]} />
              </View>
            ) : detailQuery.isError ? (
              <View style={styles.centerState}>
                <Text style={[styles.stateTitle, { color: colors.foreground }]}>This conversation did not load</Text>
                <Pressable onPress={() => detailQuery.refetch()} style={styles.textAction}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>Reload conversation</Text>
                </Pressable>
              </View>
            ) : savedMessages.length === 0 && localMessages.length === 0 ? (
              <View style={styles.welcomeNote}>
                <View style={[styles.emptyMarkSmall, { backgroundColor: colors.muted }]}>
                  <Feather name="navigation" size={17} color={colors.primary} />
                </View>
                <View style={styles.welcomeNoteCopy}>
                  <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>Start with what matters nearby.</Text>
                  <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                    Ask about community projects, learning, or a day you would like to make useful.
                  </Text>
                </View>
              </View>
            ) : (
              [...savedMessages, ...localMessages].map((message, index) => renderMessage(message, index))
            )}
            {!!streamError && (
              <View style={[styles.errorNotice, { backgroundColor: colors.muted }]}>
                <Text style={[styles.errorText, { color: colors.destructive }]}>{streamError}</Text>
              </View>
            )}
          </ScrollView>

          {selectedId !== null && (
            <View style={[styles.composerWrap, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <View style={[styles.composer, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Ask about something local…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={1200}
                  editable={!streaming}
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                  style={[styles.input, { color: colors.foreground }]}
                  accessibilityLabel="Message your local guide"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={streaming ? 'Stop response' : 'Send message'}
                  testID="send-ai-message"
                  onPress={streaming ? () => abortRef.current?.abort() : sendMessage}
                  disabled={!streaming && !draft.trim()}
                  style={[styles.sendButton, { backgroundColor: streaming || draft.trim() ? colors.primary : colors.border }]}
                >
                  <Feather name={streaming ? 'square' : 'arrow-up'} size={17} color={colors.primaryForeground} />
                </Pressable>
              </View>
              <Text style={[styles.privacyLine, { color: colors.mutedForeground }]}>Suggestions are yours to review. Nothing is joined or sent without you.</Text>
            </View>
          )}
        </>
      )}

      {!!actionToConfirm && (
        <View style={styles.confirmOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (joinPendingId === null && !createChallenge.isPending) setActionToConfirm(null);
            }}
            accessibilityLabel="Close confirmation"
          />
          <View style={[styles.confirmSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.kicker, { color: colors.primary }]}>
              {actionToConfirm.type === 'join_experience' ? 'YOUR PARTICIPATION' : 'YOUR CHOICE'}
            </Text>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
              {actionToConfirm.type === 'join_experience' ? 'Join this experience?' : 'Prepare an invitation?'}
            </Text>
            <Text style={[styles.confirmCopy, { color: colors.mutedForeground }]}>
              {actionToConfirm.type === 'join_experience'
                ? `Join ${actionToConfirm.experienceTitle}? If it is full, your place may be on its waitlist instead.`
                : actionToConfirm.friendId === null
                  ? 'This suggestion needs an accepted friend before it can be sent. You can choose a friend in Challenges.'
                  : `Send an invitation to ${actionToConfirm.friendName ?? 'your friend'} for ${actionToConfirm.experienceTitle}? This sends the invitation only; it will never join the experience for you.`}
            </Text>
            {!!joinError && actionToConfirm.type === 'join_experience' && (
              <Text style={[styles.errorText, { color: colors.destructive, marginTop: 9 }]}>{joinError}</Text>
            )}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setActionToConfirm(null)}
                disabled={joinPendingId !== null || createChallenge.isPending}
                style={[styles.secondaryButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Not now</Text>
              </Pressable>
              <Pressable
                onPress={actionToConfirm.type === 'join_experience' ? confirmJoin : confirmChallenge}
                disabled={
                  actionToConfirm.type === 'join_experience'
                    ? joinPendingId !== null || !!joinedParticipations[actionToConfirm.experienceId]
                    : createChallenge.isPending || actionToConfirm.friendId === null
                }
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: actionToConfirm.type === 'challenge_friend' && actionToConfirm.friendId === null ? colors.border : colors.primary,
                    flex: 1,
                  },
                ]}
              >
                {joinPendingId !== null || createChallenge.isPending
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <Text style={[
                    styles.primaryButtonText,
                    { color: actionToConfirm.type === 'challenge_friend' && actionToConfirm.friendId === null ? colors.mutedForeground : colors.primaryForeground },
                  ]}>
                    {actionToConfirm.type === 'join_experience'
                      ? 'Join experience'
                      : actionToConfirm.friendId === null ? 'Friend required' : 'Send invitation'}
                  </Text>}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 70 : 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCopy: { flex: 1, paddingRight: 12 },
  kicker: { fontSize: 10, letterSpacing: 1.45, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 },
  iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  conversationStrip: { flexGrow: 0, maxHeight: 76 },
  conversationStripContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  conversationChip: { maxWidth: 190, minWidth: 110, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, borderWidth: 1 },
  conversationTitle: { fontSize: 12, fontWeight: '600' },
  conversationDate: { fontSize: 10, marginTop: 3 },
  subHeader: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  activeTitle: { fontSize: 13, fontWeight: '600', flex: 1, paddingRight: 10 },
  deleteButton: { padding: 8 },
  messagesScroll: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 22, flexGrow: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16, maxWidth: '100%' },
  messageRowUser: { justifyContent: 'flex-end' },
  assistantMark: { width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  messageBody: { maxWidth: '88%', borderRadius: 18, padding: 12 },
  userBubble: { borderBottomRightRadius: 5 },
  assistantBubble: { borderBottomLeftRadius: 5 },
  messageText: { fontSize: 14, lineHeight: 21 },
  actionCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10, width: '100%' },
  actionTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  actionTitle: { fontSize: 14, fontWeight: '700', marginTop: 7 },
  actionMeta: { fontSize: 11, marginTop: 4 },
  actionButton: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionButtonText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  actionSuccess: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionSuccessText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  typingLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 12, flexShrink: 1 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'web' ? 38 : 12 },
  composer: { minHeight: 48, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'flex-end', padding: 5 },
  input: { flex: 1, maxHeight: 110, minHeight: 34, fontSize: 14, lineHeight: 20, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 6 },
  sendButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  privacyLine: { textAlign: 'center', fontSize: 10, marginTop: 7 },
  centerState: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  stateText: { fontSize: 13 },
  stateTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 5 },
  textAction: { padding: 10 },
  emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyMark: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  primaryButton: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  welcomeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12, padding: 13, borderRadius: 16 },
  emptyMarkSmall: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  welcomeNoteCopy: { flex: 1 },
  welcomeTitle: { fontWeight: '700', fontSize: 14 },
  skeletonLine: { height: 42, width: '88%', borderRadius: 15, marginVertical: 7, alignSelf: 'flex-start' },
  errorNotice: { borderRadius: 12, padding: 11, marginTop: 8 },
  errorText: { fontSize: 12, lineHeight: 17 },
  confirmOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(25,30,27,0.28)' },
  confirmSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 22, paddingBottom: Platform.OS === 'web' ? 38 : 28 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  confirmTitle: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  confirmCopy: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  secondaryButton: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 13, fontWeight: '600' },
});
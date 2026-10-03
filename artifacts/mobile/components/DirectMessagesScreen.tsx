import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDirectConversationQueryKey,
  getListDirectConversationsQueryKey,
  getListDirectMessagesQueryKey,
  getSearchDirectMessageProfilesQueryKey,
  useCreateDirectConversation,
  useGetDirectConversation,
  useListDirectConversations,
  useListDirectMessages,
  useMarkDirectConversationRead,
  useSearchDirectMessageProfiles,
  useSendDirectMessage,
  type DirectConversation,
  type DirectMessage,
  type DirectMessageProfile,
} from '@workspace/api-client-react';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PAGE_SIZE = 50;

export function DirectMessagesScreen({
  conversationId,
  onBack,
  onOpenConversation,
}: {
  conversationId?: number;
  onBack: () => void;
  onOpenConversation: (conversationId: number) => void;
}) {
  return conversationId
    ? (
      <DirectMessageThread
        conversationId={conversationId}
        onBack={onBack}
      />
    )
    : (
      <DirectMessagesInbox
        onBack={onBack}
        onOpenConversation={onOpenConversation}
      />
    );
}

function DirectMessagesInbox({
  onBack,
  onOpenConversation,
}: {
  onBack: () => void;
  onOpenConversation: (conversationId: number) => void;
}) {
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startError, setStartError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const conversationsQuery = useListDirectConversations({
    query: {
      enabled: Boolean(user),
      queryKey: [...getListDirectConversationsQueryKey(), user?.id ?? 0],
      refetchInterval: 30_000,
    },
  });
  const searchParams = useMemo(
    () => ({ search: debouncedSearch, limit: 20 }),
    [debouncedSearch],
  );
  const searchQuery = useSearchDirectMessageProfiles(searchParams, {
    query: {
      enabled: Boolean(user && debouncedSearch.length >= 2),
      queryKey: [...getSearchDirectMessageProfilesQueryKey(searchParams), user?.id ?? 0],
      staleTime: 10_000,
    },
  });
  const createConversation = useCreateDirectConversation();

  const openOrStartConversation = (recipientId: number) => {
    setStartError(false);
    createConversation.mutate(
      { data: { recipientId } },
      {
        onSuccess: (conversation) => {
          void queryClient.invalidateQueries({
            queryKey: getListDirectConversationsQueryKey(),
          });
          onOpenConversation(conversation.id);
        },
        onError: () => setStartError(true),
      },
    );
  };

  const matchingProfiles = searchQuery.data ?? [];
  const isSearching = debouncedSearch.length >= 2;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Message anyone on Experiences.fun
          </Text>
        </View>
      </View>

      <View style={[
        styles.searchBox,
        { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
      ]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Search people"
          value={search}
          onChangeText={setSearch}
          placeholder="Find someone by name or username"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setSearch('')}
            hitSlop={8}
          >
            <Feather name="x-circle" size={17} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {startError ? (
        <Text accessibilityRole="alert" style={[styles.inlineError, { color: colors.destructive }]}>
          Could not open that conversation. Please try again.
        </Text>
      ) : null}

      {isSearching ? (
        <View style={styles.resultsSection}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PEOPLE</Text>
          {searchQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : searchQuery.error ? (
            <Notice
              message="People could not be searched. Check your connection and try again."
              color={colors.mutedForeground}
              actionLabel="Retry"
              onAction={() => { void searchQuery.refetch(); }}
            />
          ) : matchingProfiles.length === 0 ? (
            <Notice
              message="No profiles found. Try a different name or username."
              color={colors.mutedForeground}
            />
          ) : (
            <FlatList
              data={matchingProfiles}
              keyExtractor={(profile) => String(profile.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <ProfileResult
                  profile={item}
                  disabled={createConversation.isPending}
                  onPress={() => openOrStartConversation(item.id)}
                />
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      ) : (
        <View style={styles.resultsSection}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>YOUR CHATS</Text>
          {conversationsQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : conversationsQuery.error ? (
            <Notice
              message="Messages could not be loaded. Check your connection and try again."
              color={colors.mutedForeground}
              actionLabel="Retry"
              onAction={() => { void conversationsQuery.refetch(); }}
            />
          ) : (conversationsQuery.data ?? []).length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '14' }]}>
                <Feather name="message-circle" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Start a conversation</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                Search for any profile above. You do not need to be friends first.
              </Text>
            </View>
          ) : (
            <FlatList
              data={conversationsQuery.data ?? []}
              keyExtractor={(conversation) => String(conversation.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <ConversationRow
                  conversation={item}
                  onPress={() => onOpenConversation(item.id)}
                />
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
    </View>
  );
}

function ProfileResult({
  profile,
  disabled,
  onPress,
}: {
  profile: DirectMessageProfile;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Message ${profile.name}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileRow,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <UserAvatar
        avatarUrl={profile.avatarUrl}
        name={profile.name}
        containerStyle={[styles.avatar, { backgroundColor: colors.muted }]}
        initialStyle={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 16 }}
      />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
          {profile.name}
        </Text>
        <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {profile.username ? `@${profile.username}` : 'Experiences.fun member'}
        </Text>
      </View>
      <Feather name="message-circle" size={19} color={colors.primary} />
    </Pressable>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: DirectConversation;
  onPress: () => void;
}) {
  const colors = useColors();
  const lastMessage = conversation.lastMessage;
  const preview = lastMessage
    ? `${lastMessage.senderId === conversation.otherUser.id ? '' : 'You: '}${lastMessage.body}`
    : 'Start a conversation';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${conversation.otherUser.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.conversationRow, pressed && styles.pressed]}
    >
      <UserAvatar
        avatarUrl={conversation.otherUser.avatarUrl}
        name={conversation.otherUser.name}
        containerStyle={[styles.avatar, { backgroundColor: colors.muted }]}
        initialStyle={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 16 }}
      />
      <View style={styles.rowCopy}>
        <View style={styles.nameAndTime}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
            {conversation.otherUser.name}
          </Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>
            {formatShortTime(conversation.lastMessageAt)}
          </Text>
        </View>
        <View style={styles.previewLine}>
          <Text
            style={[
              styles.rowSubtitle,
              { color: conversation.unreadCount > 0 ? colors.foreground : colors.mutedForeground },
              conversation.unreadCount > 0 && styles.unreadPreview,
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {conversation.unreadCount > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadBadgeText}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function DirectMessageThread({
  conversationId,
  onBack,
}: {
  conversationId: number;
  onBack: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const readAttemptDataTime = useRef(0);
  const [draft, setDraft] = useState('');
  const [olderMessages, setOlderMessages] = useState<DirectMessage[]>([]);
  const [beforeId, setBeforeId] = useState<number | undefined>();

  const conversationQueryKey = useMemo(
    () => [...getGetDirectConversationQueryKey(conversationId), user?.id ?? 0],
    [conversationId, user?.id],
  );
  const conversationQuery = useGetDirectConversation(conversationId, {
    query: {
      enabled: Boolean(user && conversationId > 0),
      queryKey: conversationQueryKey,
      staleTime: 15_000,
    },
  });
  const latestParams = useMemo(
    () => ({ conversationId, limit: PAGE_SIZE }),
    [conversationId],
  );
  const latestQueryKey = useMemo(
    () => [...getListDirectMessagesQueryKey(latestParams), user?.id ?? 0],
    [latestParams, user?.id],
  );
  const latestMessagesQuery = useListDirectMessages(latestParams, {
    query: {
      enabled: Boolean(user && conversationId > 0),
      queryKey: latestQueryKey,
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
    },
  });
  const olderParams = useMemo(
    () => ({ conversationId, beforeId, limit: PAGE_SIZE }),
    [conversationId, beforeId],
  );
  const olderQueryKey = useMemo(
    () => [...getListDirectMessagesQueryKey(olderParams), user?.id ?? 0],
    [olderParams, user?.id],
  );
  const olderMessagesQuery = useListDirectMessages(olderParams, {
    query: {
      enabled: Boolean(user && conversationId > 0 && beforeId),
      queryKey: olderQueryKey,
    },
  });

  useEffect(() => {
    setBeforeId(undefined);
    setOlderMessages([]);
    setDraft('');
    readAttemptDataTime.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (!olderMessagesQuery.data) return;
    setOlderMessages((current) => mergeMessages(current, olderMessagesQuery.data.messages));
  }, [olderMessagesQuery.data]);

  const markReadMutation = useMarkDirectConversationRead({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListDirectConversationsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: latestMessagesQuery.queryKey });
      },
    },
  });
  const hasUnreadIncoming = (latestMessagesQuery.data?.messages ?? []).some(
    (message) => message.senderId !== user?.id && message.readAt === null,
  );
  useEffect(() => {
    const dataUpdatedAt = latestMessagesQuery.dataUpdatedAt;
    if (
      !hasUnreadIncoming ||
      !dataUpdatedAt ||
      readAttemptDataTime.current === dataUpdatedAt
    ) {
      return;
    }
    readAttemptDataTime.current = dataUpdatedAt;
    markReadMutation.mutate({ conversationId });
  }, [
    conversationId,
    hasUnreadIncoming,
    latestMessagesQuery.dataUpdatedAt,
    markReadMutation.mutate,
  ]);

  const sendMutation = useSendDirectMessage({
    mutation: {
      onSuccess: (_message, variables) => {
        setDraft((current) => current === variables.data.body ? '' : current);
        void queryClient.invalidateQueries({ queryKey: getListDirectConversationsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: latestMessagesQuery.queryKey });
        requestAnimationFrame(() => inputRef.current?.focus());
      },
    },
  });

  const messages = useMemo(
    () => mergeMessages(latestMessagesQuery.data?.messages ?? [], olderMessages),
    [latestMessagesQuery.data?.messages, olderMessages],
  );
  const canLoadEarlier = beforeId
    ? Boolean(olderMessagesQuery.data?.hasMore)
    : Boolean(latestMessagesQuery.data?.hasMore);
  const hasMessages = messages.length > 0;
  const peer = conversationQuery.data?.otherUser;
  const submitMessage = () => {
    const body = draft.trim();
    if (!body || sendMutation.isPending || body.length > 2000) return;
    sendMutation.mutate({ conversationId, data: { body } });
  };

  const threadBody = (
    <>
      {conversationQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : conversationQuery.error || !peer ? (
        <Notice
          message="This conversation is unavailable. It may have been removed or your account has changed."
          color={colors.mutedForeground}
          actionLabel="Back"
          onAction={onBack}
        />
      ) : (
        <>
          {latestMessagesQuery.error ? (
            <Notice
              message="Messages could not be refreshed. Check your connection and try again."
              color={colors.mutedForeground}
              actionLabel="Retry"
              onAction={() => { void latestMessagesQuery.refetch(); }}
            />
          ) : null}
          {sendMutation.isError ? (
            <Text accessibilityRole="alert" style={[styles.sendError, { color: colors.destructive }]}>
              Message not sent. Your draft is still here; try again.
            </Text>
          ) : null}
          <FlatList
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            data={messages}
            keyExtractor={(message) => String(message.id)}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                ownMessage={item.senderId === user?.id}
              />
            )}
            inverted={hasMessages}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={(
              <View style={styles.emptyThread}>
                <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                  Say hello to {peer.name}.
                </Text>
              </View>
            )}
            ListFooterComponent={
              canLoadEarlier || olderMessagesQuery.isFetching
                ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier messages"
                    disabled={olderMessagesQuery.isFetching}
                    onPress={() => {
                      const oldest = messages[messages.length - 1];
                      if (oldest) setBeforeId(oldest.id);
                    }}
                    style={styles.loadEarlier}
                  >
                    {olderMessagesQuery.isFetching ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.loadEarlierText, { color: colors.primary }]}>
                        Load earlier messages
                      </Text>
                    )}
                  </Pressable>
                )
                : null
            }
          />
          <View style={[
            styles.composer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}>
            <TextInput
              ref={inputRef}
              accessibilityLabel="Write a message"
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={2000}
              blurOnSubmit={false}
              textAlignVertical="center"
              style={[
                styles.messageInput,
                { backgroundColor: colors.muted, color: colors.foreground },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!draft.trim() || draft.trim().length > 2000 || sendMutation.isPending}
              onPress={submitMessage}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: colors.primary },
                (!draft.trim() || draft.trim().length > 2000 || sendMutation.isPending)
                  && { backgroundColor: colors.muted },
                pressed && styles.pressed,
              ]}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather
                  name="send"
                  size={18}
                  color={!draft.trim() || draft.trim().length > 2000
                    ? colors.mutedForeground
                    : colors.primaryForeground}
                />
              )}
            </Pressable>
          </View>
        </>
      )}
    </>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.threadHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to messages"
          onPress={onBack}
          hitSlop={8}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        {peer ? (
          <UserAvatar
            avatarUrl={peer.avatarUrl}
            name={peer.name}
            containerStyle={[styles.threadAvatar, { backgroundColor: colors.muted }]}
            initialStyle={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 }}
          />
        ) : null}
        <View style={styles.headerCopy}>
          <Text style={[styles.threadTitle, { color: colors.foreground }]} numberOfLines={1}>
            {peer?.name ?? 'Conversation'}
          </Text>
          {peer?.username ? (
            <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              @{peer.username}
            </Text>
          ) : null}
        </View>
      </View>
      {Platform.OS === 'web' ? (
        <View style={styles.threadBody}>{threadBody}</View>
      ) : (
        <KeyboardAvoidingView
          style={styles.threadBody}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          {threadBody}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function MessageBubble({
  message,
  ownMessage,
}: {
  message: DirectMessage;
  ownMessage: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.messageRow, ownMessage ? styles.ownMessageRow : styles.theirMessageRow]}>
      <View style={[
        styles.messageBubble,
        ownMessage
          ? { backgroundColor: colors.primary, borderBottomRightRadius: 6 }
          : { backgroundColor: colors.muted, borderBottomLeftRadius: 6 },
      ]}>
        <Text style={[
          styles.messageBody,
          { color: ownMessage ? colors.primaryForeground : colors.foreground },
        ]}>
          {message.body}
        </Text>
        <View style={styles.messageMeta}>
          <Text style={[
            styles.messageTime,
            { color: ownMessage ? colors.primaryForeground + 'CC' : colors.mutedForeground },
          ]}>
            {formatMessageTime(message.createdAt)}
          </Text>
          {ownMessage ? (
            <Feather
              name={message.readAt ? 'check-circle' : 'check'}
              size={12}
              color={colors.primaryForeground + 'CC'}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Notice({
  message,
  color,
  actionLabel,
  onAction,
}: {
  message: string;
  color: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.notice}>
      <Text style={[styles.noticeText, { color }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.noticeAction}>
          <Text style={[styles.noticeActionText, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function mergeMessages(first: DirectMessage[], second: DirectMessage[]) {
  const byId = new Map<number, DirectMessage>();
  [...first, ...second].forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

function formatShortTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  backButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 36,
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: -0.4 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  searchBox: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 44,
    outlineStyle: 'none',
    paddingVertical: 8,
  } as never,
  inlineError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginHorizontal: 18, marginTop: 10 },
  resultsSection: { flex: 1, minHeight: 0, paddingTop: 22 },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.1,
    paddingBottom: 6,
    paddingHorizontal: 18,
  },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 140 },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  conversationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  avatar: { alignItems: 'center', borderRadius: 23, height: 46, justifyContent: 'center', width: 46 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  rowSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  nameAndTime: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  time: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  previewLine: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 1 },
  unreadPreview: { fontFamily: 'Inter_600SemiBold' },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  unreadBadgeText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 10 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 36 },
  emptyIcon: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 16 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: 'center' },
  notice: { alignItems: 'center', gap: 8, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  noticeText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  noticeAction: { padding: 6 },
  noticeActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  threadHeader: {
    alignItems: 'center',
    borderBottomColor: '#EAEAEA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  threadAvatar: { alignItems: 'center', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  threadTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  threadBody: { flex: 1, minHeight: 0 },
  messageList: { flex: 1, minHeight: 0 },
  messageListContent: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 14, paddingVertical: 12 },
  messageRow: { flexDirection: 'row', marginVertical: 4, width: '100%' },
  ownMessageRow: { justifyContent: 'flex-end' },
  theirMessageRow: { justifyContent: 'flex-start' },
  messageBubble: { borderRadius: 18, maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9 },
  messageBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 19 },
  messageMeta: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'flex-end', marginTop: 4 },
  messageTime: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  emptyThread: { alignItems: 'center', justifyContent: 'center', minHeight: 150 },
  loadEarlier: { alignItems: 'center', justifyContent: 'center', minHeight: 42, padding: 8 },
  loadEarlierText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sendError: { fontFamily: 'Inter_500Medium', fontSize: 12, paddingHorizontal: 14, paddingTop: 8 },
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  messageInput: {
    borderRadius: 21,
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  sendButton: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
});
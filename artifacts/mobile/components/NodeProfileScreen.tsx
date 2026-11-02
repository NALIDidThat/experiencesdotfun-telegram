import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMyNodesQueryKey,
  getGetNodeQueryKey,
  useConnectToNode,
  useDisconnectFromNode,
  useGetNode,
  useUpdateMyNodeConnection,
  type NodeConnectionInput,
  type NodeProfile,
} from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { NodeArtwork } from '@/components/NodeArtwork';

const participationRoles: Array<{ key: NodeConnectionInput['role']; label: string; detail: string }> = [
  { key: 'participant', label: 'Participant', detail: 'Take part in activities and community life' },
  { key: 'volunteer', label: 'Volunteer', detail: 'Support the Node and its activities' },
  { key: 'learner', label: 'Learner', detail: 'Learn, practise, and build new skills' },
];

function errorText(error: unknown) {
  const data = (error as { data?: { error?: string; message?: string } })?.data;
  return data?.error ?? data?.message ?? 'This action could not be completed. Please try again.';
}

export function NodeProfileScreen({
  nodeId,
  onBack,
  onOpenExperience,
}: {
  nodeId: number;
  onBack: () => void;
  onOpenExperience?: (experienceId: number) => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const profile = useGetNode(nodeId, { query: { queryKey: getGetNodeQueryKey(nodeId), enabled: Number.isSafeInteger(nodeId) && nodeId > 0, retry: false } });
  const connect = useConnectToNode();
  const updateConnection = useUpdateMyNodeConnection();
  const disconnect = useDisconnectFromNode();
  const [selectedRole, setSelectedRole] = useState<NodeConnectionInput['role']>('participant');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = connect.isPending || updateConnection.isPending || disconnect.isPending;
  const data = profile.data;
  const membership = data?.membership as NodeProfile['membership'] | null | undefined;
  const canConnect = user?.userType === 'participant';

  const runConnectionAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setError('');
    setNotice('');
    try {
      await action();
      const refreshed = await profile.refetch();
      if (refreshed.isError) throw refreshed.error;
      void queryClient.invalidateQueries({ queryKey: getGetMyNodesQueryKey() });
      setNotice(successMessage);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <ScrollView
      testID="node-profile-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 36, gap: 15, maxWidth: 840, width: '100%', alignSelf: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7 }}>
        <Feather name="arrow-left" size={19} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Back</Text>
      </Pressable>

      {profile.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : profile.isError || !data ? (
        <View style={{ alignItems: 'center', padding: 22, gap: 10 }}>
          <Feather name="map-pin" size={27} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: 'Inter_700Bold' }}>Node profile unavailable</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            This Node may not be approved yet, or the network could not be reached.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { void profile.refetch(); }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius + 4, backgroundColor: colors.card, gap: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13 }}>
              <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: `${colors.secondary}18`, alignItems: 'center', justifyContent: 'center' }}>
                <NodeArtwork nodeCategories={data.node.categories} size={48} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                  <Text style={{ color: colors.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' }}>{data.node.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="check-circle" size={14} color={colors.success} />
                    <Text style={{ color: colors.success, fontSize: 11, fontFamily: 'Inter_700Bold' }}>Verified Node</Text>
                  </View>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {data.node.organisationName}
                  {data.node.organisationType ? ` · ${data.node.organisationType.replace(/_/g, ' ')}` : ''}
                </Text>
                {data.node.organisationVerified ? (
                  <Text style={{ color: colors.success, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Organisation identity verified</Text>
                ) : null}
              </View>
            </View>
            {data.node.description ? (
              <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 21 }}>{data.node.description}</Text>
            ) : null}
            {data.node.categories.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {data.node.categories.map((category) => (
                  <View key={category} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: `${colors.primary}12` }}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{category}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Feather name="map" size={16} color={colors.primary} />
              <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
                {[data.node.addressLine1, data.node.addressLine2, data.node.city, data.node.postcode, data.node.country].filter(Boolean).join(', ')}
              </Text>
            </View>
            {data.node.publicWebsite ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="globe" size={15} color={colors.primary} />
                <Text selectable style={{ flex: 1, color: colors.primary, fontSize: 12 }}>{data.node.publicWebsite}</Text>
              </View>
            ) : null}
            {data.node.publicContactEmail ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="mail" size={15} color={colors.primary} />
                <Text selectable style={{ flex: 1, color: colors.primary, fontSize: 12 }}>{data.node.publicContactEmail}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Feather name="users" size={14} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{data.stats.connectedParticipants} connected</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Feather name="calendar" size={14} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{data.stats.publishedExperiences} experiences</Text>
              </View>
            </View>
          </View>

          {canConnect ? (
            <View style={{ padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, gap: 11 }}>
              {membership ? (
                <>
                  <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
                    {membership.status === 'active' ? 'You’re connected to this Node' : 'Connection requested'}
                  </Text>
                  {membership.status === 'pending' ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>The organisation will review your request. Connecting does not award XP.</Text>
                  ) : (
                    <>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Your role</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                        {participationRoles.map((role) => {
                          const active = role.key === membership.participationRole;
                          return (
                            <Pressable
                              key={role.key}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              disabled={busy || active}
                              onPress={() => void runConnectionAction(
                                () => updateConnection.mutateAsync({ nodeId, data: { role: role.key } }),
                                'Your Node role was updated.',
                              )}
                              style={{ minHeight: 35, paddingHorizontal: 10, borderWidth: 1, borderColor: active ? colors.primary : colors.border, borderRadius: 11, justifyContent: 'center', backgroundColor: active ? `${colors.primary}12` : colors.background }}
                            >
                              <Text style={{ color: active ? colors.primary : colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{role.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void runConnectionAction(() => disconnect.mutateAsync({ nodeId }), 'You disconnected from this Node.')}
                    style={{ minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
                  >
                    <Text style={{ color: colors.destructive, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Disconnect</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>Connect to this Node</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Choose how you want to take part. This connection does not award XP.</Text>
                  {participationRoles.map((role) => {
                    const active = selectedRole === role.key;
                    return (
                      <Pressable
                        key={role.key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setSelectedRole(role.key)}
                        style={{ padding: 11, borderWidth: 1, borderColor: active ? colors.primary : colors.border, borderRadius: 12, backgroundColor: active ? `${colors.primary}10` : colors.background, flexDirection: 'row', alignItems: 'center', gap: 9 }}
                      >
                        <Feather name={active ? 'check-circle' : 'circle'} size={16} color={active ? colors.primary : colors.mutedForeground} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{role.label}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{role.detail}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void runConnectionAction(
                      () => connect.mutateAsync({ nodeId, data: { role: selectedRole } }),
                      'You are connected to this Node.',
                    )}
                    style={{ minHeight: 44, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: busy ? 0.55 : 1 }}
                  >
                    {busy ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="users" size={15} color={colors.primaryForeground} />}
                    <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Connect to Node</Text>
                  </Pressable>
                </>
              )}
              {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text> : null}
              {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success, fontSize: 12 }}>{notice}</Text> : null}
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' }}>Experiences at this Node</Text>
            {data.experiences.length ? data.experiences.map((experience) => (
              <Pressable
                key={experience.id}
                accessibilityRole="button"
                disabled={!onOpenExperience}
                onPress={() => onOpenExperience?.(experience.id)}
                style={{ padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, gap: 5 }}
              >
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{experience.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{[experience.date, experience.startTime, experience.city].filter(Boolean).join(' · ')}</Text>
                {experience.description ? <Text numberOfLines={3} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{experience.description}</Text> : null}
              </Pressable>
            )) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
                This Node does not have any published experiences linked yet.
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

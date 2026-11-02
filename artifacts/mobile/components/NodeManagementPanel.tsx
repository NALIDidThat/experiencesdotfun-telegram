import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetMyNodesQueryKey,
  getGetOrganisationNodesQueryKey,
  useCreateOrganisationNode,
  useDisconnectFromNode,
  useGetOrganisationNodes,
  useGetMyNodes,
  useSetPrimaryNode,
  useSubmitOrganisationNode,
  useUpdateOrganisationNode,
  type Node as NetworkNode,
  type NodeDraftInput,
} from '@workspace/api-client-react';
import { ExperienceLocationPicker, type ResolvedLocation } from '@/components/ExperienceLocationPicker';
import { NodeArtwork } from '@/components/NodeArtwork';
import { useColors } from '@/hooks/useColors';

const nodeCategories = [
  { key: 'community', label: 'Community', icon: 'users' as const },
  { key: 'education', label: 'Education', icon: 'book-open' as const },
  { key: 'environmental', label: 'Environment', icon: 'feather' as const },
] as const;

type NodeCategory = NonNullable<NodeDraftInput['categories']>[number];
type NodeForm = {
  name: string;
  description: string;
  categories: NodeCategory[];
  location: string;
  city: string;
  country: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  website: string;
  contactEmail: string;
};
type TextFieldKey = 'name' | 'description' | 'location' | 'city' | 'country' | 'postcode' | 'website' | 'contactEmail';

const blankForm = (): NodeForm => ({
  name: '',
  description: '',
  categories: [],
  location: '',
  city: '',
  country: '',
  postcode: '',
  latitude: null,
  longitude: null,
  website: '',
  contactEmail: '',
});

function errorText(error: unknown) {
  const data = (error as { data?: { error?: string; message?: string } })?.data;
  return data?.error ?? data?.message ?? 'The Node could not be saved. Please try again.';
}

function statusLabel(status: NetworkNode['verificationStatus']) {
  const labels: Record<NetworkNode['verificationStatus'], string> = {
    draft: 'Draft',
    pending: 'Waiting for review',
    under_review: 'Under review',
    needs_information: 'Information requested',
    verified: 'Verified',
    rejected: 'Changes needed',
    suspended: 'Suspended',
  };
  return labels[status];
}

function textFieldStyle(colors: ReturnType<typeof useColors>) {
  return {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: colors.radius - 8,
    backgroundColor: colors.background,
    color: colors.foreground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  } as const;
}

export function NodeManagementPanel() {
  const colors = useColors();
  const nodes = useGetOrganisationNodes({ query: { queryKey: getGetOrganisationNodesQueryKey(), retry: false } });
  const createNode = useCreateOrganisationNode();
  const updateNode = useUpdateOrganisationNode();
  const submitNode = useSubmitOrganisationNode();
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NodeForm>(blankForm);
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const busy = createNode.isPending || updateNode.isPending || submitNode.isPending;

  const startNewNode = () => {
    setEditingNodeId(null);
    setFormOpen(true);
    setForm(blankForm());
    setSelectedLocation(null);
    setNotice('');
    setError('');
  };

  const editNode = (node: NetworkNode) => {
    setEditingNodeId(node.id);
    setFormOpen(true);
    setForm({
      name: node.name,
      description: node.description ?? '',
      categories: node.categories ?? [],
      location: node.addressLine1 ?? '',
      city: node.city ?? '',
      country: node.country ?? '',
      postcode: node.postcode ?? '',
      latitude: node.latitude,
      longitude: node.longitude,
      website: node.publicWebsite ?? '',
      contactEmail: node.publicContactEmail ?? '',
    });
    setSelectedLocation(null);
    setNotice('');
    setError('');
  };

  const buildPayload = (): NodeDraftInput => ({
      name: form.name.trim(),
      description: form.description.trim() || null,
      categories: form.categories,
      addressLine1: form.location.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      postcode: form.postcode.trim() || null,
      latitude: form.latitude,
      longitude: form.longitude,
      publicWebsite: form.website.trim() || null,
      publicContactEmail: form.contactEmail.trim() || null,
    });

  const saveDraft = async () => {
    setError('');
    setNotice('');
    const payload = buildPayload();
    try {
      const saved = editingNodeId
        ? await updateNode.mutateAsync({ nodeId: editingNodeId, data: payload })
        : await createNode.mutateAsync({ data: payload });
      setEditingNodeId(saved.id);
      const refreshed = await nodes.refetch();
      if (refreshed.isError) throw refreshed.error;
      setNotice('Draft saved. Complete the location details before submitting for review.');
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const submitForReview = async () => {
    if (!form.name.trim()) {
      setError('Add a name for this Node before submitting it.');
      return;
    }
    setError('');
    setNotice('');
    try {
      const saved = editingNodeId
        ? await updateNode.mutateAsync({ nodeId: editingNodeId, data: buildPayload() })
        : await createNode.mutateAsync({ data: buildPayload() });
      setEditingNodeId(saved.id);
      await submitNode.mutateAsync({ nodeId: saved.id });
      const refreshed = await nodes.refetch();
      if (refreshed.isError) throw refreshed.error;
      setNotice('Submitted for location verification. The Node will appear publicly after approval.');
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const toggleCategory = (category: NodeCategory) => {
    setForm((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }));
  };

  const input = (key: TextFieldKey, label: string, placeholder: string, options?: {
    multiline?: boolean;
    keyboardType?: 'default' | 'email-address' | 'url';
    maxLength?: number;
  }) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={String(form[key] ?? '')}
        onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={options?.multiline}
        keyboardType={options?.keyboardType}
        autoCapitalize={options?.keyboardType === 'email-address' ? 'none' : 'sentences'}
        maxLength={options?.maxLength}
        style={[
          textFieldStyle(colors),
          options?.multiline ? { minHeight: 96, textAlignVertical: 'top' as const } : null,
        ]}
      />
    </View>
  );

  return (
    <View testID="node-management-panel" style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: 'Inter_700Bold' }}>Your Nodes</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
            Add one or more community locations under this organisation.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a Node"
          disabled={nodes.isLoading || nodes.isError}
          onPress={startNewNode}
          style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: nodes.isLoading || nodes.isError ? 0.5 : 1 }}
        >
          <Feather name="plus" size={15} color={colors.primaryForeground} />
          <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: 'Inter_700Bold' }}>Add Node</Text>
        </Pressable>
      </View>

      {nodes.isLoading ? <ActivityIndicator color={colors.primary} /> : nodes.isError ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 13 }}>
            The Node Network is not available yet. Check again after its database setup is complete.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { void nodes.refetch(); }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Try again</Text>
          </Pressable>
        </View>
      ) : nodes.data?.length ? nodes.data.map((node) => (
        <View key={node.id} style={{ padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: `${colors.secondary}18`, alignItems: 'center', justifyContent: 'center' }}>
              <NodeArtwork nodeCategories={node.categories} size={29} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{node.name}</Text>
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>{[node.city, node.country].filter(Boolean).join(', ') || 'Location not set'}</Text>
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: node.verificationStatus === 'verified' ? `${colors.success}18` : `${colors.primary}12` }}>
              <Text style={{ color: node.verificationStatus === 'verified' ? colors.success : colors.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
                {statusLabel(node.verificationStatus)}
              </Text>
            </View>
          </View>
          {node.reviewerNotes ? <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{node.reviewerNotes}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => editNode(node)} style={{ minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="edit-2" size={13} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Edit details</Text>
            </Pressable>
            {['draft', 'rejected', 'needs_information'].includes(node.verificationStatus) ? (
              <Pressable accessibilityRole="button" onPress={() => editNode(node)} style={{ minHeight: 34, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="send" size={13} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Review & submit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )) : (
        <View style={{ padding: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: colors.radius, alignItems: 'center', gap: 8 }}>
          <NodeArtwork size={52} />
          <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Set up your first Node</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
            A Node is a real community location connected to your organisation.
          </Text>
        </View>
      )}

      {nodes.isSuccess && (formOpen || !nodes.data?.length) ? (
        <View style={{ padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, gap: 13 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>{editingNodeId ? 'Edit Node profile' : 'Register a Node'}</Text>
            {formOpen ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Close Node editor" onPress={() => setFormOpen(false)}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          {input('name', 'Node name', 'e.g. Northside Community Hub', { maxLength: 100 })}
          {input('description', 'About this Node', 'What happens here and who it serves', { multiline: true, maxLength: 2000 })}
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Categories</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {nodeCategories.map((category) => {
                const selected = form.categories.includes(category.key);
                return (
                  <Pressable key={category.key} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleCategory(category.key)} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, borderRadius: 12, backgroundColor: selected ? `${colors.primary}12` : colors.background }}>
                    <Feather name={category.icon} size={14} color={selected ? colors.primary : colors.mutedForeground} />
                    <Text style={{ color: selected ? colors.primary : colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{category.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Physical location and map pin</Text>
            <ExperienceLocationPicker
              value={form.location}
              selectedLocation={selectedLocation}
              onChange={(location) => setForm((current) => ({
                ...current,
                location,
                ...(location !== current.location ? { latitude: null, longitude: null } : {}),
              }))}
              onSelectLocation={(location) => {
                setSelectedLocation(location);
                if (location) setForm((current) => ({
                  ...current,
                  location: location.display,
                  city: location.name,
                  country: location.country,
                  latitude: location.latitude,
                  longitude: location.longitude,
                }));
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <View style={{ flex: 1 }}>{input('city', 'City', 'City or town', { maxLength: 120 })}</View>
            <View style={{ flex: 1 }}>{input('country', 'Country', 'Country', { maxLength: 120 })}</View>
          </View>
          {input('postcode', 'Postcode (optional)', 'Postcode', { maxLength: 32 })}
          {input('website', 'Public website (optional)', 'https://…', { keyboardType: 'url', maxLength: 500 })}
          {input('contactEmail', 'Public contact email (optional)', 'hello@example.org', { keyboardType: 'email-address', maxLength: 320 })}
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Only verified Nodes appear in public discovery. Changing a verified profile sends it back for review. Connecting does not award XP.
          </Text>
          {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success, fontSize: 12 }}>{notice}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" disabled={busy || !form.name.trim()} onPress={() => void saveDraft()} style={{ flex: 1, minHeight: 44, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: busy || !form.name.trim() ? 0.55 : 1 }}>
              {busy ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="save" size={15} color={colors.primaryForeground} />}
              <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Save draft</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy || !form.name.trim()} onPress={() => void submitForReview()} style={{ flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: busy || !form.name.trim() ? 0.5 : 1 }}>
              <Feather name="send" size={14} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Submit for review</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function NodeDashboardCard({ onManage }: { onManage: () => void }) {
  const colors = useColors();
  const nodes = useGetOrganisationNodes({ query: { queryKey: getGetOrganisationNodesQueryKey(), retry: false } });
  const firstNode = nodes.data?.[0];
  return (
    <View style={{ padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${colors.secondary}18`, alignItems: 'center', justifyContent: 'center' }}>
          <NodeArtwork nodeCategories={firstNode?.categories} size={38} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>Node Network</Text>
          <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            {nodes.isError
              ? 'Node registration is temporarily unavailable.'
              : firstNode
                ? `${nodes.data?.length ?? 0} ${nodes.data?.length === 1 ? 'Node' : 'Nodes'} · ${statusLabel(firstNode.verificationStatus)}`
                : 'Register a real community location for your organisation.'}
          </Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={onManage} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: `${colors.primary}12`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{firstNode ? 'Manage Nodes' : 'Register your first Node'}</Text>
        <Feather name="arrow-right" size={15} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export function MyNodeConnectionsPanel({ onOpenNode }: { onOpenNode: (nodeId: number) => void }) {
  const colors = useColors();
  const connections = useGetMyNodes({ query: { queryKey: getGetMyNodesQueryKey(), retry: false } });
  const setPrimary = useSetPrimaryNode();
  const disconnect = useDisconnectFromNode();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = setPrimary.isPending || disconnect.isPending;

  const refreshAfterMutation = async (message: string) => {
    setError('');
    setNotice('');
    try {
      const refreshed = await connections.refetch();
      if (refreshed.isError) throw refreshed.error;
      setNotice(message);
    } catch {
      setError('Your Node connections could not be refreshed. Try again.');
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Feather name="map-pin" size={19} color={colors.secondary} />
        <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: 'Inter_700Bold' }}>My Nodes</Text>
      </View>
      {connections.isLoading ? <ActivityIndicator color={colors.primary} /> : connections.isError ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 13 }}>Your Node connections could not be loaded.</Text>
          <Pressable accessibilityRole="button" onPress={() => { void connections.refetch(); }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Try again</Text>
          </Pressable>
        </View>
      ) : connections.data?.length ? connections.data.map((connection) => (
        <View key={connection.node.id} style={{ padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, gap: 9 }}>
          <Pressable accessibilityRole="button" onPress={() => onOpenNode(connection.node.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: `${colors.secondary}18`, alignItems: 'center', justifyContent: 'center' }}>
              <NodeArtwork nodeCategories={connection.node.categories} size={29} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{connection.node.name}</Text>
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11 }}>
                {connection.node.organisationName} · {connection.role}
              </Text>
            </View>
            <Text style={{ color: connection.status === 'active' ? colors.success : colors.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
              {connection.status === 'active' ? (connection.isPrimary ? 'Primary' : 'Connected') : 'Requested'}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {connection.status === 'active' && !connection.isPrimary ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void setPrimary.mutateAsync({ nodeId: connection.node.id }).then(() => refreshAfterMutation('Primary Node updated.')).catch((cause) => setError(errorText(cause)))}
                style={{ minHeight: 32, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Set primary</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void disconnect.mutateAsync({ nodeId: connection.node.id }).then(() => refreshAfterMutation('Node connection removed.')).catch((cause) => setError(errorText(cause)))}
              style={{ minHeight: 32, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Disconnect</Text>
            </Pressable>
          </View>
        </View>
      )) : (
        <View style={{ padding: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: colors.radius, alignItems: 'center', gap: 7 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            Connect to a verified Node from its profile to keep it in your community list.
          </Text>
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success, fontSize: 12 }}>{notice}</Text> : null}
    </View>
  );
}

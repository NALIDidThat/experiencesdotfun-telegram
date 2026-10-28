import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMyMemoriesQueryKey,
  getListMySavedExperiencesQueryKey,
  type PersonalMemory,
  type PersonalMemoryInput,
  type SavedExperience,
  useCreateMyMemory,
  useDeleteMyMemory,
  useGetPrivateEvidenceAccess,
  useListMyMemories,
  useListMySavedExperiences,
  useRemoveMySavedExperience,
  useUpdateMyMemory,
  useUploadPrivateEvidence,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Props = {
  profileId: number;
  onOpenExperience: (experienceId: number) => void;
  onExplore: () => void;
};

type SavedCategory = "personal" | "professional";

const savedCategories: Array<{ key: SavedCategory; label: string }> = [
  { key: "personal", label: "Personal" },
  { key: "professional", label: "Professional" },
];

function getRequestMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function savedDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently saved"
    : `Saved ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function SavedExperiencesPanel({ profileId, onOpenExperience, onExplore }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const savedQuery = useListMySavedExperiences({
    query: {
      queryKey: [...getListMySavedExperiencesQueryKey(), profileId],
      enabled: profileId > 0,
    },
  });
  const removeSaved = useRemoveMySavedExperience();
  const [category, setCategory] = useState<SavedCategory>("personal");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visibleExperiences = (savedQuery.data ?? []).filter((item) => item.category === category);

  const remove = async (experienceId: number) => {
    setErrorMessage(null);
    try {
      await removeSaved.mutateAsync({ experienceId });
      await queryClient.invalidateQueries({ queryKey: [...getListMySavedExperiencesQueryKey(), profileId] });
    } catch (error) {
      setErrorMessage(getRequestMessage(error, "This experience couldn’t be removed. Please try again."));
    }
  };

  return (
    <View testID="saved-experiences-panel" style={styles.panel}>
      <View style={styles.panelHeading}>
        <View style={styles.panelHeadingCopy}>
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>Saved experiences</Text>
          <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
            Keep opportunities you want to return to.
          </Text>
        </View>
        <View style={[styles.privateBadge, { backgroundColor: colors.muted }]}>
          <Feather name="bookmark" size={13} color={colors.primary} />
          <Text style={[styles.privateBadgeText, { color: colors.mutedForeground }]}>
            {savedQuery.data?.length ?? 0}
          </Text>
        </View>
      </View>

      <View
        accessibilityLabel="Saved experience categories"
        style={[styles.categorySwitch, { backgroundColor: colors.muted, borderRadius: colors.radius }]}
      >
        {savedCategories.map((item) => {
          const selected = category === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`Show ${item.label.toLowerCase()} saved experiences`}
              accessibilityState={{ selected }}
              testID={`saved-experiences-category-${item.key}`}
              onPress={() => setCategory(item.key)}
              style={[
                styles.categoryOption,
                selected && { backgroundColor: colors.card, borderRadius: Math.max(8, colors.radius - 4) },
              ]}
            >
              <Text style={[styles.categoryOptionText, { color: selected ? colors.foreground : colors.mutedForeground }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {errorMessage ? (
        <View accessibilityRole="alert" style={[styles.inlineError, { backgroundColor: colors.destructive + "12" }]}>
          <Text style={[styles.inlineErrorText, { color: colors.destructive }]}>{errorMessage}</Text>
        </View>
      ) : null}

      {savedQuery.isLoading ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading saved experiences…</Text>
        </View>
      ) : savedQuery.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="wifi-off" size={20} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Saved experiences couldn’t load.</Text>
          <Pressable accessibilityRole="button" testID="saved-experiences-retry" onPress={() => void savedQuery.refetch()}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : visibleExperiences.length ? (
        <View style={styles.cardList}>
          {visibleExperiences.map((item) => (
            <SavedExperienceCard
              key={item.id}
              item={item}
              onOpen={() => onOpenExperience(item.experienceId)}
              onRemove={() => void remove(item.experienceId)}
              removing={removeSaved.isPending}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.primary + "12" }]}>
            <Feather name="bookmark" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            Nothing saved to {category}
          </Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Save an experience from its details and it will appear here.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="saved-experiences-explore"
            onPress={onExplore}
            style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Explore experiences</Text>
            <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SavedExperienceCard({
  item,
  onOpen,
  onRemove,
  removing,
}: {
  item: SavedExperience;
  onOpen: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const colors = useColors();
  return (
    <View
      testID={`saved-experience-${item.experienceId}`}
      style={[
        styles.savedCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 3 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.experience.title}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.savedCardMain, { opacity: pressed ? 0.72 : 1 }]}
      >
        <View style={[styles.savedIcon, { backgroundColor: colors.primary + "12" }]}>
          <Feather name="compass" size={19} color={colors.primary} />
        </View>
        <View style={styles.savedCopy}>
          <Text numberOfLines={2} style={[styles.savedTitle, { color: colors.foreground }]}>
            {item.experience.title}
          </Text>
          <Text numberOfLines={1} style={[styles.savedMeta, { color: colors.mutedForeground }]}>
            {item.experience.organisationName} · {item.experience.city}
          </Text>
          <Text style={[styles.savedDate, { color: colors.mutedForeground }]}>{savedDateLabel(item.savedAt)}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.experience.title} from saved experiences`}
        accessibilityState={{ disabled: removing }}
        disabled={removing}
        testID={`saved-experience-remove-${item.experienceId}`}
        onPress={onRemove}
        style={({ pressed }) => [styles.removeButton, { opacity: removing ? 0.45 : pressed ? 0.6 : 1 }]}
      >
        <Feather name="bookmark" size={16} color={colors.primary} />
        <Text style={[styles.removeButtonText, { color: colors.primary }]}>Remove</Text>
      </Pressable>
    </View>
  );
}

export function PersonalMemoriesPanel({ profileId }: { profileId: number }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const memoriesQuery = useListMyMemories({
    query: {
      queryKey: [...getListMyMemoriesQueryKey(), profileId],
      enabled: profileId > 0,
    },
  });
  const createMemory = useCreateMyMemory();
  const updateMemory = useUpdateMyMemory();
  const deleteMemory = useDeleteMyMemory();
  const uploadPhoto = useUploadPrivateEvidence();
  const [isEditing, setIsEditing] = useState(false);
  const [editingMemory, setEditingMemory] = useState<PersonalMemory | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photoObjectKeys, setPhotoObjectKeys] = useState<string[]>([]);
  const [linksText, setLinksText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const openNewMemory = () => {
    setEditingMemory(null);
    setTitle("");
    setBody("");
    setPhotoObjectKeys([]);
    setLinksText("");
    setFormError(null);
    setRequestError(null);
    setIsEditing(true);
  };

  const openExistingMemory = (memory: PersonalMemory) => {
    setEditingMemory(memory);
    setTitle(memory.title ?? "");
    setBody(memory.body ?? "");
    setPhotoObjectKeys(memory.photoObjectKeys);
    setLinksText(memory.links.join("\n"));
    setFormError(null);
    setRequestError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingMemory(null);
    setFormError(null);
  };

  const addPhoto = async () => {
    setFormError(null);
    if (photoObjectKeys.length >= 5) {
      setFormError("A memory can include up to five photos.");
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.8,
      });
      const image = result.canceled ? null : result.assets[0];
      if (!image?.base64) return;
      if (image.fileSize && image.fileSize > 4 * 1024 * 1024) {
        setFormError("Choose a photo no larger than 4 MB.");
        return;
      }
      const contentType = image.mimeType ?? "image/jpeg";
      const uploaded = await uploadPhoto.mutateAsync({
        data: {
          purpose: "memory",
          contentType: contentType as "image/jpeg" | "image/png" | "image/webp",
          data: image.base64,
        },
      });
      setPhotoObjectKeys((current) => [...current, uploaded.objectKey].slice(0, 5));
    } catch (error) {
      setFormError(getRequestMessage(error, "That photo couldn’t be uploaded. Please try again."));
    }
  };

  const save = async () => {
    const links = linksText.split(/\r?\n/).map((link) => link.trim()).filter(Boolean);
    const payload: PersonalMemoryInput = {
      title: title.trim() || null,
      body: body.trim() || null,
      photoObjectKeys,
      links,
    };
    if (!payload.title && !payload.body && !photoObjectKeys.length && !links.length) {
      setFormError("Add a note, photo, or link before saving.");
      return;
    }
    setFormError(null);
    setRequestError(null);
    try {
      if (editingMemory) {
        await updateMemory.mutateAsync({ memoryId: editingMemory.id, data: payload });
      } else {
        await createMemory.mutateAsync({ data: payload });
      }
      await queryClient.invalidateQueries({ queryKey: [...getListMyMemoriesQueryKey(), profileId] });
      cancelEditing();
    } catch (error) {
      setRequestError(getRequestMessage(error, "This memory couldn’t be saved. Please try again."));
    }
  };

  const removeMemory = async (memory: PersonalMemory) => {
    setRequestError(null);
    try {
      await deleteMemory.mutateAsync({ memoryId: memory.id });
      setConfirmDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: [...getListMyMemoriesQueryKey(), profileId] });
    } catch (error) {
      setRequestError(getRequestMessage(error, "This memory couldn’t be deleted. Please try again."));
    }
  };

  const isSaving = createMemory.isPending || updateMemory.isPending;

  return (
    <View testID="personal-memories-panel" style={styles.panel}>
      <View style={styles.panelHeading}>
        <View style={styles.panelHeadingCopy}>
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>Memories</Text>
          <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
            Keep notes, photos, and links in a private collection.
          </Text>
        </View>
        <View style={[styles.privateBadge, { backgroundColor: colors.muted }]}>
          <Feather name="lock" size={13} color={colors.primary} />
          <Text style={[styles.privateBadgeText, { color: colors.mutedForeground }]}>Only you</Text>
        </View>
      </View>

      {requestError ? (
        <View accessibilityRole="alert" style={[styles.inlineError, { backgroundColor: colors.destructive + "12" }]}>
          <Text style={[styles.inlineErrorText, { color: colors.destructive }]}>{requestError}</Text>
        </View>
      ) : null}

      {!isEditing ? (
        <Pressable
          accessibilityRole="button"
          testID="memory-add"
          onPress={openNewMemory}
          style={({ pressed }) => [
            styles.addMemoryButton,
            { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Feather name="plus" size={17} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Add a memory</Text>
        </Pressable>
      ) : (
        <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 3 }]}>
          <Text style={[styles.editorTitle, { color: colors.foreground }]}>
            {editingMemory ? "Edit memory" : "New memory"}
          </Text>
          <Text style={[styles.privateHint, { color: colors.mutedForeground }]}>
            Only you can see your memories.
          </Text>
          <TextInput
            accessibilityLabel="Memory title"
            testID="memory-title"
            value={title}
            onChangeText={setTitle}
            placeholder="Title (optional)"
            placeholderTextColor={colors.mutedForeground}
            maxLength={120}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
          />
          <TextInput
            accessibilityLabel="Memory note"
            testID="memory-body"
            value={body}
            onChangeText={setBody}
            placeholder="Write a note"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={5000}
            textAlignVertical="top"
            style={[styles.noteInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
          />

          <View style={styles.editorSection}>
            <View style={styles.editorSectionHeader}>
              <Text style={[styles.editorSectionTitle, { color: colors.foreground }]}>Photos</Text>
              <Text style={[styles.editorSectionHint, { color: colors.mutedForeground }]}>{photoObjectKeys.length}/5</Text>
            </View>
            <View style={styles.photoRow}>
              {photoObjectKeys.map((objectKey) => (
                <View key={objectKey} style={styles.photoThumbWrap}>
                  <PrivateMemoryPhoto objectKey={objectKey} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo from memory"
                    testID={`memory-photo-remove-${objectKey.split("/").at(-1)}`}
                    onPress={() => setPhotoObjectKeys((current) => current.filter((key) => key !== objectKey))}
                    style={[styles.photoRemove, { backgroundColor: colors.foreground }]}
                  >
                    <Feather name="x" size={12} color={colors.background} />
                  </Pressable>
                </View>
              ))}
              {photoObjectKeys.length < 5 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo"
                  testID="memory-photo-add"
                  disabled={uploadPhoto.isPending}
                  onPress={() => void addPhoto()}
                  style={[styles.photoAddButton, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  {uploadPhoto.isPending
                    ? <ActivityIndicator color={colors.primary} />
                    : <Feather name="image" size={19} color={colors.primary} />}
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.editorSection}>
            <Text style={[styles.editorSectionTitle, { color: colors.foreground }]}>Links</Text>
            <TextInput
              accessibilityLabel="Memory links"
              testID="memory-links"
              value={linksText}
              onChangeText={setLinksText}
              placeholder={"Add secure links, one per line"}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="url"
              multiline
              style={[styles.linksInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
            />
          </View>

          {formError ? (
            <Text accessibilityRole="alert" style={[styles.inlineErrorText, { color: colors.destructive }]}>{formError}</Text>
          ) : null}

          <View style={styles.editorActions}>
            <Pressable
              accessibilityRole="button"
              testID="memory-cancel"
              onPress={cancelEditing}
              style={[styles.secondaryButton, { backgroundColor: colors.muted, borderRadius: colors.radius }]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="memory-save"
              accessibilityState={{ disabled: isSaving || uploadPhoto.isPending }}
              disabled={isSaving || uploadPhoto.isPending}
              onPress={() => void save()}
              style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary, borderRadius: colors.radius, opacity: isSaving || uploadPhoto.isPending ? 0.55 : 1 }]}
            >
              {isSaving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={15} color={colors.primaryForeground} />}
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {isSaving ? "Saving…" : "Save memory"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {memoriesQuery.isLoading ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading memories…</Text>
        </View>
      ) : memoriesQuery.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="wifi-off" size={20} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Memories couldn’t load.</Text>
          <Pressable accessibilityRole="button" testID="memories-retry" onPress={() => void memoriesQuery.refetch()}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : memoriesQuery.data?.length ? (
        <View style={styles.cardList}>
          {memoriesQuery.data.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              confirmingDelete={confirmDeleteId === memory.id}
              deleting={deleteMemory.isPending}
              onEdit={() => openExistingMemory(memory)}
              onRequestDelete={() => setConfirmDeleteId(memory.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => void removeMemory(memory)}
            />
          ))}
        </View>
      ) : !isEditing ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.primary + "12" }]}>
            <Feather name="book-open" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Save something meaningful</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Add a note, photo, or link and it will stay private to your profile.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PrivateMemoryPhoto({ objectKey }: { objectKey: string }) {
  const colors = useColors();
  const access = useGetPrivateEvidenceAccess();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const loadUrl = async () => {
    try {
      const result = await access.mutateAsync({ data: { objectKey } });
      setUrl(result.url);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => {
    let live = true;
    void access.mutateAsync({ data: { objectKey } })
      .then((result) => {
        if (live) {
          setUrl(result.url);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => { live = false; };
  }, [access.mutateAsync, objectKey]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open private memory photo"
      onPress={() => {
        if (url) void Linking.openURL(url).catch(() => setFailed(true));
      }}
      style={[styles.photo, { backgroundColor: colors.muted }]}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          resizeMode="cover"
          onError={() => { void loadUrl(); }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Feather name={failed ? "image" : "loader"} size={17} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

function MemoryCard({
  memory,
  confirmingDelete,
  deleting,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  memory: PersonalMemory;
  confirmingDelete: boolean;
  deleting: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  return (
    <View
      testID={`memory-entry-${memory.id}`}
      style={[
        styles.memoryCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 3 },
      ]}
    >
      <View style={styles.memoryHeader}>
        <View style={styles.memoryTitleCopy}>
          <Text style={[styles.memoryTitle, { color: colors.foreground }]}>
            {memory.title || "Memory"}
          </Text>
          <Text style={[styles.savedDate, { color: colors.mutedForeground }]}>
            {savedDateLabel(memory.updatedAt)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${memory.title || "memory"}`}
          testID={`memory-edit-${memory.id}`}
          onPress={onEdit}
          style={styles.iconButton}
        >
          <Feather name="edit-2" size={15} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {memory.body ? (
        <Text style={[styles.memoryBody, { color: colors.foreground }]}>{memory.body}</Text>
      ) : null}

      {memory.photoObjectKeys.length ? (
        <View style={styles.photoRow}>
          {memory.photoObjectKeys.map((objectKey) => (
            <PrivateMemoryPhoto key={objectKey} objectKey={objectKey} />
          ))}
        </View>
      ) : null}

      {memory.links.length ? (
        <View style={styles.memoryLinks}>
          {memory.links.map((link) => (
            <Pressable
              key={link}
              accessibilityRole="link"
              accessibilityLabel={`Open link ${link}`}
              onPress={() => void Linking.openURL(link).catch(() => undefined)}
              style={styles.memoryLink}
            >
              <Feather name="external-link" size={14} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.memoryLinkText, { color: colors.primary }]}>{link}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {confirmingDelete ? (
        <View style={[styles.deleteConfirm, { backgroundColor: colors.destructive + "10" }]}>
          <Text style={[styles.deleteConfirmText, { color: colors.foreground }]}>Delete this memory?</Text>
          <Pressable accessibilityRole="button" testID={`memory-delete-cancel-${memory.id}`} onPress={onCancelDelete}>
            <Text style={[styles.retryText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID={`memory-delete-confirm-${memory.id}`}
            disabled={deleting}
            onPress={onDelete}
          >
            <Text style={[styles.retryText, { color: colors.destructive }]}>{deleting ? "Deleting…" : "Delete"}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${memory.title || "memory"}`}
          testID={`memory-delete-${memory.id}`}
          onPress={onRequestDelete}
          style={styles.deleteButton}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} />
          <Text style={[styles.deleteText, { color: colors.destructive }]}>Delete memory</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14, marginBottom: 24 },
  panelHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  panelHeadingCopy: { flex: 1, gap: 3 },
  panelTitle: { fontSize: 22, lineHeight: 28, fontFamily: "Inter_700Bold" },
  panelSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  privateBadge: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 14, paddingHorizontal: 9 },
  privateBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  categorySwitch: { flexDirection: "row", gap: 4, padding: 4 },
  categoryOption: { flex: 1, minHeight: 35, alignItems: "center", justifyContent: "center" },
  categoryOptionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardList: { gap: 10 },
  savedCard: { overflow: "hidden", borderWidth: 1 },
  savedCardMain: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 88, padding: 13 },
  savedIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  savedCopy: { flex: 1, minWidth: 0, gap: 4 },
  savedTitle: { fontSize: 14, lineHeight: 19, fontFamily: "Inter_700Bold" },
  savedMeta: { fontSize: 10, fontFamily: "Inter_500Medium" },
  savedDate: { fontSize: 9, fontFamily: "Inter_400Regular" },
  removeButton: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#00000012" },
  removeButtonText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stateCard: { minHeight: 170, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 18, padding: 18 },
  stateIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, marginBottom: 3 },
  stateTitle: { fontSize: 14, textAlign: "center", fontFamily: "Inter_700Bold" },
  stateText: { maxWidth: 280, fontSize: 11, lineHeight: 16, textAlign: "center", fontFamily: "Inter_400Regular" },
  retryText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  primaryButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  primaryButtonText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  secondaryButton: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 15 },
  secondaryButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inlineError: { borderRadius: 11, padding: 10 },
  inlineErrorText: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium" },
  addMemoryButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  editorCard: { gap: 11, borderWidth: 1, padding: 14 },
  editorTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  privateHint: { fontSize: 11, lineHeight: 16, marginTop: -7, fontFamily: "Inter_400Regular" },
  input: { minHeight: 44, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, fontFamily: "Inter_400Regular" },
  noteInput: { minHeight: 94, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  editorSection: { gap: 8 },
  editorSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editorSectionTitle: { fontSize: 12, fontFamily: "Inter_700Bold" },
  editorSectionHint: { fontSize: 10, fontFamily: "Inter_500Medium" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumbWrap: { width: 72, height: 72, position: "relative" },
  photo: { width: 72, height: 72, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 12 },
  photoAddButton: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderRadius: 12 },
  photoRemove: { position: "absolute", top: -5, right: -5, width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, zIndex: 1 },
  linksInput: { minHeight: 64, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  editorActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  memoryCard: { gap: 10, borderWidth: 1, padding: 13 },
  memoryHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  memoryTitleCopy: { flex: 1, gap: 3 },
  memoryTitle: { fontSize: 14, lineHeight: 19, fontFamily: "Inter_700Bold" },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  memoryBody: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  memoryLinks: { gap: 7 },
  memoryLink: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 30 },
  memoryLinkText: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium" },
  deleteButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  deleteText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deleteConfirm: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  deleteConfirmText: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

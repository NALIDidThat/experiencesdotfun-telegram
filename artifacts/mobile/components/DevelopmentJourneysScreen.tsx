import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PoppinsText as Text, PoppinsTextInput as TextInput } from '@/components/Typography';
import {
  getGetHostExperienceMilestonesQueryKey,
  getListHostExperiencesQueryKey,
  getListJourneyProgrammesQueryKey,
  getListJourneyProgrammeParticipantsQueryKey,
  getListManagedJourneyProgrammesQueryKey,
  type JourneyEnrolmentProgress,
  type JourneyAuditEvent,
  type JourneyProgrammeStep,
  useCreateJourneyProgramme,
  useEnrolInJourneyProgramme,
  useGetHostExperienceMilestones,
  useListHostExperiences,
  useListJourneyProgrammeParticipants,
  useListJourneyProgrammes,
  useListManagedJourneyProgrammes,
  useUpdateJourneyProgramme,
  useWithdrawFromJourneyProgramme,
  type JourneyProgrammeStepInput,
  type UserType,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ExperienceCategoryArtwork } from '@/components/ExperienceCategoryArtwork';

type Props = {
  userType: UserType;
  onBack: () => void;
  onOpenExperience: (experienceId: number) => void;
};

type DraftStep = JourneyProgrammeStepInput & { localId: string };

export function DevelopmentJourneysScreen({ userType, onBack, onOpenExperience }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const isParticipant = userType === 'participant';
  const participantProgrammes = useListJourneyProgrammes({
    query: { enabled: isParticipant, staleTime: 0, queryKey: getListJourneyProgrammesQueryKey() },
  });
  const managedProgrammes = useListManagedJourneyProgrammes({
    query: { enabled: !isParticipant, staleTime: 0, queryKey: getListManagedJourneyProgrammesQueryKey() },
  });
  const hostExperiences = useListHostExperiences({
    query: { enabled: !isParticipant, queryKey: getListHostExperiencesQueryKey() },
  });
  const [selectedJourneyId, setSelectedJourneyId] = useState<number | null>(null);
  const [selectedExperienceId, setSelectedExperienceId] = useState<number | null>(null);
  const [editingProgrammeId, setEditingProgrammeId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [programmeTitle, setProgrammeTitle] = useState('');
  const [programmeDescription, setProgrammeDescription] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([]);
  const createProgramme = useCreateJourneyProgramme();
  const updateProgramme = useUpdateJourneyProgramme();
  const enrol = useEnrolInJourneyProgramme();
  const withdraw = useWithdrawFromJourneyProgramme();
  const selectedExperience = hostExperiences.data?.find((item) => item.id === selectedExperienceId);
  const experienceMilestones = useGetHostExperienceMilestones(selectedExperienceId ?? 0, {
    query: {
      queryKey: getGetHostExperienceMilestonesQueryKey(selectedExperienceId ?? 0),
      enabled: !isParticipant && selectedExperienceId !== null,
    },
  });
  const participantList = participantProgrammes.data ?? [];
  const managedList = managedProgrammes.data ?? [];
  const participants = useListJourneyProgrammeParticipants(selectedJourneyId ?? 0, {
    query: {
      queryKey: getListJourneyProgrammeParticipantsQueryKey(selectedJourneyId ?? 0),
      enabled: !isParticipant && selectedJourneyId !== null,
    },
  });

  const refreshProgrammes = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListJourneyProgrammesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListManagedJourneyProgrammesQueryKey() }),
      ...(selectedJourneyId !== null
        ? [queryClient.invalidateQueries({ queryKey: getListJourneyProgrammeParticipantsQueryKey(selectedJourneyId) })]
        : []),
    ]);
  };

  const appendStep = (step: JourneyProgrammeStepInput) => {
    setDraftSteps((current) => [
      ...current,
      { ...step, localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
  };

  const saveProgramme = () => {
    const title = programmeTitle.trim();
    const description = programmeDescription.trim();
    if (!title || !description || draftSteps.length === 0) return;
    createProgramme.mutate(
      {
        data: {
          title,
          description,
          steps: draftSteps.map(({ localId: _localId, ...step }) => step),
        },
      },
      {
        onSuccess: async () => {
          setProgrammeTitle('');
          setProgrammeDescription('');
          setDraftSteps([]);
          setComposerOpen(false);
          await refreshProgrammes();
        },
      },
    );
  };

  const isLoading = isParticipant ? participantProgrammes.isLoading : managedProgrammes.isLoading;
  const isError = isParticipant ? participantProgrammes.isError : managedProgrammes.isError;
  const programmes = useMemo(() => isParticipant ? participantList : managedList, [
    isParticipant,
    participantList,
    managedList,
  ]);

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={88}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="journeys-back"
          onPress={onBack}
          style={styles.iconButton}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: colors.primary }]}>
            {isParticipant ? 'YOUR DEVELOPMENT' : 'ORGANISATION PROGRAMMES'}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isParticipant ? 'Development journeys' : 'Programmes'}
          </Text>
        </View>
        <Feather name={isParticipant ? 'map' : 'users'} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        {isParticipant
          ? 'Follow an organisation’s ordered pathway. Progress changes only when hosts verify your participation or milestone work.'
          : 'Build a reusable pathway from your organisation’s experiences, reviewed milestones, and optional learning links.'}
      </Text>

      {!isParticipant ? (
        <>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: composerOpen }}
          accessibilityLabel={composerOpen ? 'Close programme builder' : 'Create a programme'}
          testID="journey-composer-toggle"
          onPress={() => setComposerOpen((open) => !open)}
          style={({ pressed }) => [
            styles.composerToggle,
            {
              backgroundColor: composerOpen ? colors.card : colors.primary,
              borderColor: composerOpen ? colors.border : colors.primary,
              borderRadius: colors.radius + 6,
              opacity: pressed ? 0.86 : 1,
            },
          ]}
        >
          <View style={[
            styles.composerToggleIcon,
            { backgroundColor: composerOpen ? `${colors.primary}14` : `${colors.primaryForeground}20` },
          ]}>
            <Feather name={composerOpen ? 'edit-3' : 'plus'} size={18} color={composerOpen ? colors.primary : colors.primaryForeground} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.composerToggleTitle, { color: composerOpen ? colors.foreground : colors.primaryForeground }]}>
              {composerOpen ? 'Programme builder' : 'Create a programme'}
            </Text>
            <Text style={[styles.composerToggleCopy, { color: composerOpen ? colors.mutedForeground : colors.primaryForeground }]}>
              {composerOpen ? 'Add verified experiences, milestones and optional resources.' : 'Set out a practical pathway for your community.'}
            </Text>
          </View>
          <Feather name={composerOpen ? 'chevron-up' : 'arrow-right'} size={18} color={composerOpen ? colors.mutedForeground : colors.primaryForeground} />
        </Pressable>
        {composerOpen ? (
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
          <View style={styles.formHeading}>
            <View style={styles.formHeadingCopy}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Define the pathway</Text>
              <Text style={[styles.helper, { color: colors.mutedForeground }]}>Add steps in the order participants should follow.</Text>
            </View>
            <View style={[styles.draftCount, { backgroundColor: colors.muted }]}>
              <Text style={[styles.draftCountText, { color: colors.primary }]}>{draftSteps.length}</Text>
              <Text style={[styles.draftCountLabel, { color: colors.mutedForeground }]}>{draftSteps.length === 1 ? 'STEP' : 'STEPS'}</Text>
            </View>
          </View>
          <TextInput
            accessibilityLabel="Programme title"
            testID="programme-title"
            value={programmeTitle}
            onChangeText={setProgrammeTitle}
            maxLength={120}
            placeholder="Programme name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
          />
          <TextInput
            accessibilityLabel="Programme description"
            testID="programme-description"
            value={programmeDescription}
            onChangeText={setProgrammeDescription}
            maxLength={1000}
            multiline
            placeholder="Who is this for, and what will participants do?"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.descriptionInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
          />
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Add an experience step</Text>
          {hostExperiences.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : hostExperiences.isError ? (
            <Text style={[styles.helper, { color: colors.destructive }]}>Your hosted experiences could not be loaded.</Text>
          ) : hostExperiences.data?.length ? (
            <View style={styles.choiceList}>
              {hostExperiences.data.filter((item) => item.status === 'published' || item.status === 'full').map((experience) => (
                <Pressable
                  key={experience.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedExperienceId === experience.id }}
                  testID={`journey-experience-${experience.id}`}
                  onPress={() => setSelectedExperienceId(experience.id)}
                  style={[
                    styles.choiceRow,
                    {
                      backgroundColor: selectedExperienceId === experience.id ? `${colors.primary}12` : colors.background,
                      borderColor: selectedExperienceId === experience.id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <ExperienceCategoryArtwork category={experience.category} size={34} />
                  <Text numberOfLines={2} style={[styles.choiceTitle, { color: colors.foreground }]}>{experience.title}</Text>
                  {selectedExperienceId === experience.id ? <Feather name="check-circle" size={17} color={colors.primary} /> : null}
                </Pressable>
              ))}
              {hostExperiences.data.every((item) => item.status !== 'published' && item.status !== 'full') ? (
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>Publish an experience before adding it to a programme.</Text>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>Create and publish an experience before building a programme.</Text>
          )}
          {selectedExperience ? (
            <View style={styles.addActions}>
              <Pressable
                accessibilityRole="button"
                testID="journey-add-experience-step"
                onPress={() => appendStep({
                  kind: 'experience',
                  title: selectedExperience.title,
                  experienceId: selectedExperience.id,
                })}
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={15} color={colors.primaryForeground} />
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Add verified experience</Text>
              </Pressable>
              {experienceMilestones.data?.milestones.map((milestone) => (
                <Pressable
                  key={milestone.id}
                  accessibilityRole="button"
                  testID={`journey-add-milestone-${milestone.id}`}
                  onPress={() => appendStep({
                    kind: 'milestone',
                    title: milestone.title,
                    description: milestone.description ?? undefined,
                    experienceId: selectedExperience.id,
                    milestoneId: milestone.id,
                  })}
                  style={[styles.secondaryAction, { borderColor: colors.border }]}
                >
                  <Feather name="award" size={15} color={colors.primary} />
                  <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Add milestone: {milestone.title}</Text>
                </Pressable>
              ))}
              {experienceMilestones.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
          ) : null}

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Optional learning link</Text>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>
            Links are resources only. Opening or saving one does not count as lesson completion or award XP.
          </Text>
          <TextInput
            accessibilityLabel="Learning resource title"
            testID="journey-resource-title"
            value={resourceTitle}
            onChangeText={setResourceTitle}
            maxLength={120}
            placeholder="Resource title"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
          />
          <TextInput
            accessibilityLabel="Learning resource HTTPS link"
            testID="journey-resource-url"
            value={resourceUrl}
            onChangeText={setResourceUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}
          />
          <Pressable
            accessibilityRole="button"
            testID="journey-add-resource-step"
            disabled={!resourceTitle.trim() || !/^https:\/\//i.test(resourceUrl.trim())}
            onPress={() => {
              appendStep({ kind: 'resource', title: resourceTitle.trim(), resourceUrl: resourceUrl.trim() });
              setResourceTitle('');
              setResourceUrl('');
            }}
            style={[styles.secondaryAction, { borderColor: colors.border, opacity: !resourceTitle.trim() || !/^https:\/\//i.test(resourceUrl.trim()) ? 0.5 : 1 }]}
          >
            <Feather name="link" size={15} color={colors.primary} />
            <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Add resource link</Text>
          </Pressable>

          {draftSteps.length ? (
            <View style={styles.draftSteps}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Programme order</Text>
              {draftSteps.map((step, index) => (
                <View key={step.localId} style={[styles.draftStep, { borderColor: colors.border }]}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.stepNumberText, { color: colors.primary }]}>{index + 1}</Text>
                  </View>
                  <View style={styles.copy}>
                    <Text numberOfLines={2} style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                    <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                      {step.kind === 'experience' ? 'Host-verified participation' : step.kind === 'milestone' ? 'Host-verified milestone' : 'Resource only · not completion evidence'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${step.title}`}
                    onPress={() => setDraftSteps((current) => current.filter((item) => item.localId !== step.localId))}
                    style={styles.iconButton}
                  >
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {createProgramme.isError ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
              Programme could not be saved. Check its steps and try again.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            testID="journey-create-programme"
            disabled={!programmeTitle.trim() || !programmeDescription.trim() || !draftSteps.length || createProgramme.isPending}
            onPress={saveProgramme}
            style={[styles.actionButton, { backgroundColor: colors.primary, opacity: !programmeTitle.trim() || !programmeDescription.trim() || !draftSteps.length || createProgramme.isPending ? 0.5 : 1 }]}
          >
            {createProgramme.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="save" size={15} color={colors.primaryForeground} />}
            <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Save as draft</Text>
          </Pressable>
        </View>
        ) : null}
        </>
      ) : null}

      <View style={styles.listHeading}>
        <View style={styles.copy}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {isParticipant ? 'Available programmes' : 'Your programmes'}
          </Text>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>
            {isParticipant
              ? 'Only verified experience and milestone steps count toward progress.'
              : 'Participants are private to your organisation; withdrawn enrolments stay in the audit record.'}
          </Text>
        </View>
        {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      {isError ? (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.helper, { color: colors.destructive }]}>Programmes could not be loaded.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void (isParticipant ? participantProgrammes.refetch() : managedProgrammes.refetch())}
          >
            <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : programmes.length ? programmes.map((programme) => {
        const isSelected = selectedJourneyId === programme.id;
        const participantProgramme = isParticipant ? participantList.find((item) => item.id === programme.id) : null;
        const managedProgramme = !isParticipant ? managedList.find((item) => item.id === programme.id) : null;
        const currentEnrolment = participantProgramme?.enrolment ?? null;
        return (
          <View key={programme.id} style={[styles.programmeCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 4 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isSelected }}
              testID={`journey-programme-${programme.id}`}
              onPress={() => setSelectedJourneyId(isSelected ? null : programme.id)}
              style={styles.programmeHeader}
            >
              <View style={[styles.programmeIcon, { backgroundColor: `${colors.primary}12` }]}>
                <Feather name={isParticipant ? 'map' : 'clipboard'} size={20} color={colors.primary} />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.programmeOrg, { color: colors.primary }]}>{programme.organisationName}</Text>
                <Text numberOfLines={2} style={[styles.programmeTitle, { color: colors.foreground }]}>{programme.title}</Text>
                <View style={[
                  styles.statusPill,
                  { backgroundColor: programme.status === 'published' ? `${colors.success}14` : colors.muted },
                ]}>
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: programme.status === 'published' ? colors.success : colors.mutedForeground },
                  ]} />
                  <Text style={[
                    styles.statusPillText,
                    { color: programme.status === 'published' ? colors.success : colors.mutedForeground },
                  ]}>
                    {programme.status === 'published' ? 'Published' : programme.status === 'archived' ? 'Archived' : 'Draft'}
                  </Text>
                </View>
                <Text numberOfLines={2} style={[styles.helper, { color: colors.mutedForeground }]}>{programme.description}</Text>
              </View>
              <Feather name={isSelected ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
            </Pressable>
            {!isParticipant && managedProgramme ? (
              <>
                <View style={[styles.metrics, { borderTopColor: colors.border }]}>
                  <Metric label="Active" value={managedProgramme.metrics.activeParticipants} colors={colors} />
                  <Metric label="Completed" value={managedProgramme.metrics.completedParticipants} colors={colors} />
                  <Metric label="Withdrawn" value={managedProgramme.metrics.withdrawnParticipants} colors={colors} />
                  <Metric label="Completion" value={`${managedProgramme.metrics.completionRatePercent}%`} colors={colors} />
                </View>
                <Text style={[styles.metricNote, { color: colors.mutedForeground }]}>
                  Completion rate = completed ÷ active plus completed. Withdrawals are excluded.
                </Text>
              </>
            ) : null}
            {isSelected ? (
              <View style={[styles.details, { borderTopColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Ordered steps</Text>
                {programme.steps.map((step, index) => {
                  const progress = currentEnrolment?.progress.steps.find((item) => item.stepId === step.id);
                  return (
                    <View key={step.id} style={[styles.stepRow, { borderColor: colors.border }]}>
                      <View style={[styles.stepNumber, { backgroundColor: progress?.status === 'complete' ? `${colors.success}18` : colors.muted }]}>
                        {progress?.status === 'complete'
                          ? <Feather name="check" size={14} color={colors.success} />
                          : <Text style={[styles.stepNumberText, { color: colors.primary }]}>{index + 1}</Text>}
                      </View>
                      <View style={styles.copy}>
                        <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                        <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                          {step.kind === 'experience'
                            ? 'Progress when participation is verified'
                            : step.kind === 'milestone'
                              ? 'Progress when this milestone is verified'
                              : 'Learning resource · not counted as completed'}
                        </Text>
                        {step.description ? <Text style={[styles.helper, { color: colors.mutedForeground }]}>{step.description}</Text> : null}
                      </View>
                      {step.kind === 'resource' && step.resourceUrl ? (
                        <Pressable
                          accessibilityRole="link"
                          accessibilityLabel={`Open learning resource: ${step.title}`}
                          onPress={() => void Linking.openURL(step.resourceUrl!).catch(() => {})}
                          style={styles.iconButton}
                        >
                          <Feather name="external-link" size={17} color={colors.primary} />
                        </Pressable>
                      ) : step.experienceId !== null ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open experience for ${step.title}`}
                          onPress={() => onOpenExperience(step.experienceId!)}
                          style={styles.iconButton}
                        >
                          <Feather name="arrow-up-right" size={17} color={colors.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
                {isParticipant ? (
                  <>
                    <ParticipantActions
                      enrolment={currentEnrolment}
                      programmeId={programme.id}
                      programmeStatus={programme.status}
                      enrol={enrol}
                      withdraw={withdraw}
                      colors={colors}
                      refresh={refreshProgrammes}
                    />
                    {currentEnrolment ? (
                      <AuditTrail events={currentEnrolment.auditEvents} steps={programme.steps} colors={colors} />
                    ) : null}
                  </>
                ) : (
                  <View style={styles.managementActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: editingProgrammeId === programme.id }}
                      testID={`journey-edit-details-${programme.id}`}
                      onPress={() => {
                        if (editingProgrammeId === programme.id) {
                          setEditingProgrammeId(null);
                        } else {
                          setEditingProgrammeId(programme.id);
                          setEditTitle(programme.title);
                          setEditDescription(programme.description);
                        }
                      }}
                      style={[styles.secondaryAction, { borderColor: colors.border }]}
                    >
                      <Feather name="edit-2" size={15} color={colors.primary} />
                      <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>
                        {editingProgrammeId === programme.id ? 'Close details editor' : 'Edit programme details'}
                      </Text>
                    </Pressable>
                    {editingProgrammeId === programme.id ? (
                      <View style={[styles.editCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                        <TextInput
                          accessibilityLabel="Edit programme title"
                          testID={`journey-edit-title-${programme.id}`}
                          value={editTitle}
                          onChangeText={setEditTitle}
                          maxLength={120}
                          placeholder="Programme name"
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
                        />
                        <TextInput
                          accessibilityLabel="Edit programme description"
                          testID={`journey-edit-description-${programme.id}`}
                          value={editDescription}
                          onChangeText={setEditDescription}
                          maxLength={1000}
                          multiline
                          placeholder="Programme description"
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.input, styles.descriptionInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
                        />
                        {updateProgramme.isError ? (
                          <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
                            Programme details could not be updated.
                          </Text>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          testID={`journey-save-details-${programme.id}`}
                          disabled={!editTitle.trim() || !editDescription.trim() || updateProgramme.isPending}
                          onPress={() => updateProgramme.mutate({
                            journeyId: programme.id,
                            data: { title: editTitle.trim(), description: editDescription.trim() },
                          }, {
                            onSuccess: async () => {
                              setEditingProgrammeId(null);
                              await refreshProgrammes();
                            },
                          })}
                          style={[styles.actionButton, { backgroundColor: colors.primary, opacity: !editTitle.trim() || !editDescription.trim() || updateProgramme.isPending ? 0.5 : 1 }]}
                        >
                          {updateProgramme.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="save" size={15} color={colors.primaryForeground} />}
                          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Save programme details</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      testID={`journey-toggle-publish-${programme.id}`}
                      disabled={updateProgramme.isPending || managedProgramme?.status === 'archived'}
                      onPress={() => updateProgramme.mutate({
                        journeyId: programme.id,
                        data: { status: programme.status === 'published' ? 'draft' : 'published' },
                      }, { onSuccess: refreshProgrammes })}
                      style={[styles.secondaryAction, { borderColor: colors.border, opacity: managedProgramme?.status === 'archived' ? 0.5 : 1 }]}
                    >
                      <Feather name={programme.status === 'published' ? 'eye-off' : 'eye'} size={15} color={colors.primary} />
                      <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>
                        {programme.status === 'published' ? 'Unpublish' : programme.status === 'archived' ? 'Archived' : 'Publish'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      testID={`journey-view-participants-${programme.id}`}
                      onPress={() => setSelectedJourneyId(programme.id)}
                      style={[styles.secondaryAction, { borderColor: colors.border }]}
                    >
                      <Feather name="users" size={15} color={colors.primary} />
                      <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>
                        {participants.isLoading && isSelected ? 'Loading participants…' : 'Participant progress'}
                      </Text>
                    </Pressable>
                    {participants.isError && isSelected ? (
                      <Text style={[styles.helper, { color: colors.destructive }]}>Participant progress could not be loaded.</Text>
                    ) : null}
                    {participants.data?.map((item) => (
                      <View key={item.participantId} style={[styles.participantRow, { borderColor: colors.border }]}>
                        <View style={styles.participantCopy}>
                          <View style={styles.copy}>
                            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{item.participantName}</Text>
                            <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                              {item.enrolment.status} · {item.enrolment.progress.completedSteps} of {item.enrolment.progress.eligibleSteps} verified steps
                            </Text>
                          </View>
                          <Text style={[styles.percent, { color: colors.primary }]}>{item.enrolment.progress.completionPercent}%</Text>
                        </View>
                        <AuditTrail events={item.enrolment.auditEvents} steps={programme.steps} colors={colors} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : null}
          </View>
        );
      }) : !isLoading ? (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name={isParticipant ? 'map' : 'clipboard'} size={20} color={colors.primary} />
          <View style={styles.copy}>
            <Text style={[styles.programmeTitle, { color: colors.foreground }]}>
              {isParticipant ? 'No published programmes yet' : 'No programmes saved yet'}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>
              {isParticipant
                ? 'When an organisation publishes a programme, it will appear here.'
                : 'Create a draft above, then publish it when the steps are ready.'}
            </Text>
          </View>
        </View>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

function ParticipantActions({
  enrolment,
  programmeId,
  programmeStatus,
  enrol,
  withdraw,
  colors,
  refresh,
}: {
  enrolment: JourneyEnrolmentProgress | null;
  programmeId: number;
  programmeStatus: string;
  enrol: ReturnType<typeof useEnrolInJourneyProgramme>;
  withdraw: ReturnType<typeof useWithdrawFromJourneyProgramme>;
  colors: ReturnType<typeof useColors>;
  refresh: () => Promise<void>;
}) {
  const buttonLabel = enrolment?.status === 'active'
    ? 'Withdraw from programme'
    : enrolment?.status === 'completed'
      ? 'Programme complete'
      : enrolment?.status === 'withdrawn'
        ? programmeStatus === 'published' ? 'Resume programme' : 'Programme closed'
        : 'Enrol in programme';
  const busy = enrol.isPending || withdraw.isPending;
  const resumeUnavailable = enrolment?.status === 'withdrawn' && programmeStatus !== 'published';
  const onPress = () => {
    if (enrolment?.status === 'active') {
      withdraw.mutate({ journeyId: programmeId }, { onSuccess: refresh });
    } else if (enrolment?.status !== 'completed') {
      enrol.mutate({ journeyId: programmeId }, { onSuccess: refresh });
    }
  };
  return (
    <View style={styles.enrolmentArea}>
      {enrolment ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressSummary}>
            <Text style={[styles.progressPercent, { color: colors.primary }]}>{enrolment.progress.completionPercent}%</Text>
            <Text style={[styles.helper, styles.progressCopy, { color: colors.mutedForeground }]}>
              {enrolment.progress.completedSteps} of {enrolment.progress.eligibleSteps} verified steps
              {enrolment.progress.totalSteps > enrolment.progress.eligibleSteps
                ? ` · ${enrolment.progress.totalSteps - enrolment.progress.eligibleSteps} learning resources not counted`
                : ''}
            </Text>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Verified programme progress"
            accessibilityValue={{ min: 0, max: 100, now: enrolment.progress.completionPercent }}
            style={[styles.progressTrack, { backgroundColor: colors.muted }]}
          >
            <View style={[
              styles.progressFill,
              {
                width: `${Math.max(0, Math.min(100, enrolment.progress.completionPercent))}%`,
                backgroundColor: colors.primary,
              },
            ]} />
          </View>
        </View>
      ) : null}
      {enrol.isError || withdraw.isError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
          This enrolment could not be updated. Refresh and try again.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        testID={`journey-enrol-${programmeId}`}
        disabled={busy || enrolment?.status === 'completed' || resumeUnavailable}
        onPress={onPress}
        style={[
          styles.actionButton,
          {
            backgroundColor: enrolment?.status === 'active' ? colors.card : colors.primary,
            borderWidth: enrolment?.status === 'active' ? 1 : 0,
            borderColor: colors.border,
            opacity: busy ? 0.55 : 1,
          },
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
        <Text style={[styles.actionText, { color: enrolment?.status === 'active' ? colors.foreground : colors.primaryForeground }]}>
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function Metric({ label, value, colors }: { label: string; value: number | string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function AuditTrail({
  events,
  steps,
  colors,
}: {
  events: JourneyAuditEvent[];
  steps: JourneyProgrammeStep[];
  colors: ReturnType<typeof useColors>;
}) {
  if (!events.length) return null;
  const eventLabel = (event: JourneyAuditEvent) => {
    if (event.eventType === 'enrolled') return 'Enrolled';
    if (event.eventType === 'withdrawn') return 'Withdrew';
    if (event.eventType === 'completed') return 'Completed all verified steps';
    const step = steps.find((item) => item.id === event.stepId);
    return step ? `Verified: ${step.title}` : 'Step verified';
  };
  return (
    <View style={[styles.auditTrail, { backgroundColor: colors.muted }]}>
      <Text style={[styles.auditHeading, { color: colors.foreground }]}>Progress history</Text>
      {events.map((event) => (
        <View key={event.id} style={styles.auditRow}>
          <Feather name={event.eventType === 'completed' || event.eventType === 'step_completed' ? 'check-circle' : 'clock'} size={13} color={colors.primary} />
          <Text style={[styles.auditText, { color: colors.foreground }]}>{eventLabel(event)}</Text>
          <Text style={[styles.auditDate, { color: colors.mutedForeground }]}>
            {new Date(event.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 17, paddingTop: 20, paddingBottom: 44, gap: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 3 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  kicker: { fontSize: 9, letterSpacing: 1.15, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 25, lineHeight: 31, letterSpacing: -0.65, fontFamily: 'Inter_700Bold' },
  intro: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular', maxWidth: 390, marginBottom: 1 },
  composerToggle: { minHeight: 76, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  composerToggleIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  composerToggleTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  composerToggleCopy: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 2 },
  formCard: { borderWidth: 1, padding: 15, gap: 11 },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  formHeadingCopy: { flex: 1, gap: 3 },
  draftCount: { minWidth: 50, height: 43, paddingHorizontal: 8, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  draftCountText: { fontSize: 14, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  draftCountLabel: { fontSize: 8, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13, fontFamily: 'Inter_400Regular' },
  descriptionInput: { minHeight: 86, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 4 },
  helper: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  statusPill: { alignSelf: 'flex-start', minHeight: 20, borderRadius: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, marginBottom: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_700Bold' },
  choiceList: { gap: 7 },
  choiceRow: { minHeight: 58, borderWidth: 1, borderRadius: 14, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceTitle: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_600SemiBold' },
  addActions: { gap: 7 },
  actionButton: { minHeight: 47, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  secondaryAction: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  secondaryActionText: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: 'Inter_600SemiBold' },
  draftSteps: { gap: 7, marginTop: 3 },
  draftStep: { minHeight: 58, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepNumber: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  stepTitle: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, paddingHorizontal: 1 },
  programmeCard: { overflow: 'hidden', borderWidth: 1 },
  programmeHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  programmeIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  programmeOrg: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  programmeTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold', marginTop: 2 },
  metrics: { borderTopWidth: 1, paddingHorizontal: 10, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  metricNote: { fontSize: 9, lineHeight: 13, paddingHorizontal: 12, paddingBottom: 9 },
  metric: { alignItems: 'center', flex: 1, gap: 2 },
  metricValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  details: { borderTopWidth: 1, padding: 13, gap: 9 },
  stepRow: { minHeight: 61, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  managementActions: { gap: 8, marginTop: 3 },
  editCard: { borderWidth: 1, borderRadius: 13, padding: 10, gap: 9 },
  participantRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9, gap: 8 },
  participantCopy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  auditTrail: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 8, gap: 6 },
  auditHeading: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  auditRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  auditText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  auditDate: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  percent: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  enrolmentArea: { gap: 11, marginTop: 4, paddingTop: 2 },
  progressBlock: { gap: 8 },
  progressCopy: { flex: 1 },
  progressSummary: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  progressPercent: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
});

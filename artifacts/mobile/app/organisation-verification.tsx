import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOrganisationVerificationQueryKey,
  getListOrganisationVerificationReviewQueueQueryKey,
  useGetOrganisationVerification,
  useSaveOrganisationVerificationDraft,
  useSearchCompaniesHouseForOrganisationVerification,
  useSubmitOrganisationVerificationApplication,
  useGetOrganisationVerificationReviewAccess,
  useListOrganisationVerificationReviewQueue,
  useReviewOrganisationVerificationApplication,
  useUploadPrivateEvidence,
  useGetPrivateEvidenceAccess,
  type CompaniesHouseSearchResult,
  type OrganisationVerificationApplicationInput,
  type OrganisationVerificationDraftInput,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type DraftFields = OrganisationVerificationDraftInput;
type CompanyResult = CompaniesHouseSearchResult['results'][number];
type FieldKey = Exclude<keyof DraftFields, 'evidenceObjectKeys'>;

const textFields: Array<{ key: FieldKey; label: string; hint: string; keyboard?: 'email-address' | 'url' | 'default' }> = [
  { key: 'legalName', label: 'Legal organisation name', hint: 'As shown on your official registration' },
  { key: 'organisationType', label: 'Organisation type', hint: 'Charity, school, community group…' },
  { key: 'jurisdiction', label: 'Country or jurisdiction', hint: 'Where your organisation is registered' },
  { key: 'registrationNumber', label: 'Registration number', hint: 'Optional, if you have one' },
  { key: 'website', label: 'Official website', hint: 'https://…', keyboard: 'url' },
  { key: 'representativeName', label: 'Your full name', hint: 'Person submitting this application' },
  { key: 'representativeRole', label: 'Your role', hint: 'Your relationship to the organisation' },
  { key: 'contactEmail', label: 'Contact email', hint: 'A monitored organisation email', keyboard: 'email-address' },
];

function messageFromError(error: unknown) {
  const message = (error as { data?: { message?: string } })?.data?.message;
  return typeof message === 'string' ? message : 'We couldn’t save that just now. Please try again.';
}

function statusCopy(status: string) {
  const labels: Record<string, string> = {
    unsubmitted: 'Not submitted',
    pending: 'Waiting for review',
    under_review: 'In review',
    needs_information: 'Information requested',
    verified: 'Verified',
    rejected: 'Changes needed',
    suspended: 'Verification paused',
    expired: 'Verification expired',
  };
  return labels[status] ?? 'Verification status';
}

export default function OrganisationVerificationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const statusQuery = useGetOrganisationVerification();
  const saveDraft = useSaveOrganisationVerificationDraft();
  const submitApplication = useSubmitOrganisationVerificationApplication();
  const searchCompanies = useSearchCompaniesHouseForOrganisationVerification();
  const reviewerAccess = useGetOrganisationVerificationReviewAccess();
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const reviewQueue = useListOrganisationVerificationReviewQueue({
    query: {
      queryKey: getListOrganisationVerificationReviewQueueQueryKey(),
      enabled: showReviewQueue && reviewerAccess.data?.canReview === true,
    },
  });
  const reviewApplication = useReviewOrganisationVerificationApplication();
  const uploadEvidence = useUploadPrivateEvidence();
  const getEvidenceAccess = useGetPrivateEvidenceAccess();
  const hydrated = useRef(false);
  const [fields, setFields] = useState<DraftFields>({
    legalName: null,
    organisationType: null,
    jurisdiction: null,
    registrationNumber: null,
    website: null,
    representativeName: null,
    representativeRole: null,
    contactEmail: null,
    evidenceObjectKeys: [],
  });
  const [searchText, setSearchText] = useState('');
  const [companies, setCompanies] = useState<CompanyResult[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const application = statusQuery.data?.application;
    if (application && !hydrated.current) {
      setFields({
        legalName: application.legalName,
        organisationType: application.organisationType,
        jurisdiction: application.jurisdiction,
        registrationNumber: application.registrationNumber,
        website: application.website,
        representativeName: application.representativeName,
        representativeRole: application.representativeRole,
        contactEmail: application.contactEmail,
        evidenceObjectKeys: application.evidenceObjectKeys ?? [],
      });
      hydrated.current = true;
    } else if (statusQuery.data && !hydrated.current) {
      hydrated.current = true;
    }
  }, [statusQuery.data]);

  const refreshStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetOrganisationVerificationQueryKey() });
  };

  const updateField = (key: FieldKey, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    setNotice('');
    setError('');
  };

  const onSaveDraft = async () => {
    setError('');
    setNotice('');
    try {
      await saveDraft.mutateAsync({ data: fields });
      await refreshStatus();
      setNotice('Draft saved. You can come back to finish it later.');
    } catch (cause) {
      setError(messageFromError(cause));
    }
  };

  const onSubmit = async () => {
    setError('');
    setNotice('');
    const required: Array<keyof OrganisationVerificationApplicationInput> = [
      'legalName', 'organisationType', 'jurisdiction', 'representativeName', 'representativeRole', 'contactEmail',
    ];
    if (required.some((key) => !String(fields[key] ?? '').trim())) {
      setError('Complete the legal name, organisation type, jurisdiction, representative details, and contact email.');
      return;
    }
    const input: OrganisationVerificationApplicationInput = {
      legalName: String(fields.legalName).trim(),
      organisationType: String(fields.organisationType).trim(),
      jurisdiction: String(fields.jurisdiction).trim(),
      representativeName: String(fields.representativeName).trim(),
      representativeRole: String(fields.representativeRole).trim(),
      contactEmail: String(fields.contactEmail).trim(),
      registrationNumber: fields.registrationNumber?.trim() || null,
      website: fields.website?.trim() || null,
      evidenceObjectKeys: fields.evidenceObjectKeys ?? [],
    };
    try {
      await submitApplication.mutateAsync({ data: input });
      await refreshStatus();
      setNotice('Application submitted. We’ll show updates here.');
    } catch (cause) {
      setError(messageFromError(cause));
    }
  };

  const addEvidence = async () => {
    setError('');
    try {
      const picker = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });
      const image = picker.canceled ? null : picker.assets[0];
      if (!image?.base64) return;
      if (image.fileSize && image.fileSize > 4 * 1024 * 1024) {
        setError('Choose an image no larger than 4 MB.');
        return;
      }
      const contentType = image.mimeType ?? 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
        setError('Evidence must be a JPEG, PNG, or WebP image.');
        return;
      }
      const uploaded = await uploadEvidence.mutateAsync({
        data: { contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp', data: image.base64 },
      });
      setFields((previous) => ({
        ...previous,
        evidenceObjectKeys: [...(previous.evidenceObjectKeys ?? []), uploaded.objectKey],
      }));
      setNotice('Private evidence added. It will be visible only to your organisation profile and the reviewer.');
    } catch (cause) {
      setError(messageFromError(cause));
    }
  };

  const openEvidence = async (objectKey: string) => {
    try {
      const { url } = await getEvidenceAccess.mutateAsync({ data: { objectKey } });
      await Linking.openURL(url);
    } catch (cause) {
      setError(messageFromError(cause));
    }
  };

  const onSearchCompanies = async () => {
    setError('');
    setNotice('');
    try {
      const response = await searchCompanies.mutateAsync({ data: { query: searchText.trim() } });
      setCompanies(response.results);
      if (!response.results.length) setNotice('No matching Companies House records found.');
    } catch (cause) {
      setError(messageFromError(cause));
    }
  };

  const onReview = async (applicationId: number, action: 'approve' | 'reject' | 'needs_information' | 'suspend') => {
    setError('');
    setNotice('');
    const note = reviewNotes[applicationId]?.trim() ?? '';
    if ((action === 'reject' || action === 'suspend') && note.length < 5) {
      setError('Add a reason of at least 5 characters before rejecting or suspending.');
      return;
    }
    try {
      await reviewApplication.mutateAsync({ applicationId, data: { action, note: note || undefined } });
      await reviewQueue.refetch();
      await refreshStatus();
      setNotice('Review decision recorded.');
    } catch (cause) {
      setError(messageFromError(cause));
    }
  };

  const chooseCompany = (company: CompanyResult) => {
    setFields((previous) => ({
      ...previous,
      legalName: company.name,
      registrationNumber: company.registrationNumber,
      jurisdiction: previous.jurisdiction || company.registeredAddress?.country || '',
    }));
    setSearchText(company.name);
    setCompanies([]);
    setNotice('Company details added. This record does not confirm that you represent the organisation.');
  };

  const status = statusQuery.data?.status ?? 'unsubmitted';
  const isBusy = saveDraft.isPending || submitApplication.isPending;
  const canSubmit =
    ['unsubmitted', 'rejected', 'expired'].includes(status) ||
    statusQuery.data?.application?.status === 'draft' ||
    statusQuery.data?.application?.status === 'needs_information';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>Organisation verification</Text>
        <View style={styles.backButton} />
      </View>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 },
        ]}
        bottomOffset={64}
      >
        <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.statusIcon, { backgroundColor: status === 'verified' ? colors.success + '15' : colors.primary + '14' }]}>
            <Feather name={status === 'verified' ? 'check-circle' : 'shield'} size={20} color={status === 'verified' ? colors.success : colors.primary} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>{statusCopy(status)}</Text>
            <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>
              {status === 'verified'
                ? 'Your organisation has completed this review.'
                : 'A Companies House match helps identify a registered organisation; it does not prove your authority to represent it.'}
            </Text>
          </View>
          {statusQuery.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
        </View>

        {user?.userType !== 'organisation' ? (
          <Text style={[styles.message, { color: colors.destructive }]}>Switch to your organisation profile to manage verification.</Text>
        ) : statusQuery.isLoading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : statusQuery.isError ? (
          <Pressable onPress={() => { void statusQuery.refetch(); }} style={[styles.secondaryButton, { borderColor: colors.border }]}>
            <Text style={[styles.secondaryText, { color: colors.foreground }]}>Retry loading verification</Text>
          </Pressable>
        ) : (
          <>
            {reviewerAccess.data?.canReview ? (
              <View style={styles.reviewSection}>
                <Pressable
                  testID="verification-review-queue-toggle"
                  accessibilityRole="button"
                  onPress={() => setShowReviewQueue((open) => !open)}
                  style={[styles.secondaryButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryText, { color: colors.foreground }]}>
                    {showReviewQueue ? 'Hide review queue' : 'Review applications'}
                  </Text>
                </Pressable>
                {showReviewQueue ? (
                  reviewQueue.isLoading ? <ActivityIndicator color={colors.primary} /> :
                    reviewQueue.isError ? (
                      <Pressable onPress={() => { void reviewQueue.refetch(); }}>
                        <Text style={[styles.message, { color: colors.destructive }]}>Couldn’t load the queue. Tap to retry.</Text>
                      </Pressable>
                    ) : reviewQueue.data?.length ? reviewQueue.data.map((application) => (
                      <View key={application.id} style={[styles.reviewNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.companyName, { color: colors.foreground }]}>{application.organisationName} · {application.legalName ?? 'Details incomplete'}</Text>
                        <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>
                          {application.organisationType ?? 'Type not set'} · {application.jurisdiction ?? 'Jurisdiction not set'}
                        </Text>
                        <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>
                          {application.representativeName ?? 'Representative not set'} · {application.representativeRole ?? 'Role not set'}
                        </Text>
                        <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>
                          {application.registrationNumber ?? 'No registration number'} · {application.website ?? 'No website'}
                        </Text>
                        <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>{application.contactEmail ?? 'No contact email'}</Text>
                        {(application.evidenceObjectKeys ?? []).map((key, index) => (
                          <Pressable key={key} accessibilityRole="button" onPress={() => void openEvidence(key)}>
                            <Text style={[styles.statusDescription, { color: colors.primary }]}>Open private evidence {index + 1}</Text>
                          </Pressable>
                        ))}
                        <TextInput
                          value={reviewNotes[application.id] ?? ''}
                          onChangeText={(value) => setReviewNotes((previous) => ({ ...previous, [application.id]: value }))}
                          placeholder="Reviewer note (required for rejection or suspension)"
                          placeholderTextColor={colors.mutedForeground}
                          maxLength={500}
                          multiline
                          accessibilityLabel={`Reviewer note for ${application.organisationName}`}
                          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, minHeight: 70 }]}
                        />
                        <View style={styles.reviewActions}>
                          {(['approve', 'reject', 'needs_information', 'suspend'] as const).map((action) => (
                            <Pressable
                              key={action}
                              testID={`verification-review-${action}-${application.id}`}
                              accessibilityRole="button"
                              disabled={reviewApplication.isPending}
                              onPress={() => { void onReview(application.id, action); }}
                              style={[styles.reviewAction, { borderColor: colors.border, opacity: reviewApplication.isPending ? 0.55 : 1 }]}
                            >
                              <Text style={[styles.reviewActionText, { color: colors.foreground }]}>{action.replace('_', ' ')}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )) : <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>No applications are waiting for review.</Text>
                ) : null}
              </View>
            ) : null}
            {canSubmit || statusQuery.data?.application?.status === 'needs_information' ? (
              <>
                <Text style={[styles.intro, { color: colors.mutedForeground }]}>
                  Add your legal details and the person responsible for this application. You can save a draft before submitting.
                </Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Find your registered organisation</Text>
                <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Company name or number"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.searchInput, { color: colors.foreground }]}
                    accessibilityLabel="Search Companies House"
                    returnKeyType="search"
                    onSubmitEditing={() => { void onSearchCompanies(); }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Search Companies House"
                    testID="verification-company-search"
                    disabled={searchCompanies.isPending || searchText.trim().length < 2}
                    onPress={() => { void onSearchCompanies(); }}
                    style={[styles.searchButton, { backgroundColor: colors.primary, opacity: searchCompanies.isPending || searchText.trim().length < 2 ? 0.55 : 1 }]}
                  >
                    {searchCompanies.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="search" size={17} color={colors.primaryForeground} />}
                  </Pressable>
                </View>
                {companies.map((company) => (
                  <Pressable
                    key={company.registrationNumber}
                    accessibilityRole="button"
                    testID={`verification-company-${company.registrationNumber}`}
                    onPress={() => chooseCompany(company)}
                    style={[styles.companyResult, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.companyCopy}>
                      <Text style={[styles.companyName, { color: colors.foreground }]}>{company.name}</Text>
                      <Text style={[styles.companyMeta, { color: colors.mutedForeground }]}>
                        {company.registrationNumber} · {company.status}
                      </Text>
                    </View>
                    <Feather name="plus-circle" size={19} color={colors.primary} />
                  </Pressable>
                ))}
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 5 }]}>Application details</Text>
                {textFields.map((field) => (
                  <View key={field.key} style={styles.field}>
                    <Text style={[styles.label, { color: colors.foreground }]}>{field.label}</Text>
                    <TextInput
                      testID={`verification-field-${field.key}`}
                      value={fields[field.key] ?? ''}
                      onChangeText={(value) => updateField(field.key, value)}
                      placeholder={field.hint}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType={field.keyboard === 'email-address' ? 'email-address' : 'default'}
                      autoCapitalize={field.keyboard === 'email-address' || field.keyboard === 'url' ? 'none' : 'words'}
                      autoCorrect={field.keyboard !== 'url'}
                      maxLength={field.key === 'legalName' ? 180 : field.key === 'contactEmail' ? 254 : 160}
                      style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                    />
                  </View>
                ))}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Supporting evidence (optional)</Text>
                  <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>
                    Upload up to five JPEG, PNG, or WebP images, 4 MB each. Do not upload identity documents.
                  </Text>
                  {(fields.evidenceObjectKeys ?? []).map((key, index) => (
                    <View key={key} style={styles.historyRow}>
                      <Text style={[styles.statusDescription, { color: colors.mutedForeground, flex: 1 }]}>Evidence image {index + 1}</Text>
                      <Pressable accessibilityRole="button" onPress={() => setFields((current) => ({
                        ...current,
                        evidenceObjectKeys: (current.evidenceObjectKeys ?? []).filter((item) => item !== key),
                      }))}>
                        <Text style={[styles.statusDescription, { color: colors.destructive }]}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                  {(fields.evidenceObjectKeys ?? []).length < 5 ? (
                    <Pressable accessibilityRole="button" disabled={uploadEvidence.isPending} onPress={() => void addEvidence()} style={[styles.secondaryButton, { borderColor: colors.border }]}>
                      {uploadEvidence.isPending ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.secondaryText, { color: colors.foreground }]}>Choose evidence image</Text>}
                    </Pressable>
                  ) : null}
                </View>
                <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>
                  Your organisation account and the verification reviewer can access these details. Company registry data is not a substitute for representative evidence.
                </Text>
                {error ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.destructive }]}>{error}</Text> : null}
                {notice ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.success }]}>{notice}</Text> : null}
                <Pressable
                  testID="verification-save-draft"
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => { void onSaveDraft(); }}
                  style={[styles.secondaryButton, { borderColor: colors.border, opacity: isBusy ? 0.6 : 1 }]}
                >
                  {saveDraft.isPending ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.secondaryText, { color: colors.foreground }]}>Save draft</Text>}
                </Pressable>
                <Pressable
                  testID="verification-submit"
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => { void onSubmit(); }}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isBusy ? 0.6 : 1 }]}
                >
                  {submitApplication.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Submit for review</Text>}
                </Pressable>
              </>
            ) : null}

            {statusQuery.data?.application?.reviewerNotes ? (
              <View style={[styles.reviewNote, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>Reviewer update</Text>
                <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>{statusQuery.data.application.reviewerNotes}</Text>
              </View>
            ) : null}
            {statusQuery.data?.history.length ? (
              <View style={styles.history}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Application history</Text>
                {statusQuery.data.history.map((event) => (
                  <View key={event.id} style={styles.historyRow}>
                    <View style={[styles.historyDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.historyText, { color: colors.mutedForeground }]}>
                      {event.event.replaceAll('_', ' ')} · {new Date(event.at).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backButton: { width: 38, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  scroll: { flex: 1 },
  content: { gap: 12, paddingHorizontal: 18, paddingTop: 14, maxWidth: 620, width: '100%', alignSelf: 'center' },
  statusCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center' },
  statusIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statusDescription: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  intro: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4 },
  sectionTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold', marginTop: 8 },
  searchRow: { minHeight: 49, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', padding: 4 },
  searchInput: { flex: 1, minWidth: 0, paddingHorizontal: 10, fontSize: 14 },
  searchButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  companyResult: { minHeight: 58, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  companyCopy: { flex: 1, gap: 3 },
  companyName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  companyMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' },
  field: { gap: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 13, fontSize: 14 },
  privacyNote: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  message: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primaryButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  reviewNote: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 5, marginTop: 10 },
  history: { gap: 10, marginTop: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  historyDot: { width: 7, height: 7, borderRadius: 4 },
  historyText: { fontSize: 12, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' },
  reviewSection: { gap: 9 },
  reviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  reviewAction: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  reviewActionText: { fontSize: 10, textTransform: 'capitalize', fontFamily: 'Inter_600SemiBold' },
  loader: { paddingVertical: 30 },
});

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { PoppinsText as Text, PoppinsTextInput as TextInput } from '@/components/Typography';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListMyPersonalActivitiesQueryKey,
  usePlanMyPersonalActivity,
  type PersonalActivity,
  type PersonalActivityPlanInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import ExploreMap from '@/components/ExploreMap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ActivityType = PersonalActivityPlanInput['activityType'];
type RoutePoint = { latitude: number; longitude: number };
type Props = {
  onBack: () => void;
  onComplete: (activityId: number) => void;
};
type Step = 0 | 1 | 2 | 3;
type ActivityOption = { value: ActivityType; label: string; detail: string; icon: keyof typeof Feather.glyphMap };

const ACTIVITY_OPTIONS: ActivityOption[] = [
  { value: 'walk', label: 'Walk', detail: 'A steady pace, room to notice things', icon: 'navigation' },
  { value: 'run', label: 'Run', detail: 'A route built for a quicker stride', icon: 'wind' },
  { value: 'cycle', label: 'Cycle', detail: 'A ride to get you there', icon: 'target' },
];
const STEP_COPY = [
  { title: 'What would feel good to do?', hint: 'Start with the reason. The route can follow.' },
  { title: 'How do you want to get there?', hint: 'Choose the pace that feels right today.' },
  { title: 'Where are you heading?', hint: 'A place, park, or neighbourhood is enough.' },
  { title: 'Your plan is ready', hint: 'A private plan, saved to your personal routes.' },
] as const;

function decodePolyline(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  try {
    while (index < encoded.length) {
      let shift = 0;
      let value = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63) return [];
        value |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      latitude += value & 1 ? ~(value >> 1) : value >> 1;

      shift = 0;
      value = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63) return [];
        value |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      longitude += value & 1 ? ~(value >> 1) : value >> 1;
      const point = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return [];
      points.push(point);
    }
  } catch {
    return [];
  }
  return points;
}

function distanceLabel(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function durationLabel(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return 'Not available';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'We couldn’t save this route just now. Your answers are still here—please try again.';
}

export function PersonalRoutePlannerScreen({ onBack, onComplete }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const planMutation = usePlanMyPersonalActivity();
  const [step, setStep] = useState<Step>(0);
  const [goal, setGoal] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('walk');
  const [destination, setDestination] = useState('');
  const [activity, setActivity] = useState<PersonalActivity | null>(null);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState(false);
  const [locationSettingsRequired, setLocationSettingsRequired] = useState(false);
  const routePoints = useMemo(() => decodePolyline(activity?.routePolyline ?? ''), [activity?.routePolyline]);
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const current = STEP_COPY[step];
  const isBusy = planMutation.isPending;

  const goBack = () => {
    if (isBusy) return;
    setError('');
    if (step > 0 && step < 3) setStep((step - 1) as Step);
    else if (step === 3 && activity) onComplete(activity.id);
    else onBack();
  };

  const continueFromGoal = () => {
    if (goal.trim().length < 5) {
      setError('Add a little more detail—at least five characters is enough.');
      return;
    }
    setError('');
    setStep(1);
  };

  const continueFromActivity = () => {
    setError('');
    setStep(2);
  };

  const generatePlan = async () => {
    if (goal.trim().length < 5) {
      setStep(0);
      setError('Add a little more detail to your goal before planning.');
      return;
    }
    if (destination.trim().length < 2) {
      setError('Add a destination so we know where you’re heading.');
      return;
    }
    setError('');
    setLocationError(false);
    setLocationSettingsRequired(false);

    let origin: { latitude: number; longitude: number };
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError(true);
        setLocationSettingsRequired(!permission.canAskAgain);
        setError(permission.canAskAgain
          ? 'Location access is needed to plan a route from where you are. Allow foreground location and try again.'
          : 'Location access is turned off for this app. Enable it in device settings, then try again.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      origin = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
      setLocationError(true);
      setLocationSettingsRequired(false);
      setError('We couldn’t read your location. Check your device settings and try again.');
      return;
    }

    try {
      const planned = await planMutation.mutateAsync({
        data: {
          goal: goal.trim(),
          destination: destination.trim(),
          activityType,
          originLatitude: origin.latitude,
          originLongitude: origin.longitude,
        },
      });
      setActivity(planned);
      setStep(3);
      void queryClient.invalidateQueries({ queryKey: getListMyPersonalActivitiesQueryKey() }).catch(() => undefined);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    }
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setError('Open your device settings to allow location, then return and try again.');
    }
  };

  const renderError = () => error ? (
    <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '35' }]}>
      <Feather name="alert-circle" size={17} color={colors.destructive} />
      <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
      {locationError && locationSettingsRequired ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open location settings" testID="personal-route-open-settings" onPress={() => { void openSettings(); }} style={styles.errorAction}>
          <Text style={[styles.errorActionText, { color: colors.destructive }]}>Settings</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const renderProgress = () => (
    <View accessibilityLabel={`Step ${step === 3 ? 3 : step + 1} of 3`} style={styles.progressBlock}>
      <View style={styles.progressTopline}>
        <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>{step === 3 ? 'ROUTE REVIEW' : `STEP ${step + 1} OF 3`}</Text>
        <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>{step === 3 ? 'Saved' : `${step + 1} / 3`}</Text>
      </View>
      <View style={styles.progressTrack}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[styles.progressSegment, { backgroundColor: index <= step ? colors.primary : colors.border }]} />
        ))}
      </View>
    </View>
  );

  const renderResult = () => {
    if (!activity) return null;
    const selectedType = ACTIVITY_OPTIONS.find((option) => option.value === activity.activityType);
    return (
      <>
        <View style={[styles.savedBanner, { backgroundColor: colors.success + '12', borderColor: colors.success + '35' }]}>
          <View style={[styles.savedIcon, { backgroundColor: colors.success + '18' }]}><Feather name="check" size={17} color={colors.success} /></View>
          <View style={styles.savedCopy}>
            <Text style={[styles.savedTitle, { color: colors.foreground }]}>Saved to your personal routes</Text>
            <Text style={[styles.savedDetail, { color: colors.mutedForeground }]}>This is your private plan. It isn’t an organisation-hosted experience.</Text>
          </View>
        </View>
        <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
          <View style={styles.resultHeading}>
            <View style={[styles.resultIcon, { backgroundColor: colors.primary + '14' }]}><Feather name={selectedType?.icon ?? 'map'} size={18} color={colors.primary} /></View>
            <View style={styles.resultTitleWrap}>
              <Text style={[styles.resultTitle, { color: colors.foreground }]}>{activity.title}</Text>
              <Text style={[styles.resultDestination, { color: colors.mutedForeground }]}>{activity.destination}</Text>
            </View>
            <View style={[styles.privatePill, { backgroundColor: colors.teal + '12' }]}>
              <Feather name="lock" size={11} color={colors.teal} />
              <Text style={[styles.privateText, { color: colors.foreground }]}>Private</Text>
            </View>
          </View>
          <View style={[styles.mapFrame, { borderColor: colors.border, backgroundColor: colors.muted }]} testID="personal-route-review-map">
            {routePoints.length ? (
              <ExploreMap
                apiKey={apiKey}
                cities={[]}
                routePoints={routePoints}
                mode="explore"
                selectedCity={null}
                status="ready"
                fullScreen={false}
                onSelectCity={() => undefined}
                onExploreCity={() => undefined}
                onResetCity={() => undefined}
              />
            ) : (
              <View style={styles.mapEmpty}>
                <View style={[styles.mapEmptyIcon, { backgroundColor: colors.card }]}><Feather name="map" size={20} color={colors.primary} /></View>
                <Text style={[styles.mapEmptyTitle, { color: colors.foreground }]}>Map preview unavailable</Text>
                <Text style={[styles.mapEmptyCopy, { color: colors.mutedForeground }]}>Your plan is saved. You can still review its route details below.</Text>
              </View>
            )}
            {routePoints.length ? (
              <View style={[styles.mapTag, { backgroundColor: colors.card }]}>
                <Feather name="lock" size={11} color={colors.teal} />
                <Text style={[styles.mapTagText, { color: colors.foreground }]}>Private route</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.goalQuote, { color: colors.mutedForeground }]}>{activity.goal}</Text>
          {activity.planSummary ? <Text style={[styles.planSummary, { color: colors.foreground }]}>{activity.planSummary}</Text> : null}
          {activity.planTips?.length ? (
            <View style={[styles.tipsPanel, { backgroundColor: colors.muted }]}>
              <Text style={[styles.tipsTitle, { color: colors.foreground }]}>A few things to keep in mind</Text>
              {activity.planTips.map((tip, index) => (
                <View key={`${index}-${tip}`} style={styles.tipRow}>
                  <View style={[styles.tipDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.tipText, { color: colors.mutedForeground }]}>{tip}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.metricsRow, { borderTopColor: colors.border }]}>
            <Metric label="Planned distance" value={distanceLabel(activity.plannedDistanceMeters)} colors={colors} />
            <Metric label="Time estimate" value={durationLabel(activity.plannedDurationSeconds)} colors={colors} />
          </View>
          <View style={[styles.disclaimer, { backgroundColor: colors.muted }]}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>This is a plan, not a record of a completed or verified route.</Text>
          </View>
        </View>
      </>
    );
  };

  const renderFormStep = () => {
    if (step === 0) {
      return (
        <>
          <View style={[styles.promptMark, { backgroundColor: colors.primary + '14' }]}><Feather name="compass" size={20} color={colors.primary} /></View>
          <Text style={[styles.promptTitle, { color: colors.foreground }]}>What would you like this time to be for?</Text>
          <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>A small intention is a good place to start. Your plan stays yours.</Text>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Your goal</Text>
          <TextInput
            accessibilityLabel="Describe your route goal"
            accessibilityHint="At least five characters"
            testID="personal-route-goal-input"
            value={goal}
            onChangeText={(value) => { setGoal(value); if (error) setError(''); }}
            placeholder="A quiet walk to clear my head"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            textAlignVertical="top"
            returnKeyType="default"
            style={[styles.goalInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
          />
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{goal.length}/500 · at least 5 characters</Text>
        </>
      );
    }
    if (step === 1) {
      return (
        <>
          <View style={[styles.promptMark, { backgroundColor: colors.secondary + '12' }]}><Feather name="activity" size={20} color={colors.secondary} /></View>
          <Text style={[styles.promptTitle, { color: colors.foreground }]}>Pick your kind of movement</Text>
          <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>There’s no wrong pace. Choose what works for you today.</Text>
          <View style={styles.activityOptions}>
            {ACTIVITY_OPTIONS.map((option) => {
              const selected = activityType === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label}. ${option.detail}`}
                  testID={`personal-route-type-${option.value}`}
                  onPress={() => { setActivityType(option.value); setError(''); }}
                  style={({ pressed }) => [
                    styles.activityOption,
                    { backgroundColor: selected ? colors.primary + '0D' : colors.card, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius + 2, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <View style={[styles.activityOptionIcon, { backgroundColor: selected ? colors.primary : colors.muted }]}>
                    <Feather name={option.icon} size={18} color={selected ? colors.primaryForeground : colors.mutedForeground} />
                  </View>
                  <View style={styles.activityOptionCopy}>
                    <Text style={[styles.activityOptionTitle, { color: colors.foreground }]}>{option.label}</Text>
                    <Text style={[styles.activityOptionDetail, { color: colors.mutedForeground }]}>{option.detail}</Text>
                  </View>
                  <View style={[styles.radioOuter, { borderColor: selected ? colors.primary : colors.border }]}>
                    {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      );
    }
    return (
      <>
        <View style={[styles.promptMark, { backgroundColor: colors.teal + '16' }]}><Feather name="map-pin" size={20} color={colors.teal} /></View>
        <Text style={[styles.promptTitle, { color: colors.foreground }]}>Where are you heading?</Text>
        <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>Enter a destination and we’ll shape a route from your current location.</Text>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Destination</Text>
        <TextInput
          accessibilityLabel="Route destination"
          accessibilityHint="A place, park, or neighbourhood"
          testID="personal-route-destination-input"
          value={destination}
          onChangeText={(value) => { setDestination(value); if (error) setError(''); }}
          placeholder="Park, neighbourhood, or place"
          placeholderTextColor={colors.mutedForeground}
          maxLength={180}
          returnKeyType="done"
          onSubmitEditing={() => { void generatePlan(); }}
          style={[styles.destinationInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        />
        <View style={[styles.locationNote, { backgroundColor: colors.teal + '10', borderColor: colors.teal + '32' }]}>
          <Feather name="crosshair" size={16} color={colors.teal} />
          <Text style={[styles.locationNoteText, { color: colors.foreground }]}>We’ll ask for foreground location only when you choose to generate your route. Your coordinates won’t appear in the plan.</Text>
        </View>
      </>
    );
  };

  const renderFooter = () => (
    <View style={styles.footer}>
      {step === 0 ? (
        <PrimaryButton label="Continue" icon="arrow-right" disabled={goal.trim().length < 5 || isBusy} onPress={continueFromGoal} testID="personal-route-continue-goal" colors={colors} />
      ) : step === 1 ? (
        <PrimaryButton label="Continue" icon="arrow-right" disabled={isBusy} onPress={continueFromActivity} testID="personal-route-continue-type" colors={colors} />
      ) : step === 2 ? (
        <PrimaryButton label="Generate my route" icon="map" disabled={destination.trim().length < 2 || isBusy} onPress={() => { void generatePlan(); }} testID="personal-route-plan-submit" colors={colors} loading={isBusy} />
      ) : (
        <PrimaryButton
          label="View my routes"
          icon="arrow-right"
          onPress={() => { if (activity) onComplete(activity.id); }}
          testID="personal-route-complete"
          colors={colors}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={step === 3 ? 'Return to my routes' : step === 0 ? 'Cancel route planning' : 'Go to previous step'}
        testID="personal-route-back"
        disabled={isBusy}
        onPress={goBack}
        style={({ pressed }) => [styles.backAction, { opacity: isBusy ? 0.4 : pressed ? 0.65 : 1 }]}
      >
        <Feather name={step === 0 || step === 3 ? 'arrow-left' : 'chevron-left'} size={16} color={colors.mutedForeground} />
        <Text style={[styles.backActionText, { color: colors.mutedForeground }]}>{step === 3 ? 'Back to my routes' : step === 0 ? 'Cancel' : 'Previous step'}</Text>
      </Pressable>
    </View>
  );

  const webTop = Platform.OS === 'web' ? 67 : 0;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="personal-route-planner-screen">
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, webTop) + 12, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 20) + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={96}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" testID="personal-route-header-back" onPress={goBack} disabled={isBusy} style={({ pressed }) => [styles.headerBack, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}>
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerWords}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>A ROUTE OF YOUR OWN</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Make a plan</Text>
          </View>
          <View style={[styles.headerMark, { backgroundColor: colors.primary + '12' }]}><Feather name="map" size={18} color={colors.primary} /></View>
        </View>
        {renderProgress()}
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{current.title}</Text>
          <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{current.hint}</Text>
        </View>
        {renderError()}
        {step === 3 ? renderResult() : (
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 6 }]}>
            {renderFormStep()}
          </View>
        )}
        {step === 2 && !error ? (
          <View style={[styles.privacyNote, { backgroundColor: colors.muted }]}>
            <Feather name="lock" size={14} color={colors.teal} />
            <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>Your personal route is private to you.</Text>
          </View>
        ) : null}
        {step === 3 ? (
          <View style={[styles.nextStepNote, { backgroundColor: colors.muted }]}>
            <Feather name="arrow-right-circle" size={17} color={colors.primary} />
            <Text style={[styles.nextStepText, { color: colors.mutedForeground }]}>Your plan is saved. You can find it in Activity → Routes whenever you’re ready.</Text>
          </View>
        ) : null}
        {renderFooter()}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  disabled = false,
  loading = false,
  onPress,
  testID,
  colors,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  testID: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: disabled || loading ? 0.48 : pressed ? 0.86 : 1 }]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name={icon} size={17} color={colors.primaryForeground} />}
      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{loading ? 'Finding a route…' : label}</Text>
      {!loading ? <Feather name="arrow-up-right" size={15} color={colors.primaryForeground} style={styles.buttonEndIcon} /> : null}
    </Pressable>
  );
}

function Metric({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 18, maxWidth: 620, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 23 },
  headerBack: { width: 44, height: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  headerWords: { flex: 1 },
  eyebrow: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1.25 },
  headerTitle: { fontSize: 23, lineHeight: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, marginTop: 1 },
  headerMark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  progressBlock: { marginBottom: 25 },
  progressTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  stepLabel: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  stepCount: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { flexDirection: 'row', gap: 5 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  sectionHeading: { marginBottom: 17 },
  sectionTitle: { fontSize: 21, lineHeight: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.35 },
  sectionHint: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 4 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  errorAction: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 3 },
  errorActionText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  formCard: { borderWidth: 1, padding: 17, overflow: 'hidden' },
  promptMark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  promptTitle: { fontSize: 18, lineHeight: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.25 },
  promptBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5, marginBottom: 22 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  goalInput: { minHeight: 126, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  destinationInput: { height: 52, borderWidth: 1, paddingHorizontal: 13, fontSize: 14, fontFamily: 'Inter_400Regular' },
  fieldHint: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 7, textAlign: 'right' },
  activityOptions: { gap: 9, marginTop: 1 },
  activityOption: { minHeight: 74, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 11 },
  activityOptionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activityOptionCopy: { flex: 1 },
  activityOptionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  activityOptionDetail: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 3 },
  radioOuter: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  locationNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 16 },
  locationNoteText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, marginTop: 12 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  footer: { marginTop: 22, gap: 12 },
  primaryButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, gap: 9 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  buttonEndIcon: { position: 'absolute', right: 17 },
  backAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  backActionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 13 },
  savedIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  savedCopy: { flex: 1 },
  savedTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  savedDetail: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 2 },
  resultCard: { borderWidth: 1, padding: 13 },
  resultHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  resultIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resultTitleWrap: { flex: 1 },
  resultTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  resultDestination: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  privatePill: { minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 13, paddingHorizontal: 8 },
  privateText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  mapFrame: { height: 224, borderWidth: 1, borderRadius: 15, overflow: 'hidden', marginBottom: 14 },
  mapTag: { position: 'absolute', right: 9, top: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  mapTagText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  mapEmptyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  mapEmptyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  mapEmptyCopy: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  goalQuote: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium', fontStyle: 'italic', marginBottom: 6 },
  planSummary: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  tipsPanel: { padding: 12, borderRadius: 12, gap: 8, marginBottom: 12 },
  tipsTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 1 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tipDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  tipText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  metricsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 2, gap: 8 },
  metric: { flex: 1 },
  metricLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  metricValue: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 4 },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, marginTop: 13 },
  disclaimerText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  nextStepNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 12, marginTop: 12 },
  nextStepText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});

export default PersonalRoutePlannerScreen;

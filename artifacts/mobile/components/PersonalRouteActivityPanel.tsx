import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { PoppinsText as Text } from '@/components/Typography';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMyPersonalActivityQueryKey,
  getListMyPersonalActivitiesQueryKey,
  useAppendMyPersonalActivityPoints,
  useDeleteMyPersonalActivity,
  useFinishMyPersonalActivity,
  useGetMyPersonalActivity,
  useListMyPersonalActivities,
  usePauseMyPersonalActivity,
  useResumeMyPersonalActivity,
  useStartMyPersonalActivity,
  type PersonalActivity,
  type PersonalActivityRoutePoint,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import ExploreMap from '@/components/ExploreMap';

type ActivityType = 'walk' | 'run' | 'cycle';
type RoutePoint = { latitude: number; longitude: number };

const TYPES: Array<{ value: ActivityType; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { value: 'walk', label: 'Walk', icon: 'navigation' },
  { value: 'run', label: 'Run', icon: 'wind' },
  { value: 'cycle', label: 'Cycle', icon: 'target' },
];
const BATCH_SIZE = 12;

function decodePolyline(encoded: string): RoutePoint[] {
  const result: RoutePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let shift = 0;
    let value = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      value |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += value & 1 ? ~(value >> 1) : value >> 1;
    shift = 0;
    value = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      value |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += value & 1 ? ~(value >> 1) : value >> 1;
    result.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return result;
}

function distanceLabel(meters?: number | null) {
  if (meters == null || !Number.isFinite(meters)) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function durationLabel(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Saved route'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function PersonalRouteActivityPanel({
  initialActivityId,
  onCreateRoute,
}: {
  initialActivityId?: number;
  onCreateRoute: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const listQuery = useListMyPersonalActivities({
    query: {
      queryKey: getListMyPersonalActivitiesQueryKey(),
      retry: false,
    },
  });
  const [selectedId, setSelectedId] = useState<number | null>(initialActivityId ?? null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  const detailQuery = useGetMyPersonalActivity(selectedId ?? 0, {
    query: { enabled: selectedId !== null, queryKey: getGetMyPersonalActivityQueryKey(selectedId ?? 0) },
  });
  const startMutation = useStartMyPersonalActivity();
  const pauseMutation = usePauseMyPersonalActivity();
  const resumeMutation = useResumeMyPersonalActivity();
  const appendMutation = useAppendMyPersonalActivityPoints();
  const finishMutation = useFinishMyPersonalActivity();
  const deleteMutation = useDeleteMyPersonalActivity();

  const [busyMessage, setBusyMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const [watching, setWatching] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const batchRef = useRef<PersonalActivityRoutePoint[]>([]);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const flushInFlight = useRef(false);
  const sequenceRef = useRef(0);
  const sequenceActivityIdRef = useRef<number | null>(null);

  const refresh = useCallback(async (id?: number) => {
    await queryClient.invalidateQueries({ queryKey: getListMyPersonalActivitiesQueryKey() });
    const target = id ?? selectedIdRef.current;
    if (target !== null) {
      await queryClient.invalidateQueries({ queryKey: getGetMyPersonalActivityQueryKey(target) });
    }
  }, [queryClient]);

  const activity = detailQuery.data;
  useEffect(() => {
    if (selectedId === null && listQuery.data?.length) {
      const active = listQuery.data.find((item) => item.status === 'recording' || item.status === 'paused');
      setSelectedId(active?.id ?? listQuery.data[0].id);
    }
  }, [listQuery.data, selectedId]);

  useEffect(() => {
    if (activity && sequenceActivityIdRef.current !== activity.id) {
      sequenceActivityIdRef.current = activity.id;
      sequenceRef.current = activity.routePoints?.at(-1)?.sequence ?? -1;
    }
  }, [activity?.id, activity?.routePoints?.length]);
  useEffect(() => {
    if (activity?.status !== 'recording') return undefined;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity?.status]);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    setWatching(false);
  }, []);
  useEffect(() => () => {
    watchRef.current?.remove();
    watchRef.current = null;
    void flushRef.current();
  }, []);

  flushRef.current = async () => {
    const currentId = selectedIdRef.current;
    if (!currentId) return false;
    if (flushInFlight.current) return false;
    if (!batchRef.current.length) return true;
    flushInFlight.current = true;
    setSavingPoints(true);
    try {
      while (batchRef.current.length) {
        const batch = batchRef.current.splice(0, BATCH_SIZE);
        try {
          await appendMutation.mutateAsync({ activityId: currentId, data: { points: batch } });
          await refresh(currentId);
        } catch {
          batchRef.current = [...batch, ...batchRef.current];
          setActionError('Your latest route points could not be saved. They are being kept here to retry.');
          return false;
        }
      }
      return true;
    } finally {
      flushInFlight.current = false;
      setSavingPoints(false);
    }
  };

  const askLocation = useCallback(async () => {
    setActionError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationDenied(true);
        setActionError('Location access is off. Allow foreground location to record your route.');
        return null;
      }
      setLocationDenied(false);
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      setActionError('Your location could not be read. Check your device settings and try again.');
      return null;
    }
  }, []);

  const beginWatch = useCallback(async (id: number) => {
    if (selectedIdRef.current !== id) return;
    stopWatch();
    try {
      watchRef.current = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 8,
      }, (position) => {
        if (selectedIdRef.current !== id) return;
        // Deliberately omit altitude and all non-route sensor data.
        sequenceRef.current += 1;
        batchRef.current.push({
          sequence: sequenceRef.current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          recordedAt: new Date(position.timestamp).toISOString(),
        });
        if (batchRef.current.length >= BATCH_SIZE) void flushRef.current();
      });
      setWatching(true);
    } catch {
      setActionError('Route recording could not start. Check location access and try again.');
    }
  }, [stopWatch]);

  const startRoute = async () => {
    if (!activity) return;
    const origin = await askLocation();
    if (!origin) return;
    setBusyMessage('Starting your record…');
    startMutation.mutate({ activityId: activity.id }, {
      onSuccess: async () => {
        setBusyMessage('');
        await refresh(activity.id);
        await beginWatch(activity.id);
      },
      onError: () => {
        setBusyMessage('');
        setActionError('This route could not be started. Please try again.');
      },
    });
  };

  const pauseRoute = () => {
    if (!activity) return;
    stopWatch();
    void flushRef.current().then((saved) => {
      if (!saved) {
        setActionError((current) => current || 'Route points are still saving. Try again in a moment.');
        void beginWatch(activity.id);
        return;
      }
      pauseMutation.mutate({ activityId: activity.id }, {
        onSuccess: () => { void refresh(activity.id); },
        onError: () => {
          setActionError('Your route could not be paused. You can keep recording or try again.');
          void beginWatch(activity.id);
        },
      });
    });
  };

  const resumeRoute = async () => {
    if (!activity) return;
    const origin = await askLocation();
    if (!origin) return;
    resumeMutation.mutate({ activityId: activity.id }, {
      onSuccess: async () => {
        await refresh(activity.id);
        await beginWatch(activity.id);
      },
      onError: () => setActionError('Your route could not resume. Please try again.'),
    });
  };

  const continueRecording = async () => {
    if (!activity) return;
    const location = await askLocation();
    if (location) await beginWatch(activity.id);
  };

  const selectSavedActivity = (id: number) => {
    if (id === selectedIdRef.current) return;
    stopWatch();
    void flushRef.current().then((saved) => {
      if (!saved) {
        setActionError('Save the pending route points before opening another route.');
        return;
      }
      setActionError('');
      setSelectedId(id);
    });
  };

  const finishRoute = () => {
    if (!activity) return;
    Alert.alert('Finish this route?', 'Your saved route and personal metrics will be kept in Activity.', [
      { text: 'Keep recording', style: 'cancel' },
      {
        text: 'Finish route',
        onPress: () => {
          stopWatch();
          void flushRef.current().then((saved) => {
            if (!saved) {
              setActionError((current) => current || 'Route points are still saving. Try again in a moment.');
              if (activity.status === 'recording') void beginWatch(activity.id);
              return;
            }
            finishMutation.mutate({ activityId: activity.id }, {
              onSuccess: () => { void refresh(activity.id); },
              onError: () => {
                setActionError('Your route could not be finished. Your saved points are still here; try again.');
                if (activity.status === 'recording') void beginWatch(activity.id);
              },
            });
          });
        },
      },
    ]);
  };

  const confirmDelete = (item: PersonalActivity) => {
    Alert.alert('Delete this personal route?', 'This permanently removes the saved route and its private route points.', [
      { text: 'Keep route', style: 'cancel' },
      {
        text: 'Delete route',
        style: 'destructive',
        onPress: () => {
          const wasSelected = selectedIdRef.current === item.id;
          if (wasSelected) stopWatch();
          deleteMutation.mutate({ activityId: item.id }, {
            onSuccess: async () => {
              if (wasSelected) {
                batchRef.current = [];
                setSelectedId(null);
              }
              await refresh(item.id);
            },
            onError: () => {
              setActionError('This route could not be deleted. Please try again.');
              if (wasSelected && item.status === 'recording') void beginWatch(item.id);
            },
          });
        },
      },
    ]);
  };

  const mapRoutePoints = useMemo(() => {
    if (!activity) return [];
    const actual = activity.routePoints?.map(({ latitude, longitude }) => ({ latitude, longitude })) ?? [];
    return actual.length > 1 ? actual : decodePolyline(activity.routePolyline ?? '');
  }, [activity]);
  const planRoutePoints = useMemo(() => decodePolyline(activity?.routePolyline ?? ''), [activity?.routePolyline]);
  const hasRoute = mapRoutePoints.length > 0;
  const liveElapsed = activity?.status === 'recording' && activity.startedAt
    ? Math.max(0, Math.floor((clockNow - new Date(activity.startedAt).getTime()) / 1000) - activity.pausedSeconds)
    : activity?.elapsedSeconds;
  const elevation = activity?.elevationProfile ?? [];
  const elevationRange = useMemo(() => {
    if (!elevation.length) return { min: 0, max: 1 };
    const values = elevation.map((point) => point.elevationMeters);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [elevation]);
  const isInitialLoading = listQuery.isLoading && !listQuery.data;
  const pending = startMutation.isPending || pauseMutation.isPending
    || resumeMutation.isPending || finishMutation.isPending || deleteMutation.isPending
    || appendMutation.isPending || savingPoints;
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const noop = () => undefined;
  const mutedCard = { backgroundColor: colors.card, borderColor: colors.border };
  const routeStatus = activity?.status === 'completed'
    ? 'Saved'
    : activity?.status === 'recording'
      ? 'Recording'
      : activity?.status === 'paused'
        ? 'Paused'
        : 'Planned';

  if (isInitialLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]} testID="personal-route-loading">
        <View style={[styles.skeletonHero, { backgroundColor: colors.muted }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.muted }]} />
        <View style={[styles.skeletonLineShort, { backgroundColor: colors.muted }]} />
        <View style={[styles.skeletonBlock, { backgroundColor: colors.muted }]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      testID="personal-route-activity-panel"
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>A ROUTE OF YOUR OWN</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Personal routes</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Start with a goal. Take it at your own pace.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plan another personal route"
            testID="personal-route-new"
            onPress={() => { setActionError(''); onCreateRoute(); }}
            style={[styles.newRouteButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Feather name="plus" size={15} color={colors.primaryForeground} />
            <Text style={[styles.newRouteText, { color: colors.primaryForeground }]}>New route</Text>
          </Pressable>
          <View style={[styles.headerMark, { backgroundColor: colors.primary + '14' }]}>
            <Feather name="map" size={20} color={colors.primary} />
          </View>
        </View>
      </View>

      <View style={[styles.privacyNote, { backgroundColor: colors.teal + '12', borderColor: colors.teal + '38' }]}>
        <Feather name="lock" size={15} color={colors.teal} />
        <Text style={[styles.privacyText, { color: colors.foreground }]}>
          Your route points stay private. Location is only requested when you choose to plan or record.
        </Text>
      </View>

      {actionError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '35' }]} accessibilityRole="alert">
          <Feather name="alert-circle" size={16} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{actionError}</Text>
          {locationDenied ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry location permission"
              testID="personal-route-location-retry"
              onPress={() => {
                void askLocation().then((location) => {
                  if (location) {
                    setActionError('');
                    setLocationDenied(false);
                  }
                });
              }}
              style={styles.retryButton}
            >
              <Text style={[styles.retryText, { color: colors.destructive }]}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {listQuery.isError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '35' }]} accessibilityRole="alert">
          <Feather name="cloud-off" size={16} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>Your personal routes could not load.</Text>
          <Pressable accessibilityRole="button" testID="personal-route-list-retry" onPress={() => { void listQuery.refetch(); }}>
            <Text style={[styles.retryText, { color: colors.destructive }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {activity ? (
        <View style={[styles.activityCard, mutedCard, { borderRadius: colors.radius + 6 }]}>
          <View style={styles.activityTop}>
            <View style={[styles.activityBadge, { backgroundColor: activity.status === 'completed' ? colors.success + '14' : colors.primary + '14' }]}>
              <Feather name={TYPES.find((item) => item.value === activity.activityType)?.icon ?? 'map'} size={15} color={activity.status === 'completed' ? colors.success : colors.primary} />
            </View>
            <View style={styles.activityTitleWrap}>
              <View style={styles.activityTitleRow}>
                <Text style={[styles.activityTitle, { color: colors.foreground }]} numberOfLines={2}>{activity.title}</Text>
                <View style={[styles.statusPill, { backgroundColor: activity.status === 'completed' ? colors.success + '14' : colors.muted }]}>
                  <Text style={[styles.statusText, { color: activity.status === 'completed' ? colors.success : colors.mutedForeground }]}>{routeStatus}</Text>
                </View>
              </View>
              <Text style={[styles.destinationLine, { color: colors.mutedForeground }]} numberOfLines={1}>{activity.destination}</Text>
            </View>
          </View>
          {detailQuery.isLoading ? (
            <View style={[styles.mapLoading, { backgroundColor: colors.muted }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.mapLoadingText, { color: colors.mutedForeground }]}>Loading your route…</Text></View>
          ) : detailQuery.isError ? (
            <View style={[styles.mapUnavailable, { backgroundColor: colors.muted }]}>
              <Feather name="map" size={22} color={colors.mutedForeground} />
              <Text style={[styles.mapUnavailableText, { color: colors.mutedForeground }]}>Route details are unavailable.</Text>
              <Pressable accessibilityRole="button" testID="personal-route-detail-retry" onPress={() => { void detailQuery.refetch(); }}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.mapFrame, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                {hasRoute ? (
                  <ExploreMap
                    apiKey={apiKey}
                    cities={[]}
                    routePoints={activity.status === 'planned' ? planRoutePoints : mapRoutePoints}
                    mode="explore"
                    selectedCity={null}
                    status="ready"
                    fullScreen={false}
                    onSelectCity={noop}
                    onExploreCity={noop}
                    onResetCity={noop}
                  />
                ) : (
                  <View style={styles.mapUnavailable}>
                    <Feather name="map-pin" size={22} color={colors.mutedForeground} />
                    <Text style={[styles.mapUnavailableText, { color: colors.mutedForeground }]}>A route preview isn’t available for this plan.</Text>
                  </View>
                )}
                <View style={[styles.mapTag, { backgroundColor: colors.card }]}>
                  <Feather name="lock" size={11} color={colors.teal} />
                  <Text style={[styles.mapTagText, { color: colors.foreground }]}>Private route</Text>
                </View>
              </View>
              <Text style={[styles.goalQuote, { color: colors.mutedForeground }]}>{activity.goal}</Text>
              {activity.planSummary ? <Text style={[styles.summaryText, { color: colors.foreground }]}>{activity.planSummary}</Text> : null}
              {activity.planTips?.length ? (
                <View style={[styles.tipsPanel, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.tipsHeading, { color: colors.foreground }]}>A few things to keep in mind</Text>
                  {activity.planTips.map((tip, index) => (
                    <View key={`${index}-${tip}`} style={styles.tipRow}>
                      <View style={[styles.tipDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.tipText, { color: colors.mutedForeground }]}>{tip}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.metricsRow}>
                <Metric label="Planned distance" value={distanceLabel(activity.plannedDistanceMeters)} colors={colors} />
                <Metric label="Time estimate" value={durationLabel(activity.plannedDurationSeconds)} colors={colors} />
                {activity.plannedAscentMeters != null ? <Metric label="Planned ascent" value={`${Math.round(activity.plannedAscentMeters)} m`} colors={colors} /> : null}
              </View>
              {activity.status === 'completed' || activity.status === 'recording' || activity.status === 'paused' ? (
                <View style={[styles.recordPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={styles.recordPanelHead}>
                    <View>
                      <Text style={[styles.recordTitle, { color: colors.foreground }]}>{activity.status === 'completed' ? 'Your effort' : 'Your route record'}</Text>
                      <Text style={[styles.recordCaption, { color: colors.mutedForeground }]}>{activity.status === 'recording' ? (watching ? 'Recording on this device. Keep this screen open.' : 'Ready to record') : activity.status === 'paused' ? 'Paused when you need a moment' : `Saved ${dateLabel(activity.endedAt ?? activity.updatedAt)}`}</Text>
                    </View>
                    {activity.status === 'recording' ? <View style={[styles.liveDot, { backgroundColor: colors.success }]} /> : null}
                  </View>
                  <View style={styles.metricsRow}>
                    <Metric label="Distance" value={distanceLabel(activity.distanceMeters)} colors={colors} strong />
                    <Metric label="Time moving" value={durationLabel(liveElapsed)} colors={colors} strong />
                    {activity.activityType === 'cycle' && activity.averageSpeedMetersPerSecond != null ? (
                      <Metric
                        label="Avg. speed"
                        value={`${(activity.averageSpeedMetersPerSecond * 3.6).toFixed(1)} km/h`}
                        colors={colors}
                        strong
                      />
                    ) : activity.averagePaceSecondsPerKm != null ? (
                      <Metric
                        label="Avg. pace"
                        value={`${Math.floor(activity.averagePaceSecondsPerKm / 60)}:${String(Math.round(activity.averagePaceSecondsPerKm % 60)).padStart(2, '0')} /km`}
                        colors={colors}
                        strong
                      />
                    ) : null}
                    {activity.totalAscentMeters != null ? <Metric label="Ascent" value={`${Math.round(activity.totalAscentMeters)} m`} colors={colors} strong /> : null}
                  </View>
                  {elevation.length ? (
                    <View style={[styles.elevationCard, { backgroundColor: colors.muted }]}>
                      <View style={styles.elevationHeading}>
                        <View>
                          <Text style={[styles.elevationTitle, { color: colors.foreground }]}>Elevation</Text>
                          <Text style={[styles.elevationSub, { color: colors.mutedForeground }]}>Provider-sourced route profile</Text>
                        </View>
                        <Text style={[styles.elevationRange, { color: colors.primary }]}>{Math.round(elevationRange.min)}–{Math.round(elevationRange.max)} m</Text>
                      </View>
                      <View style={styles.chart} accessibilityLabel="Elevation profile">
                        {elevation.slice(0, 40).map((point, index) => {
                          const range = elevationRange.max - elevationRange.min || 1;
                          const height = 8 + ((point.elevationMeters - elevationRange.min) / range) * 44;
                          return <View key={`${point.distanceMeters}-${index}`} style={[styles.chartBar, { height, backgroundColor: colors.teal }]} />;
                        })}
                      </View>
                      <View style={styles.chartLabels}>
                        <Text style={[styles.chartLabel, { color: colors.mutedForeground }]}>0 km</Text>
                        <Text style={[styles.chartLabel, { color: colors.mutedForeground }]}>{distanceLabel(activity.distanceMeters)}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {actionError && batchRef.current.length ? (
                <Pressable accessibilityRole="button" testID="personal-route-retry-batch" onPress={() => { setActionError(''); void flushRef.current(); }} style={[styles.retryBatch, { borderColor: colors.border }]}>
                  <Feather name="refresh-cw" size={14} color={colors.primary} />
                  <Text style={[styles.retryBatchText, { color: colors.primary }]}>Retry saving {batchRef.current.length} route points</Text>
                </Pressable>
              ) : null}
              <View style={styles.actionRow}>
                {activity.status === 'planned' ? (
                  <PrimaryButton label="Start recording" icon="play" disabled={pending} onPress={() => { void startRoute(); }} colors={colors} testID="personal-route-start" />
                ) : activity.status === 'recording' ? (
                  <>
                    {!watching ? <SecondaryButton label="Continue recording" icon="play" disabled={pending} onPress={() => { void continueRecording(); }} colors={colors} testID="personal-route-continue" /> : null}
                    <SecondaryButton label="Pause" icon="pause" disabled={pending} onPress={pauseRoute} colors={colors} testID="personal-route-pause" />
                    <PrimaryButton label="Finish" icon="check" disabled={pending} onPress={finishRoute} colors={colors} testID="personal-route-finish" />
                  </>
                ) : activity.status === 'paused' ? (
                  <>
                    <SecondaryButton label="Resume" icon="play" disabled={pending} onPress={() => { void resumeRoute(); }} colors={colors} testID="personal-route-resume" />
                    <PrimaryButton label="Finish" icon="check" disabled={pending} onPress={finishRoute} colors={colors} testID="personal-route-finish" />
                  </>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${activity.title}`}
                  testID="personal-route-delete"
                  onPress={() => confirmDelete(activity)}
                  style={[styles.deleteButton, { borderColor: colors.border }]}
                >
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </Pressable>
              </View>
            </>
          )}
          {busyMessage ? <Text style={[styles.busyLine, { color: colors.mutedForeground }]}>{busyMessage}</Text> : null}
        </View>
      ) : (
        <View style={[styles.emptyCard, mutedCard, { borderRadius: colors.radius + 6 }]}>
          <View style={[styles.emptyArt, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="navigation" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No route records yet</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            Plan a walk, run, or ride and keep a private record of it.
          </Text>
          <PrimaryButton label="Plan a personal route" icon="arrow-right" onPress={() => { setActionError(''); onCreateRoute(); }} colors={colors} testID="personal-route-create" />
        </View>
      )}

      {listQuery.data?.length ? (
        <View style={styles.savedSection}>
          <View style={styles.savedHeading}>
            <View>
              <Text style={[styles.savedTitle, { color: colors.foreground }]}>Saved routes</Text>
              <Text style={[styles.savedCaption, { color: colors.mutedForeground }]}>Your own record, held in Activity.</Text>
            </View>
            <Text style={[styles.savedCount, { color: colors.mutedForeground }]}>{listQuery.data.length}</Text>
          </View>
          {listQuery.data.map((item) => {
            const selected = selectedId === item.id;
            return (
              <View key={item.id} style={[styles.savedItem, { backgroundColor: selected ? colors.primary + '0b' : colors.card, borderColor: selected ? colors.primary + '55' : colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}, ${item.status}`}
                  accessibilityState={{ selected }}
                  testID={`personal-route-saved-${item.id}`}
                  onPress={() => selectSavedActivity(item.id)}
                  style={styles.savedItemButton}
                >
                  <View style={[styles.savedItemIcon, { backgroundColor: colors.muted }]}>
                    <Feather name={TYPES.find((type) => type.value === item.activityType)?.icon ?? 'map'} size={15} color={colors.primary} />
                  </View>
                  <View style={styles.savedCopy}>
                    <Text numberOfLines={1} style={[styles.savedItemTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <Text numberOfLines={1} style={[styles.savedMeta, { color: colors.mutedForeground }]}>{dateLabel(item.createdAt)} · {distanceLabel(item.distanceMeters ?? item.plannedDistanceMeters)} · {item.status === 'completed' ? 'Saved' : item.status}</Text>
                  </View>
                  <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} testID={`personal-route-delete-${item.id}`} onPress={() => confirmDelete(item)} hitSlop={10} style={styles.savedDelete}>
                  <Feather name="trash-2" size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value, colors, strong = false }: { label: string; value: string; colors: ReturnType<typeof useColors>; strong?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: colors.foreground }, strong && styles.metricValueStrong]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label, icon, onPress, colors, testID, disabled = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: disabled ? 0.58 : pressed ? 0.82 : 1, borderRadius: colors.radius }]}
    >
      {disabled ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{label}</Text>}
      {!disabled ? <Feather name={icon} size={16} color={colors.primaryForeground} /> : null}
    </Pressable>
  );
}

function SecondaryButton({
  label, icon, onPress, colors, testID, disabled = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: disabled ? 0.55 : pressed ? 0.75 : 1, borderRadius: colors.radius }]}
    >
      <Feather name={icon} size={15} color={colors.foreground} />
      <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 36, maxWidth: 760, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerCopy: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 10 },
  newRouteButton: { minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  newRouteText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  eyebrow: { fontSize: 9, letterSpacing: 1.45, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, lineHeight: 33, letterSpacing: -0.7, fontFamily: 'Inter_700Bold', marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 3 },
  headerMark: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 14 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 15 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  retryButton: { paddingVertical: 3, paddingHorizontal: 4 },
  retryText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  formCard: { borderWidth: 1, padding: 16, marginBottom: 15 },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  formIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  cardCaption: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  inputLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 7, marginTop: 5 },
  goalInput: { minHeight: 76, textAlignVertical: 'top', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 12, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginBottom: 11 },
  destinationInput: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 11 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  typeChip: { minHeight: 39, flex: 1, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  typeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  locationHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 10, marginBottom: 13 },
  locationHintText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  primaryButton: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  secondaryButton: { minHeight: 46, paddingHorizontal: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flex: 1 },
  secondaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  activityCard: { borderWidth: 1, padding: 14, marginBottom: 24 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  activityBadge: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  activityTitleWrap: { flex: 1, minWidth: 0 },
  activityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  activityTitle: { flex: 1, fontSize: 15, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  destinationLine: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  statusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 9, textTransform: 'capitalize', fontFamily: 'Inter_700Bold' },
  mapFrame: { height: 210, borderWidth: 1, borderRadius: 15, overflow: 'hidden', position: 'relative' },
  mapTag: { position: 'absolute', left: 9, top: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  mapTagText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9 },
  mapLoadingText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  mapUnavailable: { flex: 1, minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 20 },
  mapUnavailableText: { fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  goalQuote: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium', marginTop: 13 },
  summaryText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 6 },
  tipsPanel: { padding: 12, borderRadius: 12, marginTop: 13 },
  tipsHeading: { fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 5 },
  tipDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  tipText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 14 },
  metric: { flexGrow: 1, flexBasis: '20%', minWidth: 68 },
  metricValue: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  metricValueStrong: { fontSize: 17 },
  metricLabel: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_500Medium', marginTop: 3 },
  recordPanel: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 3 },
  recordPanelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recordCaption: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  elevationCard: { borderRadius: 12, padding: 11, marginBottom: 10 },
  elevationHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  elevationTitle: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  elevationSub: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 2 },
  elevationRange: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  chart: { height: 57, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 8 },
  chartBar: { flex: 1, minWidth: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, opacity: 0.8 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartLabel: { fontSize: 8, fontFamily: 'Inter_500Medium' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  deleteButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13 },
  busyLine: { textAlign: 'center', fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 8 },
  retryBatch: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  retryBatchText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  emptyCard: { borderWidth: 1, padding: 15, alignItems: 'center', marginBottom: 16 },
  emptyArt: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 14, lineHeight: 19, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  emptyCopy: { fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 12, maxWidth: 300 },
  savedSection: { marginTop: 2 },
  savedHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  savedTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  savedCaption: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  savedCount: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  savedItem: { borderWidth: 1, borderRadius: 13, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  savedItemButton: { minHeight: 63, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  savedItemIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  savedCopy: { flex: 1, minWidth: 0 },
  savedItemTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  savedMeta: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 4, textTransform: 'capitalize' },
  savedDelete: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  skeletonHero: { height: 70, borderRadius: 16, marginBottom: 15 },
  skeletonLine: { height: 46, borderRadius: 12, marginBottom: 12 },
  skeletonLineShort: { height: 16, width: '54%', borderRadius: 8, marginBottom: 18 },
  skeletonBlock: { height: 280, borderRadius: 18 },
});

export default PersonalRouteActivityPanel;

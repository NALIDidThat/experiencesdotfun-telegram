import { and, asc, count, desc, eq } from "drizzle-orm";
import { Router, type ErrorRequestHandler, type IRouter } from "express";
import { z } from "zod/v4";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  personalActivitiesTable,
  personalActivityPointsTable,
  type PersonalActivity,
  type PersonalActivityElevationPoint,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { logger } from "../lib/logger";
import {
  buildElevationProfile,
  calculateActivityMetrics,
  calculateElevationGain,
  decodePolyline,
  encodePolyline,
  samplePoints,
} from "../lib/personal-activity-metrics.mjs";

const router: IRouter = Router();
const planRequestTimes = new Map<number, number[]>();
const MAX_STORED_POINTS = 20_000;

const planInput = z.object({
  goal: z.string().trim().min(5).max(500),
  activityType: z.enum(["walk", "run", "cycle"]),
  destination: z.string().trim().min(2).max(180),
  originLatitude: z.number().min(-90).max(90),
  originLongitude: z.number().min(-180).max(180),
}).strict();

const pointInput = z.object({
  sequence: z.number().int().min(0).max(MAX_STORED_POINTS),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100_000).nullable(),
  recordedAt: z.string().datetime(),
});
const pointsInput = z.object({
  points: z.array(pointInput).min(1).max(100),
}).strict();

const generatedPlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  planSummary: z.string().trim().min(20).max(900),
  planTips: z.array(z.string().trim().min(1).max(180)).max(8),
});

function participantOnly(req: Parameters<typeof currentUser>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  if (currentUser(req).userType === "participant") return true;
  res.status(403).json({ message: "Route activities are available to participant profiles." });
  return false;
}

function parseActivityId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function withinPlanLimit(userId: number): boolean {
  const now = Date.now();
  const recent = (planRequestTimes.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 4) {
    planRequestTimes.set(userId, recent);
    return false;
  }
  recent.push(now);
  planRequestTimes.set(userId, recent);
  return true;
}

function googleMapsApiKey(): string | null {
  return process.env.Google_Maps_API?.trim() || null;
}

function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(value);
  if (!match) return null;
  const seconds = Math.round(Number(match[1]));
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

function responseProfile(row: PersonalActivity) {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    activityType: row.activityType,
    destination: row.destination,
    planSummary: row.planSummary,
    planTips: Array.isArray(row.planTips) ? row.planTips : [],
    routePolyline: row.routePolyline,
    plannedDistanceMeters: row.plannedDistanceMeters,
    plannedDurationSeconds: row.plannedDurationSeconds,
    plannedAscentMeters: row.plannedAscentMeters,
    elevationProfile: Array.isArray(row.elevationProfile) ? row.elevationProfile : [],
    status: row.status,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    pausedSeconds: row.pausedSeconds,
    endedAt: row.endedAt,
    elapsedSeconds: row.elapsedSeconds,
    distanceMeters: row.distanceMeters,
    averagePaceSecondsPerKm: row.averagePaceSecondsPerKm,
    averageSpeedMetersPerSecond: row.averageSpeedMetersPerSecond,
    totalAscentMeters: row.totalAscentMeters,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ownedActivity(activityId: number, userId: number) {
  return db.query.personalActivitiesTable.findFirst({
    where: and(
      eq(personalActivitiesTable.id, activityId),
      eq(personalActivitiesTable.userId, userId),
    ),
  });
}

async function activityDetail(activityId: number, userId: number) {
  const activity = await ownedActivity(activityId, userId);
  if (!activity) return null;
  const points = await db
    .select()
    .from(personalActivityPointsTable)
    .where(eq(personalActivityPointsTable.activityId, activityId))
    .orderBy(asc(personalActivityPointsTable.sequence));
  return {
    ...responseProfile(activity),
    routePoints: points.map((point) => ({
      sequence: point.sequence,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyMeters: point.accuracyMeters,
      recordedAt: point.recordedAt.toISOString(),
    })),
  };
}

async function computeRoute(input: z.infer<typeof planInput>, apiKey: string) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: input.originLatitude,
            longitude: input.originLongitude,
          },
        },
      },
      destination: { address: input.destination },
      travelMode: input.activityType === "cycle" ? "BICYCLE" : "WALK",
      polylineEncoding: "ENCODED_POLYLINE",
      computeAlternativeRoutes: false,
    }),
  });
  if (!response.ok) {
    logger.warn({ status: response.status }, "Google Routes API could not plan a personal activity.");
    throw new Error(response.status === 400 ? "DESTINATION_NOT_FOUND" : "ROUTE_PROVIDER_UNAVAILABLE");
  }
  const payload = await response.json() as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  };
  const route = payload.routes?.[0];
  if (
    !route ||
    typeof route.polyline?.encodedPolyline !== "string" ||
    !Number.isFinite(route.distanceMeters) ||
    Number(route.distanceMeters) <= 0
  ) {
    throw new Error("DESTINATION_NOT_FOUND");
  }
  return {
    routePolyline: route.polyline.encodedPolyline,
    distanceMeters: Math.round(Number(route.distanceMeters)),
    durationSeconds: durationSeconds(route.duration),
  };
}

async function elevationProfileForPolyline(
  routePolyline: string,
  distanceMeters: number,
  apiKey: string,
): Promise<PersonalActivityElevationPoint[]> {
  const routePoints = decodePolyline(routePolyline);
  if (routePoints.length < 2) return [];
  const url = new URL("https://maps.googleapis.com/maps/api/elevation/json");
  url.searchParams.set("path", `enc:${routePolyline}`);
  url.searchParams.set("samples", String(Math.min(128, Math.max(2, routePoints.length))));
  url.searchParams.set("key", apiKey);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn({ status: response.status }, "Google Elevation API was unavailable for a personal activity.");
      return [];
    }
    const payload = await response.json() as {
      status?: string;
      results?: Array<{
        elevation?: number;
        resolution?: number;
      }>;
    };
    if (payload.status !== "OK" || !Array.isArray(payload.results)) return [];
    const samples = payload.results.flatMap((sample) =>
      Number.isFinite(sample.elevation)
        ? [{
            elevationMeters: Number(sample.elevation),
            resolutionMeters: Number.isFinite(sample.resolution) ? Number(sample.resolution) : null,
          }]
        : [],
    );
    return buildElevationProfile(samples, distanceMeters);
  } catch {
    return [];
  }
}

async function generatePlanText(input: z.infer<typeof planInput>, route: {
  distanceMeters: number;
  durationSeconds: number | null;
  ascentMeters: number | null;
}) {
  const reply = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Create a concise, supportive personal outdoor activity plan from the user's stated goal and a route already calculated by a routing provider.",
          "Return JSON with exactly: title (string), planSummary (string), planTips (array of at most 5 short strings).",
          "Do not invent route features, terrain, safety, weather, opening hours, or facilities. The supplied route distance and duration are the only route facts.",
          "Do not make medical claims, prescribe training, or imply that this plan is a verified achievement.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          goal: input.goal,
          activityType: input.activityType,
          destination: input.destination,
          routeDistanceMeters: route.distanceMeters,
          estimatedRouteDurationSeconds: route.durationSeconds,
          providerSampledAscentMeters: route.ascentMeters,
        }),
      },
    ],
  });
  const content = reply.choices[0]?.message.content;
  if (!content) throw new Error("ACTIVITY_PLAN_UNAVAILABLE");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new Error("ACTIVITY_PLAN_UNAVAILABLE");
  }
  const parsed = generatedPlanSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error("ACTIVITY_PLAN_UNAVAILABLE");
  return {
    title: parsed.data.title,
    planSummary: parsed.data.planSummary,
    planTips: parsed.data.planTips,
  };
}

router.use("/me", requireTelegramUser);

router.post("/me/personal-activities/plan", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const user = currentUser(req);
  const parsed = planInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Add a clear activity goal, activity type, destination, and current location." });
    return;
  }
  if (!withinPlanLimit(user.id)) {
    res.status(429).json({ message: "Please wait before generating another activity plan." });
    return;
  }
  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    res.status(503).json({ message: "Route planning is unavailable because the Maps service is not configured." });
    return;
  }

  try {
    const route = await computeRoute(parsed.data, apiKey);
    const elevationProfile = await elevationProfileForPolyline(
      route.routePolyline,
      route.distanceMeters,
      apiKey,
    );
    const ascentMeters = elevationProfile.length
      ? calculateElevationGain(elevationProfile)
      : null;
    const generatedPlan = await generatePlanText(parsed.data, {
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      ascentMeters,
    });
    const [activity] = await db
      .insert(personalActivitiesTable)
      .values({
        userId: user.id,
        title: generatedPlan.title,
        goal: parsed.data.goal,
        activityType: parsed.data.activityType,
        destination: parsed.data.destination,
        planSummary: generatedPlan.planSummary,
        planTips: generatedPlan.planTips,
        routePolyline: route.routePolyline,
        plannedDistanceMeters: route.distanceMeters,
        plannedDurationSeconds: route.durationSeconds,
        plannedAscentMeters: ascentMeters,
        elevationProfile,
      })
      .returning();
    if (!activity) throw new Error("ACTIVITY_SAVE_FAILED");
    res.status(201).json(responseProfile(activity));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "DESTINATION_NOT_FOUND") {
      res.status(400).json({ message: "We couldn’t find a route to that destination. Try a more specific place." });
      return;
    }
    const safeErrorCode = code === "ROUTE_PROVIDER_UNAVAILABLE" ||
      code === "ACTIVITY_PLAN_UNAVAILABLE" ||
      code === "ACTIVITY_SAVE_FAILED"
      ? code
      : "ACTIVITY_PLAN_FAILED";
    logger.warn({ errorCode: safeErrorCode }, "A personal activity plan could not be generated.");
    res.status(503).json({
      message: code === "ROUTE_PROVIDER_UNAVAILABLE"
        ? "Route planning is temporarily unavailable. Check the Maps API setup and try again."
        : "We couldn’t generate this activity plan. Please try again.",
    });
  }
});

router.get("/me/personal-activities", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const user = currentUser(req);
  const activities = await db
    .select()
    .from(personalActivitiesTable)
    .where(eq(personalActivitiesTable.userId, user.id))
    .orderBy(desc(personalActivitiesTable.createdAt))
    .limit(50);
  res.json(activities.map(responseProfile));
});

router.get("/me/personal-activities/:activityId", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  if (!activityId) {
    res.status(400).json({ message: "This activity is invalid." });
    return;
  }
  const activity = await activityDetail(activityId, currentUser(req).id);
  if (!activity) {
    res.status(404).json({ message: "This activity was not found." });
    return;
  }
  res.json(activity);
});

router.post("/me/personal-activities/:activityId/start", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  if (!activityId) {
    res.status(400).json({ message: "This activity is invalid." });
    return;
  }
  const userId = currentUser(req).id;
  const now = new Date();
  const [activity] = await db
    .update(personalActivitiesTable)
    .set({ status: "recording", startedAt: now, updatedAt: now })
    .where(and(
      eq(personalActivitiesTable.id, activityId),
      eq(personalActivitiesTable.userId, userId),
      eq(personalActivitiesTable.status, "planned"),
    ))
    .returning();
  if (!activity) {
    const existing = await ownedActivity(activityId, userId);
    res.status(existing ? 409 : 404).json({
      message: existing ? "This activity can’t be started in its current state." : "This activity was not found.",
    });
    return;
  }
  res.json(responseProfile(activity));
});

router.post("/me/personal-activities/:activityId/pause", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  if (!activityId) {
    res.status(400).json({ message: "This activity is invalid." });
    return;
  }
  const userId = currentUser(req).id;
  const now = new Date();
  const [activity] = await db
    .update(personalActivitiesTable)
    .set({ status: "paused", pausedAt: now, updatedAt: now })
    .where(and(
      eq(personalActivitiesTable.id, activityId),
      eq(personalActivitiesTable.userId, userId),
      eq(personalActivitiesTable.status, "recording"),
    ))
    .returning();
  if (!activity) {
    const existing = await ownedActivity(activityId, userId);
    res.status(existing ? 409 : 404).json({
      message: existing ? "This activity can’t be paused in its current state." : "This activity was not found.",
    });
    return;
  }
  res.json(responseProfile(activity));
});

router.post("/me/personal-activities/:activityId/resume", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  if (!activityId) {
    res.status(400).json({ message: "This activity is invalid." });
    return;
  }
  const userId = currentUser(req).id;
  const existing = await ownedActivity(activityId, userId);
  if (!existing) {
    res.status(404).json({ message: "This activity was not found." });
    return;
  }
  if (existing.status !== "paused" || !existing.pausedAt) {
    res.status(409).json({ message: "This activity can’t be resumed in its current state." });
    return;
  }
  const now = new Date();
  const pausedSeconds = Math.max(0, Math.floor((now.getTime() - existing.pausedAt.getTime()) / 1000));
  const [activity] = await db
    .update(personalActivitiesTable)
    .set({
      status: "recording",
      pausedAt: null,
      pausedSeconds: existing.pausedSeconds + pausedSeconds,
      updatedAt: now,
    })
    .where(and(
      eq(personalActivitiesTable.id, activityId),
      eq(personalActivitiesTable.userId, userId),
      eq(personalActivitiesTable.status, "paused"),
    ))
    .returning();
  if (!activity) {
    res.status(409).json({ message: "This activity changed before it could be resumed. Refresh and try again." });
    return;
  }
  res.json(responseProfile(activity));
});

router.post("/me/personal-activities/:activityId/points", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  const parsed = pointsInput.safeParse(req.body);
  if (!activityId || !parsed.success) {
    res.status(400).json({ message: "The route points are invalid." });
    return;
  }
  for (let index = 1; index < parsed.data.points.length; index += 1) {
    if (parsed.data.points[index].sequence <= parsed.data.points[index - 1].sequence) {
      res.status(400).json({ message: "Route points must be sent in sequence." });
      return;
    }
  }
  const userId = currentUser(req).id;
  const [activity, pointCount] = await Promise.all([
    ownedActivity(activityId, userId),
    db.select({ count: count() })
      .from(personalActivityPointsTable)
      .where(eq(personalActivityPointsTable.activityId, activityId)),
  ]);
  if (!activity) {
    res.status(404).json({ message: "This activity was not found." });
    return;
  }
  if (activity.status !== "recording") {
    res.status(409).json({ message: "Route points can only be saved while the activity is recording." });
    return;
  }
  if ((pointCount[0]?.count ?? 0) + parsed.data.points.length > MAX_STORED_POINTS) {
    res.status(413).json({ message: "This activity has reached the route recording limit." });
    return;
  }
  const inserted = await db
    .insert(personalActivityPointsTable)
    .values(parsed.data.points.map((point) => ({
      activityId,
      sequence: point.sequence,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyMeters: point.accuracyMeters,
      recordedAt: new Date(point.recordedAt),
    })))
    .onConflictDoNothing()
    .returning({ sequence: personalActivityPointsTable.sequence });
  const [latest] = await db
    .select({ sequence: personalActivityPointsTable.sequence })
    .from(personalActivityPointsTable)
    .where(eq(personalActivityPointsTable.activityId, activityId))
    .orderBy(desc(personalActivityPointsTable.sequence))
    .limit(1);
  res.json({
    savedCount: inserted.length,
    lastSequence: latest?.sequence ?? -1,
  });
});

router.post("/me/personal-activities/:activityId/finish", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  if (!activityId) {
    res.status(400).json({ message: "This activity is invalid." });
    return;
  }
  const userId = currentUser(req).id;
  const existing = await ownedActivity(activityId, userId);
  if (!existing) {
    res.status(404).json({ message: "This activity was not found." });
    return;
  }
  if (existing.status === "completed") {
    res.json(await activityDetail(activityId, userId));
    return;
  }
  if (
    (existing.status !== "recording" && existing.status !== "paused") ||
    !existing.startedAt
  ) {
    res.status(409).json({ message: "This activity can’t be finished in its current state." });
    return;
  }
  const rawPoints = await db
    .select()
    .from(personalActivityPointsTable)
    .where(eq(personalActivityPointsTable.activityId, activityId))
    .orderBy(asc(personalActivityPointsTable.sequence));
  const metrics = calculateActivityMetrics(rawPoints.map((point) => ({
    sequence: point.sequence,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMeters: point.accuracyMeters,
    recordedAt: point.recordedAt.toISOString(),
  })), existing.activityType);
  if (metrics.points.length < 2 || metrics.distanceMeters < 10) {
    res.status(400).json({ message: "Keep recording until your route has at least 10 metres of accurate GPS movement." });
    return;
  }
  const endedAt = new Date();
  const currentPauseSeconds = existing.status === "paused" && existing.pausedAt
    ? Math.max(0, Math.floor((endedAt.getTime() - existing.pausedAt.getTime()) / 1000))
    : 0;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - existing.startedAt.getTime()) / 1000) -
      existing.pausedSeconds -
      currentPauseSeconds,
  );

  let elevationProfile: PersonalActivityElevationPoint[] = [];
  const apiKey = googleMapsApiKey();
  if (apiKey) {
    const sampledPoints = samplePoints(metrics.points, 128);
    if (sampledPoints.length >= 2) {
      elevationProfile = await elevationProfileForPolyline(
        encodePolyline(sampledPoints),
        metrics.distanceMeters,
        apiKey,
      );
    }
  }
  const totalAscentMeters = elevationProfile.length
    ? calculateElevationGain(elevationProfile)
    : null;
  const averagePaceSecondsPerKm = existing.activityType === "cycle" || metrics.distanceMeters <= 0
    ? null
    : Math.round(elapsedSeconds / (metrics.distanceMeters / 1000));
  const [completed] = await db
    .update(personalActivitiesTable)
    .set({
      status: "completed",
      endedAt,
      elapsedSeconds,
      distanceMeters: metrics.distanceMeters,
      averagePaceSecondsPerKm,
      averageSpeedMetersPerSecond: elapsedSeconds > 0
        ? Math.round((metrics.distanceMeters / elapsedSeconds) * 1000) / 1000
        : null,
      totalAscentMeters,
      elevationProfile,
      updatedAt: endedAt,
    })
    .where(and(
      eq(personalActivitiesTable.id, activityId),
      eq(personalActivitiesTable.userId, userId),
      eq(personalActivitiesTable.status, existing.status),
    ))
    .returning();
  if (!completed) {
    res.status(409).json({ message: "This activity changed before it could be finished. Refresh and try again." });
    return;
  }
  res.json(await activityDetail(activityId, userId));
});

router.delete("/me/personal-activities/:activityId", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const activityId = parseActivityId(req.params.activityId);
  if (!activityId) {
    res.status(400).json({ message: "This activity is invalid." });
    return;
  }
  const deleted = await db
    .delete(personalActivitiesTable)
    .where(and(
      eq(personalActivitiesTable.id, activityId),
      eq(personalActivitiesTable.userId, currentUser(req).id),
    ))
    .returning({ id: personalActivitiesTable.id });
  if (!deleted.length) {
    res.status(404).json({ message: "This activity was not found." });
    return;
  }
  res.status(204).end();
});

const handlePersonalActivityError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const errorType = error instanceof Error ? error.name : typeof error;
  logger.error({ errorType }, "A personal activity request failed.");
  res.status(503).json({ message: "Personal routes are temporarily unavailable. Please try again." });
};

router.use(handlePersonalActivityError);

export default router;

import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  useCreateAccountabilityCheckIn,
  useCreateAccountabilityCommitment,
  useCreateAccountabilityGoal,
  useUpdateAccountabilityGoal,
  type AccountabilityDashboard,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Goal = AccountabilityDashboard["goals"][number];
type Commitment = AccountabilityDashboard["commitments"][number];
type FeedbackTone = "success" | "error";

function messageFromError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function AccountabilityGoalsPanel({
  goals,
  commitments,
  userId,
  activePartnerName,
  onRefresh,
  onFeedback,
}: {
  goals: Goal[];
  commitments: Commitment[];
  userId: number;
  activePartnerName: string | null;
  onRefresh: () => void;
  onFeedback: (message: string, tone: FeedbackTone) => void;
}) {
  const colors = useColors();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const [addingCommitmentToGoalId, setAddingCommitmentToGoalId] = useState<number | null>(null);
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentTarget, setCommitmentTarget] = useState("1");

  const createGoal = useCreateAccountabilityGoal();
  const updateGoal = useUpdateAccountabilityGoal();
  const createCommitment = useCreateAccountabilityCommitment();
  const createCheckIn = useCreateAccountabilityCheckIn();

  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: colors.radius + 2,
    borderWidth: 1,
  } as const;
  const quietButton = {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: colors.radius - 4,
    borderWidth: 1,
  } as const;
  const primaryButton = {
    backgroundColor: colors.primary,
    borderRadius: colors.radius - 4,
  } as const;

  const runAction = async (
    action: () => Promise<unknown>,
    success: string,
    fallback: string,
  ) => {
    try {
      await action();
      onFeedback(success, "success");
      onRefresh();
      return true;
    } catch (error) {
      onFeedback(messageFromError(error, fallback), "error");
      return false;
    }
  };

  const openNewGoalForm = () => {
    setEditingGoalId(null);
    setTitle("");
    setDescription("");
    setTargetDate("");
    setVisibility("private");
    setFormOpen(true);
  };

  const openEditGoalForm = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setTitle(goal.title);
    setDescription(goal.description ?? "");
    setTargetDate(goal.targetDate ?? "");
    setFormOpen(true);
  };

  const saveGoal = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      onFeedback("Add a short title for the goal.", "error");
      return;
    }
    const normalizedDate = targetDate.trim();
    if (normalizedDate) {
      const parsed = new Date(`${normalizedDate}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalizedDate) {
        onFeedback("Enter the target date as YYYY-MM-DD.", "error");
        return;
      }
    }

    const details = {
      title: normalizedTitle,
      description: description.trim() || null,
      targetDate: normalizedDate || null,
    };
    const saving = editingGoalId
      ? () => updateGoal.mutateAsync({ goalId: editingGoalId, data: details })
      : () => createGoal.mutateAsync({ data: { ...details, visibility } });
    void runAction(
      saving,
      editingGoalId
        ? "Goal updated."
        : visibility === "shared"
          ? "Goal shared with your partner."
          : "Private goal created.",
      "That goal could not be saved. Please try again.",
    ).then((saved) => {
      if (!saved) return;
      setFormOpen(false);
      setEditingGoalId(null);
      setTitle("");
      setDescription("");
      setTargetDate("");
      setVisibility("private");
      Keyboard.dismiss();
    });
  };

  const updateStatus = (goalId: number, status: "active" | "completed" | "archived") => {
    void runAction(
      () => updateGoal.mutateAsync({ goalId, data: { status } }),
      status === "completed"
        ? "Goal marked complete."
        : status === "archived"
          ? "Goal archived."
          : "Goal reopened.",
      "That goal could not be updated. Please try again.",
    );
  };

  const addCommitment = (goalId: number) => {
    const normalizedTitle = commitmentTitle.trim();
    const targetValue = Number(commitmentTarget);
    if (!normalizedTitle) {
      onFeedback("Name the next measurable step.", "error");
      return;
    }
    if (!Number.isInteger(targetValue) || targetValue < 1 || targetValue > 100) {
      onFeedback("Set a target between 1 and 100.", "error");
      return;
    }
    const goal = goals.find((item) => item.id === goalId);
    void runAction(
      () => createCommitment.mutateAsync({
        data: {
          title: normalizedTitle,
          assignedUserId: userId,
          goalId,
          targetValue,
          deadline: goal?.targetDate ?? undefined,
        },
      }),
      goal?.sharedWithActivePartner
        ? "Commitment added to the shared goal."
        : "Personal commitment added.",
      "That commitment could not be saved. Please try again.",
    ).then((saved) => {
      if (!saved) return;
      setCommitmentTitle("");
      setCommitmentTarget("1");
      setAddingCommitmentToGoalId(null);
      Keyboard.dismiss();
    });
  };

  const checkIn = (commitment: Commitment) => {
    void runAction(
      () => createCheckIn.mutateAsync({
        commitmentId: commitment.id,
        data: { status: "completed" },
      }),
      commitment.scope === "shared"
        ? "Check-in shared with your partner. Manual check-ins do not award XP."
        : "Private check-in saved. Manual check-ins do not award XP.",
      "That check-in could not be saved. Please try again.",
    );
  };

  const goalStatusColor = (goal: Goal) => (
    goal.status === "completed"
      ? colors.success
      : goal.status === "archived"
        ? colors.mutedForeground
        : colors.teal
  );

  const standaloneCommitments = commitments.filter(
    (commitment) => commitment.scope === "personal" && commitment.goalId === null,
  );

  return (
    <View testID="accountability-goals-panel" style={[cardStyle, { gap: 14, padding: 16 }]}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <View style={{ alignItems: "center", backgroundColor: colors.teal + "16", borderRadius: 11, height: 34, justifyContent: "center", width: 34 }}>
          <Feather name="target" size={17} color={colors.teal} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>Your goals</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            Goals stay private unless you choose to share one.
          </Text>
        </View>
        <Pressable
          testID="accountability-create-goal"
          accessibilityRole="button"
          accessibilityLabel={formOpen ? "Close goal form" : "Create a goal"}
          onPress={() => (formOpen ? setFormOpen(false) : openNewGoalForm())}
          style={({ pressed }) => [
            primaryButton,
            { alignItems: "center", flexDirection: "row", gap: 5, opacity: pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 8 },
          ]}
        >
          <Feather name={formOpen ? "x" : "plus"} size={13} color={colors.primaryForeground} />
          <Text style={{ color: colors.primaryForeground, fontSize: 11, fontWeight: "700" }}>
            {formOpen ? "Close" : "New goal"}
          </Text>
        </Pressable>
      </View>

      {formOpen ? (
        <View style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 9, padding: 12 }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>
            {editingGoalId ? "Edit goal" : "Set a goal"}
          </Text>
          <TextInput
            testID="accountability-goal-title"
            accessibilityLabel="Goal title"
            maxLength={120}
            onChangeText={setTitle}
            placeholder="What do you want to achieve?"
            placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 14, minHeight: 43, paddingHorizontal: 10 }}
            value={title}
          />
          <TextInput
            accessibilityLabel="Goal details"
            maxLength={500}
            multiline
            onChangeText={setDescription}
            placeholder="Add context or why it matters (optional)"
            placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 13, minHeight: 64, paddingHorizontal: 10, paddingTop: 10, textAlignVertical: "top" }}
            value={description}
          />
          <TextInput
            accessibilityLabel="Goal target date in YYYY-MM-DD format"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={setTargetDate}
            placeholder="Target date YYYY-MM-DD (optional)"
            placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 13, minHeight: 42, paddingHorizontal: 10 }}
            value={targetDate}
          />
          {!editingGoalId && activePartnerName ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: visibility === "shared" }}
              onPress={() => setVisibility((current) => current === "private" ? "shared" : "private")}
              style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 4 }}
            >
              <Feather
                name={visibility === "shared" ? "check-square" : "square"}
                size={17}
                color={visibility === "shared" ? colors.primary : colors.mutedForeground}
              />
              <Text style={{ color: colors.foreground, flex: 1, fontSize: 12 }}>
                Share this goal with {activePartnerName}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              {editingGoalId
                ? "Goal privacy cannot be changed while editing."
                : "This goal is private to your profile."}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFormOpen(false);
                setEditingGoalId(null);
              }}
              style={[quietButton, { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 42 }]}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="accountability-save-goal"
              accessibilityRole="button"
              disabled={createGoal.isPending || updateGoal.isPending}
              onPress={saveGoal}
              style={({ pressed }) => [
                primaryButton,
                { alignItems: "center", flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 42, opacity: createGoal.isPending || updateGoal.isPending ? 0.55 : pressed ? 0.8 : 1 },
              ]}
            >
              {createGoal.isPending || updateGoal.isPending
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <Feather name="check" size={14} color={colors.primaryForeground} />}
              <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "700" }}>
                {editingGoalId ? "Save changes" : "Save goal"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {goals.length ? goals.map((goal) => {
        const goalCommitments = commitments.filter((commitment) => commitment.goalId === goal.id);
        const doneSteps = goalCommitments.filter((commitment) => commitment.status === "completed").length;
        const canAddStep = goal.status === "active"
          && (goal.visibility === "private" || goal.sharedWithActivePartner);
        const statusColor = goalStatusColor(goal);
        return (
          <View
            key={goal.id}
            testID={`accountability-goal-${goal.id}`}
            style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 11, padding: 12 }}
          >
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", lineHeight: 19 }}>
                  {goal.title}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                  {goal.sharedWithActivePartner
                    ? activePartnerName
                      ? `Shared with ${goal.owner.id === userId ? activePartnerName : goal.owner.name}`
                      : "Shared with active partner"
                    : goal.visibility === "shared"
                      ? "Previously shared"
                      : "Private"}
                  {goal.targetDate ? ` · Target ${goal.targetDate}` : ""}
                  {goal.owner.id !== userId ? ` · Set by ${goal.owner.name}` : ""}
                </Text>
              </View>
              <View style={{ backgroundColor: statusColor + "16", borderRadius: 16, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ color: statusColor, fontSize: 10, fontWeight: "700", textTransform: "capitalize" }}>
                  {goal.status}
                </Text>
              </View>
            </View>

            {goal.description ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                {goal.description}
              </Text>
            ) : null}

            {goalCommitments.length ? (
              <View style={{ borderColor: colors.border, borderTopWidth: 1, gap: 9, paddingTop: 10 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  Measurable steps · {doneSteps}/{goalCommitments.length} complete
                </Text>
                {goalCommitments.map((commitment) => {
                  const progress = Math.min(100, Math.round((commitment.currentValue / commitment.targetValue) * 100));
                  const assignedToUser = commitment.assignedTo.id === userId;
                  return (
                    <View key={commitment.id} style={{ backgroundColor: colors.card, borderRadius: colors.radius - 5, gap: 6, padding: 9 }}>
                      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                        <Text numberOfLines={2} style={{ color: colors.foreground, flex: 1, fontSize: 12, fontWeight: "600" }}>
                          {commitment.title}
                        </Text>
                        <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700" }}>
                          {commitment.currentValue}/{commitment.targetValue}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: colors.border, borderRadius: 4, height: 5, overflow: "hidden" }}>
                        <View style={{ backgroundColor: statusColor, borderRadius: 4, height: 5, width: `${progress}%` }} />
                      </View>
                      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                          {assignedToUser ? "For you" : `For ${commitment.assignedTo.name}`}
                          {commitment.latestCheckIn ? ` · Latest: ${commitment.latestCheckIn.status}` : ""}
                        </Text>
                        {commitment.status === "active" && assignedToUser ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Record a completed check-in for ${commitment.title}`}
                            disabled={createCheckIn.isPending}
                            onPress={() => checkIn(commitment)}
                            style={({ pressed }) => [
                              quietButton,
                              { alignItems: "center", flexDirection: "row", gap: 5, opacity: createCheckIn.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 8, paddingVertical: 6 },
                            ]}
                          >
                            {createCheckIn.isPending
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : <Feather name="check" size={12} color={colors.primary} />}
                            <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "700" }}>I did it</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                No measurable steps yet. Add a commitment to make progress trackable.
              </Text>
            )}

            {addingCommitmentToGoalId === goal.id ? (
              <View style={{ backgroundColor: colors.card, borderRadius: colors.radius - 4, gap: 8, padding: 10 }}>
                <TextInput
                  testID={`accountability-goal-step-title-${goal.id}`}
                  accessibilityLabel={`Commitment for ${goal.title}`}
                  maxLength={120}
                  onChangeText={setCommitmentTitle}
                  placeholder="Name a measurable step"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 13, minHeight: 41, paddingHorizontal: 10 }}
                  value={commitmentTitle}
                />
                <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                  <Text style={{ color: colors.mutedForeground, flex: 1, fontSize: 11 }}>
                    Number of completed check-ins
                  </Text>
                  <TextInput
                    accessibilityLabel="Target number of check-ins"
                    keyboardType="number-pad"
                    maxLength={3}
                    onChangeText={setCommitmentTarget}
                    style={{ backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 13, minHeight: 38, minWidth: 62, paddingHorizontal: 8, textAlign: "center" }}
                    value={commitmentTarget}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAddingCommitmentToGoalId(null)}
                    style={[quietButton, { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 39 }]}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "600" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={createCommitment.isPending}
                    onPress={() => addCommitment(goal.id)}
                    style={({ pressed }) => [
                      primaryButton,
                      { alignItems: "center", flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 39, opacity: createCommitment.isPending ? 0.55 : pressed ? 0.8 : 1 },
                    ]}
                  >
                    {createCommitment.isPending
                      ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                      : <Feather name="plus" size={13} color={colors.primaryForeground} />}
                    <Text style={{ color: colors.primaryForeground, fontSize: 11, fontWeight: "700" }}>Add step</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {canAddStep ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAddingCommitmentToGoalId(goal.id);
                    setCommitmentTitle("");
                    setCommitmentTarget("1");
                  }}
                  style={({ pressed }) => [
                    quietButton,
                    { alignItems: "center", flexDirection: "row", gap: 5, opacity: pressed ? 0.8 : 1, paddingHorizontal: 9, paddingVertical: 7 },
                  ]}
                >
                  <Feather name="plus" size={12} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "600" }}>Add a step</Text>
                </Pressable>
              ) : null}
              {goal.canEdit && goal.status === "active" ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openEditGoalForm(goal)}
                    style={({ pressed }) => [
                      quietButton,
                      { alignItems: "center", flexDirection: "row", gap: 5, opacity: pressed ? 0.8 : 1, paddingHorizontal: 9, paddingVertical: 7 },
                    ]}
                  >
                    <Feather name="edit-2" size={11} color={colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "600" }}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={updateGoal.isPending}
                    onPress={() => updateStatus(goal.id, "completed")}
                    style={({ pressed }) => [
                      quietButton,
                      { alignItems: "center", flexDirection: "row", gap: 5, opacity: updateGoal.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 9, paddingVertical: 7 },
                    ]}
                  >
                    <Feather name="check-circle" size={11} color={colors.success} />
                    <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "600" }}>Complete</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={updateGoal.isPending}
                    onPress={() => updateStatus(goal.id, "archived")}
                    style={({ pressed }) => [
                      quietButton,
                      { alignItems: "center", flexDirection: "row", gap: 5, opacity: updateGoal.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 9, paddingVertical: 7 },
                    ]}
                  >
                    <Feather name="archive" size={11} color={colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "600" }}>Archive</Text>
                  </Pressable>
                </>
              ) : goal.canEdit && goal.status !== "active" ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={updateGoal.isPending}
                  onPress={() => updateStatus(goal.id, "active")}
                  style={({ pressed }) => [
                    quietButton,
                    { alignItems: "center", flexDirection: "row", gap: 5, opacity: updateGoal.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 9, paddingVertical: 7 },
                  ]}
                >
                  <Feather name="rotate-ccw" size={11} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "600" }}>Restore</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }) : (
        <View style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 6, padding: 15 }}>
          <Feather name="flag" size={18} color={colors.teal} />
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>No goals yet</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, textAlign: "center" }}>
            Start with a goal. Add measurable commitments when you’re ready.
          </Text>
        </View>
      )}

      {standaloneCommitments.length ? (
        <View style={{ borderColor: colors.border, borderTopWidth: 1, gap: 9, paddingTop: 12 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>
            Personal commitments
          </Text>
          {standaloneCommitments.map((commitment) => (
            <View key={commitment.id} style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, flexDirection: "row", gap: 8, padding: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{commitment.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                  {commitment.currentValue}/{commitment.targetValue} complete
                </Text>
              </View>
              {commitment.status === "active" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Record a completed check-in for ${commitment.title}`}
                  disabled={createCheckIn.isPending}
                  onPress={() => checkIn(commitment)}
                  style={({ pressed }) => [
                    quietButton,
                    { alignItems: "center", flexDirection: "row", gap: 5, opacity: createCheckIn.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 8, paddingVertical: 7 },
                  ]}
                >
                  <Feather name="check" size={12} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "700" }}>I did it</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

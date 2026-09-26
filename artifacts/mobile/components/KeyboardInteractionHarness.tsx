import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

const fields = [
  "Display name",
  "Email address",
  "Password",
  "Confirm password",
  "Username",
  "City",
  "Short bio",
  "Additional notes",
] as const;

export function KeyboardInteractionHarness() {
  const colors = useColors();
  const [values, setValues] = useState<string[]>(() => fields.map(() => ""));
  const [focusedField, setFocusedField] = useState<string | null>(null);

  return (
    <View
      testID="keyboard-test-screen"
      style={{ backgroundColor: colors.background, flex: 1, minHeight: 0 }}
    >
      <View style={{ gap: 5, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 21, fontWeight: "700" }}>
          Keyboard scroll test
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
          Development-only long form for checking focus and scrolling at a reduced viewport.
        </Text>
        <Text testID="keyboard-test-focused-field" style={{ color: colors.primary, fontSize: 12 }}>
          Focused: {focusedField ?? "none"}
        </Text>
      </View>
      <KeyboardAwareScrollViewCompat
        testID="keyboard-test-scroll"
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ gap: 15, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator
      >
        {fields.map((field, index) => (
          <View key={field} style={{ gap: 6 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
              {field}
            </Text>
            <TextInput
              testID={`keyboard-test-input-${index}`}
              accessibilityLabel={field}
              value={values[index]}
              onChangeText={(value) => {
                setValues((current) => current.map((existing, currentIndex) =>
                  currentIndex === index ? value : existing,
                ));
              }}
              onFocus={() => setFocusedField(field)}
              onBlur={() => setFocusedField((current) => current === field ? null : current)}
              placeholder={`Enter ${field.toLowerCase()}`}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={field.toLowerCase().includes("password")}
              style={{
                backgroundColor: colors.card,
                borderColor: colors.input,
                borderRadius: colors.radius,
                borderWidth: 1,
                color: colors.foreground,
                fontSize: 15,
                minHeight: 52,
                paddingHorizontal: 13,
              }}
            />
          </View>
        ))}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
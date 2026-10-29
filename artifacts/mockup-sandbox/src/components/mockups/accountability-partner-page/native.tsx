import React from "react";
export type ViewStyle = React.CSSProperties; export type TextStyle = React.CSSProperties; export type StyleProp<T> = T | T[] | null | undefined | false;
export type NativeStyle = Record<string, unknown> | NativeStyle[] | null | undefined | false;
const flattenStyle = (style: NativeStyle): Record<string, unknown> => {
  const source = Array.isArray(style)
    ? style.reduce<Record<string, unknown>>((result, item) => ({ ...result, ...flattenStyle(item) }), {})
    : style && typeof style === "object"
      ? style as Record<string, unknown>
      : {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value == null || key === "includeFontPadding" || key === "elevation" || key.startsWith("shadow")) continue;
    if (key === "paddingHorizontal" || key === "marginHorizontal") {
      const prefix = key.startsWith("padding") ? "padding" : "margin";
      result[`${prefix}Left`] = value;
      result[`${prefix}Right`] = value;
      continue;
    }
    if (key === "paddingVertical" || key === "marginVertical") {
      const prefix = key.startsWith("padding") ? "padding" : "margin";
      result[`${prefix}Top`] = value;
      result[`${prefix}Bottom`] = value;
      continue;
    }
    if (key === "lineHeight" && typeof value === "number") {
      result.lineHeight = `${value}px`;
      continue;
    }
    if (key === "textAlignVertical") {
      result.verticalAlign = value === "top" ? "top" : value === "bottom" ? "bottom" : "middle";
      continue;
    }
    result[key] = value;
  }
  return result;
};
const domProps = (props: Record<string, any>) => {
  const {
    testID, accessibilityRole, accessibilityLabel, accessibilityHint, accessibilityState,
    hitSlop, keyboardShouldPersistTaps, keyboardDismissMode, bottomOffset,
    showsVerticalScrollIndicator, contentContainerStyle, nativeID, ...rest
  } = props;
  return {
    ...rest,
    ...(testID ? { "data-testid": testID } : {}),
    ...(nativeID ? { id: nativeID } : {}),
    ...(accessibilityRole ? { role: accessibilityRole } : {}),
    ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
    ...(accessibilityHint ? { title: accessibilityHint } : {}),
    ...(accessibilityState?.disabled !== undefined ? { "aria-disabled": accessibilityState.disabled } : {}),
    ...(accessibilityState?.checked !== undefined ? { "aria-checked": accessibilityState.checked } : {}),
  };
};
export function View({ children, style, ...props }: any) { return <div {...domProps(props)} style={{ display: "flex", flexDirection: "column", ...flattenStyle(style) }}>{children}</div>; }
export function Text({ children, style, numberOfLines, ...props }: any) { return <div {...domProps(props)} style={{ display: "block", ...flattenStyle(style), ...(numberOfLines ? { overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: numberOfLines } : {}) }}>{children}</div>; }
export function Pressable({ children, style, onPress, disabled, ...props }: { children?: React.ReactNode; style?: NativeStyle | ((state: { pressed: boolean }) => NativeStyle); onPress?: () => void; disabled?: boolean; [key: string]: any }) { const resolvedStyle = typeof style === "function" ? style({ pressed: false }) : style; return <button {...domProps(props)} type="button" disabled={disabled} onClick={onPress} style={{ appearance: "none", border: 0, padding: 0, backgroundColor: "transparent", cursor: disabled ? "default" : "pointer", font: "inherit", color: "inherit", textAlign: "inherit", ...flattenStyle(resolvedStyle) }}>{children}</button>; }
export function TextInput({ style, onChangeText, multiline, ...props }: any) { const inputStyle = { font: "inherit", ...flattenStyle(style) }; const common = { ...domProps(props), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeText?.(event.currentTarget.value), style: inputStyle }; return multiline ? <textarea {...common} /> : <input {...common} />; }
export function ActivityIndicator({ size = "small", color }: { size?: "small" | "large"; color?: string }) { const dimension = size === "large" ? 26 : 16; return <span aria-label="Loading" style={{ width: dimension, height: dimension, border: "2px solid " + (color ?? "currentColor") + "33", borderTopColor: color, borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />; }
export function ScrollView({ children, style, contentContainerStyle, ...props }: any) { return <div {...domProps(props)} style={{ overflowY: "auto", minHeight: 0, ...flattenStyle(style) }}><div style={{ display: "flex", flexDirection: "column", ...flattenStyle(contentContainerStyle) }}>{children}</div></div>; }
export const Image = ({ source, style, ...props }: any) => <img {...domProps(props)} src={source?.uri} style={{ objectFit: "cover", ...flattenStyle(style) }} />;
export const StyleSheet = { create: <T extends Record<string, unknown>>(styles: T) => styles, absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } };
export const Keyboard = { dismiss: () => {} }; export const Linking = { openURL: async (_url: string) => {} }; export const Platform: { OS: string } = { OS: "web" }; export const Share = { share: async (_content: { message?: string; url?: string; title?: string }) => ({ action: "sharedAction" }) };

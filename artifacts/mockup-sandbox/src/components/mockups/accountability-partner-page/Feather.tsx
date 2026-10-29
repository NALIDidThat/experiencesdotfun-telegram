import React from "react";
const featherGlyphMap = {
  "arrow-left": 61712,
  "refresh-cw": 61896,
  "users": 61962,
  "search": 61904,
  "clock": 61753,
  "arrow-down-left": 61710,
  "user-plus": 61960,
  "share-2": 61909,
  "at-sign": 61720,
  "user-check": 61958,
  "check-circle": 61740,
  "heart": 61825,
  "eye-off": 61796,
  "arrow-right": 61714,
  "send": 61905,
  "chevron-down": 61742,
  "bar-chart-2": 61723,
  "calendar": 61735,
  "check": 61739,
  "message-circle": 61853,
  "plus": 61888,
  "clipboard": 61752,
  "edit-3": 61793,
  "activity": 61696,
  "bell": 61726,
  "user-x": 61961,
  "alert-circle": 61698,
  "user": 61957,
  "square": 61924,
  "check-square": 61741,
  "target": 61933,
  "x": 61974
} as const;
export function Feather({ name, size = 16, color = "currentColor", style }: { name: string; size?: number; color?: string; style?: React.CSSProperties }) {
  const glyph = featherGlyphMap[name as keyof typeof featherGlyphMap] ?? featherGlyphMap.check;
  return <span aria-hidden="true" style={{ color, fontFamily: "accountability-feather", fontSize: size, fontStyle: "normal", fontWeight: "normal", lineHeight: 1, display: "inline-block", flexShrink: 0, ...style }}>{String.fromCharCode(glyph)}</span>;
}
export namespace Feather { export const glyphMap = featherGlyphMap; }

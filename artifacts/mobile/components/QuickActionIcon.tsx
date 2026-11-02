import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

export type QuickActionArtwork =
  | "assistant"
  | "learning"
  | "memory-game"
  | "challenges"
  | "accountability"
  | "post"
  | "create"
  | "telegram-communities"
  | "fund"
  | "progress";

type QuickActionIconProps = {
  name: QuickActionArtwork;
  primary: string;
  secondary: string;
  accent: string;
  highlight: string;
};

function Artwork({ name }: { name: QuickActionArtwork }) {
  switch (name) {
    case "assistant":
      return (
        <G>
          <Path d="M13 17h21a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-9l-6 4v-4h-6a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5Z" fill="url(#qa-side)" transform="translate(2 1)" />
          <Path d="M13 15h21a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-9l-6 4v-4h-6a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5Z" fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1.2} />
          <Path d="M15 22h14M15 27h9" stroke="#fff" strokeLinecap="round" strokeOpacity={0.94} strokeWidth={2} />
          <Path d="m35 7 1.4 3.6L40 12l-3.6 1.4L35 17l-1.4-3.6L30 12l3.6-1.4L35 7Z" fill="url(#qa-accent)" />
        </G>
      );
    case "learning":
      return (
        <G>
          <Path d="m24 36-12 4a3 3 0 0 1-4-3V15a4 4 0 0 1 3-4l13-3 13 3a4 4 0 0 1 3 4v22a3 3 0 0 1-4 3l-12-4Z" fill="url(#qa-side)" transform="translate(0 1)" />
          <Path d="M24 34 11 38a2 2 0 0 1-3-2V15a4 4 0 0 1 3-4l13-3v26Z" fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.7} strokeWidth={1} />
          <Path d="m24 34 13 4a2 2 0 0 0 3-2V15a4 4 0 0 0-3-4L24 8v26Z" fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.65} strokeWidth={1} />
          <Path d="M12 16l8-2M12 21l8-2M28 14l8 2M28 19l8 2" stroke="#fff" strokeLinecap="round" strokeOpacity={0.9} strokeWidth={1.7} />
          <Path d="M24 11v22" stroke="#fff" strokeOpacity={0.85} strokeWidth={1.5} />
        </G>
      );
    case "memory-game":
      return (
        <G>
          <Rect x={9} y={9} width={13} height={13} rx={3} fill="url(#qa-side)" transform="translate(1 2)" />
          <Rect x={26} y={9} width={13} height={13} rx={3} fill="url(#qa-side)" transform="translate(1 2)" />
          <Rect x={9} y={26} width={13} height={13} rx={3} fill="url(#qa-side)" transform="translate(1 2)" />
          <Rect x={26} y={26} width={13} height={13} rx={3} fill="url(#qa-side)" transform="translate(1 2)" />
          <Rect x={9} y={8} width={13} height={13} rx={3} fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Rect x={26} y={8} width={13} height={13} rx={3} fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Rect x={9} y={25} width={13} height={13} rx={3} fill="url(#qa-secondary)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Rect x={26} y={25} width={13} height={13} rx={3} fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Path d="m15.5 11 2.2 2.6-2.2 2.6-2.2-2.6 2.2-2.6ZM32.5 28l2.2 2.6-2.2 2.6-2.2-2.6 2.2-2.6Z" fill="#fff" fillOpacity={0.94} />
        </G>
      );
    case "challenges":
      return (
        <G>
          <Path d="M10 37c.5-5.5 4.6-9 10-9s9.5 3.5 10 9H10Z" fill="url(#qa-secondary)" transform="translate(1 2)" />
          <Path d="M26 37c.4-5 3.3-8 7.5-8 3.4 0 5.6 2 6.5 6.5V37H26Z" fill="url(#qa-accent)" transform="translate(1 2)" />
          <Circle cx={20} cy={18} r={6.2} fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1} />
          <Circle cx={33.5} cy={20} r={4.8} fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1} />
          <Path d="M9 37c.5-5.5 4.6-9 10-9s9.5 3.5 10 9H9ZM25 37c.4-5 3.3-8 7.5-8 3.4 0 5.6 2 6.5 6.5V37H25Z" fill="url(#qa-secondary)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Path d="M16 16c1-2 3-3 5-3M31 18c.7-1.3 1.8-2 3.2-2" fill="none" stroke="#fff" strokeLinecap="round" strokeOpacity={0.9} strokeWidth={1.5} />
        </G>
      );
    case "accountability":
      return (
        <G>
          <Ellipse cx={24} cy={27} rx={15} ry={12} fill="url(#qa-side)" transform="translate(1 2)" />
          <Ellipse cx={24} cy={25} rx={15} ry={12} fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} />
          <Ellipse cx={24} cy={25} rx={10} ry={8} fill="url(#qa-secondary)" stroke="#fff" strokeOpacity={0.78} strokeWidth={1} />
          <Ellipse cx={24} cy={25} rx={5} ry={4} fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.9} strokeWidth={1} />
          <Path d="m22 25 1.7 1.7L28 21" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <Path d="M11 12c3-3 7-5 12-5" fill="none" stroke="#fff" strokeLinecap="round" strokeOpacity={0.8} strokeWidth={1.5} />
        </G>
      );
    case "post":
      return (
        <G>
          <Path d="M14 8h15l8 8v19a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z" fill="url(#qa-side)" transform="translate(1 2)" />
          <Path d="M14 7h14l8 8v19a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z" fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} />
          <Path d="M28 7v8h8" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.9} strokeWidth={1.6} />
          <Path d="M16 22h10M16 27h8" stroke="#fff" strokeLinecap="round" strokeOpacity={0.88} strokeWidth={1.7} />
          <Path d="m28 32 8-8 3 3-8 8-4 1 1-4Z" fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.8} strokeWidth={0.8} />
        </G>
      );
    case "create":
      return (
        <G>
          <Path d="M11 14h26a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3Z" fill="url(#qa-side)" transform="translate(1 2)" />
          <Rect x={8} y={12} width={32} height={27} rx={4} fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} />
          <Path d="M8 20h32" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.5} />
          <Path d="M16 9v7M32 9v7" stroke="url(#qa-secondary)" strokeLinecap="round" strokeWidth={3} />
          <Rect x={14} y={24} width={6} height={5} rx={1.5} fill="url(#qa-accent)" />
          <Rect x={24} y={24} width={6} height={5} rx={1.5} fill="url(#qa-secondary)" />
          <Path d="M25 33h8" stroke="#fff" strokeLinecap="round" strokeOpacity={0.95} strokeWidth={2} />
        </G>
      );
    case "telegram-communities":
      return (
        <G>
          <Path d="M13 11h17a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-5l-5 4v-4h-7a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5Z" fill="url(#qa-secondary)" transform="translate(2 2)" />
          <Path d="M13 9h17a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-5l-5 4v-4h-7a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5Z" fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.78} strokeWidth={1.2} />
          <Path d="M17 17h10M17 21h7" stroke="#fff" strokeLinecap="round" strokeOpacity={0.95} strokeWidth={1.8} />
          <Path d="M29 30h8a4 4 0 0 1 4 4v3h-4v3l-4-3h-4a4 4 0 0 1-4-3" fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1} />
        </G>
      );
    case "fund":
      return (
        <G>
          <Path d="M11 15h25a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18a3 3 0 0 1 3-3Z" fill="url(#qa-secondary)" transform="translate(1 2)" />
          <Path d="M11 13h25a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V16a3 3 0 0 1 3-3Z" fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} />
          <Path d="M8 19h32" stroke="#fff" strokeOpacity={0.78} strokeWidth={1.5} />
          <Path d="M31 24h9v8h-9a4 4 0 0 1 0-8Z" fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.85} strokeWidth={1} />
          <Circle cx={32} cy={28} r={1.2} fill="#fff" />
          <Path d="M18 10c-2-3-7-1-5 3 1 2 5 4 5 4s4-2 5-4c2-4-3-6-5-3Z" fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.85} strokeWidth={0.8} />
        </G>
      );
    case "progress":
      return (
        <G>
          <Path d="M10 37h7V28h-7zM21 37h7V21h-7zM32 37h7V13h-7z" fill="url(#qa-secondary)" transform="translate(1 2)" />
          <Path d="M9 36h7V27H9z" fill="url(#qa-face)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Path d="M20 36h7V20h-7z" fill="url(#qa-secondary)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Path d="M31 36h7V12h-7z" fill="url(#qa-accent)" stroke="#fff" strokeOpacity={0.72} strokeWidth={1} />
          <Path d="m9 23 8-5 7 2 10-10" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <Path d="M29 10h5v5" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <Circle cx={17} cy={18} r={1.8} fill="#fff" />
          <Circle cx={24} cy={20} r={1.8} fill="#fff" />
        </G>
      );
  }
}

export function QuickActionIcon({
  name,
  primary,
  secondary,
  accent,
  highlight,
}: QuickActionIconProps) {
  return (
    <Svg width={40} height={40} viewBox="0 0 48 48" pointerEvents="none">
      <Defs>
        <LinearGradient id="qa-face" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={highlight} stopOpacity={0.96} />
          <Stop offset="0.28" stopColor={primary} />
          <Stop offset="1" stopColor={secondary} />
        </LinearGradient>
        <LinearGradient id="qa-side" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={secondary} />
          <Stop offset="1" stopColor={primary} />
        </LinearGradient>
        <LinearGradient id="qa-secondary" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={secondary} />
          <Stop offset="1" stopColor={accent} />
        </LinearGradient>
        <LinearGradient id="qa-accent" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent} />
          <Stop offset="1" stopColor={primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={24} cy={41} rx={13} ry={2.5} fill={secondary} opacity={0.18} />
      <Artwork name={name} />
    </Svg>
  );
}

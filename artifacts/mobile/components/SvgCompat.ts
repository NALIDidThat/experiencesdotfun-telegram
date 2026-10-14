import type { PropsWithChildren } from 'react';
import NativeSvg, {
  Circle as NativeCircle,
  ClipPath as NativeClipPath,
  Defs as NativeDefs,
  Ellipse as NativeEllipse,
  G as NativeG,
  Line as NativeLine,
  Path as NativePath,
  RadialGradient as NativeRadialGradient,
  Stop as NativeStop,
  Text as NativeText,
} from 'react-native-svg';
import type {
  CircleProps,
  ClipPathProps,
  EllipseProps,
  GProps,
  LineProps,
  PathProps,
  RadialGradientProps,
  StopProps,
  SvgProps,
  TextProps,
} from 'react-native-svg';
import { asJsxComponent } from '@/lib/asJsxComponent';

export const Svg = asJsxComponent<PropsWithChildren<SvgProps>>(NativeSvg);
export const Circle = asJsxComponent<CircleProps>(NativeCircle);
export const ClipPath = asJsxComponent<PropsWithChildren<ClipPathProps>>(NativeClipPath);
export const Defs = asJsxComponent<{ children?: React.ReactNode }>(NativeDefs);
export const Ellipse = asJsxComponent<EllipseProps>(NativeEllipse);
export const G = asJsxComponent<PropsWithChildren<GProps>>(NativeG);
export const Line = asJsxComponent<LineProps>(NativeLine);
export const Path = asJsxComponent<PathProps>(NativePath);
export const RadialGradient = asJsxComponent<PropsWithChildren<RadialGradientProps>>(NativeRadialGradient);
export const Stop = asJsxComponent<StopProps>(NativeStop);
export const SvgText = asJsxComponent<PropsWithChildren<TextProps>>(NativeText);

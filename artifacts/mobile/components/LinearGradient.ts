import { LinearGradient as NativeLinearGradient } from 'expo-linear-gradient';
import type { LinearGradientProps } from 'expo-linear-gradient/build/LinearGradient';
import { asJsxComponent } from '@/lib/asJsxComponent';

export const LinearGradient = asJsxComponent<LinearGradientProps>(NativeLinearGradient);

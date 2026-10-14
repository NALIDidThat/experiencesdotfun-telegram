import type { ComponentType } from 'react';

/**
 * Bridges upstream class-component declarations into JSX component types while
 * retaining the original public props type at the import boundary.
 */
export function asJsxComponent<Props>(component: unknown): ComponentType<Props> {
  return component as ComponentType<Props>;
}

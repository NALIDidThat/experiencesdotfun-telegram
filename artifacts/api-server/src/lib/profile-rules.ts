export function mergeDefinedFields<T extends object>(
  current: T,
  patch: Partial<T>,
): T {
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return { ...current, ...definedPatch };
}
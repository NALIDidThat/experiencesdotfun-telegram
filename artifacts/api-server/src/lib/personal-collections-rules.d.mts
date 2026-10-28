export type NormalizedPersonalMemory = {
  title: string | null;
  body: string | null;
  photoObjectKeys: string[];
  links: string[];
};

export function normalizePersonalMemory(
  input: unknown,
  userId: number,
  existing?: NormalizedPersonalMemory | null,
):
  | { ok: true; value: NormalizedPersonalMemory }
  | { ok: false; error: string };

export function positiveInteger(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function safePagination(input: {
  page?: string | null;
  limit?: string | null;
  defaultLimit?: number;
  maxLimit?: number;
}) {
  const defaultLimit = Math.max(1, input.defaultLimit || 20);
  const maxLimit = Math.max(defaultLimit, input.maxLimit || 100);
  const page = positiveInteger(input.page, 1);
  const limit = Math.min(positiveInteger(input.limit, defaultLimit), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

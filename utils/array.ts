export function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
  return Array.from(new Map(rows.map((r) => [keyFn(r), r])).values());
}

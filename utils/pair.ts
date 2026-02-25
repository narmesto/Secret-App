export function pair(a: string, b: string) {
  const user_low = a < b ? a : b;
  const user_high = a < b ? b : a;
  return { user_low, user_high };
}

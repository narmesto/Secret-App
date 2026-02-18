export function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

export function normalize(s: string) {
  return (s ?? "").trim().toLowerCase();
}

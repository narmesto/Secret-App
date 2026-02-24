
type NominatimResult = {
  place_id?: number;
  lat: string;
  lon: string;
  importance?: number;
  place_rank?: number;
  class?: string;
  type?: string;
  address?: any;
};

function isAddressLike(r: any) {
  const cls = String(r?.class ?? "");
  const type = String(r?.type ?? "");
  if (cls === "boundary") return false;
  if (cls === "railway") return false;
  if (cls === "highway" && type === "residential") return false;
  if (cls === "place" && (type === "city" || type === "county" || type === "state")) return false;
  return cls === "amenity" || cls === "building" || cls === "place" || cls === "shop";
}

function normalizeKey(addr: any) {
  if (!addr) return "";
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const city =
    (addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || "");
  const state = String(addr.state || "");
  const zip = String(addr.postcode || "");
  return `${street}|${city}|${state}|${zip}`.replace(/\s+/g, " ").trim();
}

export function formatUSAddress(addr: any) {
  if (!addr) return "";
  const street = ([addr.house_number, addr.road].filter(Boolean).join(" ") || addr.name || "").trim();
  const city = (addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || "").trim();
  const state = String(addr.state || "").trim();
  const zip = String(addr.postcode || "").trim();

  const line2 = [city, state].filter(Boolean).join(", ");
  const out = [street, line2, zip].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return out;
}

export async function nominatimSearchUS(query: string): Promise<NominatimResult[]> {
  const limit = 12;
  const url =
    `https://nominatim.openstreetmap.org/search?format=json` +
    `&q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    `&countrycodes=us` +
    `&dedupe=1` +
    `&extratags=1`;

  const res = await fetch(url, { headers: { "User-Agent": "gather-app/1.0" } });
  if (!res.ok) throw new Error(`address lookup failed (${res.status})`);
  return (await res.json()) as NominatimResult[];
}

export function cleanAddressResults(raw: NominatimResult[]) {
  const filtered = (raw ?? []).filter(isAddressLike);

  const bestByKey = new Map<string, NominatimResult>();
  for (const r of filtered) {
    const key = normalizeKey(r?.address);
    if (!key) continue;

    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, r);
      continue;
    }

    const a = Number(existing?.importance ?? 0);
    const b = Number(r?.importance ?? 0);
    if (b > a) bestByKey.set(key, r);
  }

  const cleaned = Array.from(bestByKey.values()).sort((a, b) => {
    const impA = Number(a?.importance ?? 0);
    const impB = Number(b?.importance ?? 0);
    if (impB !== impA) return impB - impA;

    const prA = Number(a?.place_rank ?? 999);
    const prB = Number(b?.place_rank ?? 999);
    return prA - prB;
  });

  return cleaned.slice(0, 6);
}

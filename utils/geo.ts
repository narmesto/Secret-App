function toRad(x: number) {
  return (x * Math.PI) / 180;
}

// Haversine distance in miles
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3958.7613; // Earth's radius in miles
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

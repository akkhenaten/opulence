export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Inside geofence when the reported position is within radius, allowing for GPS accuracy up to a cap.
export function insideFence({ lat, lng, accuracy = 0 }, venue, toleranceCap = 50) {
  if (lat == null || lng == null || venue.lat == null || venue.lng == null) return { ok: false, distance: null };
  const distance = distanceM(lat, lng, venue.lat, venue.lng);
  const slack = Math.min(Math.max(accuracy || 0, 0), toleranceCap);
  return { ok: distance <= venue.radius_m + slack, distance: Math.round(distance) };
}

/** Reading a store location typed or pasted by a person. */

/** Finds coordinates in "27.7172, 85.3240", a Google Maps link (@lat,lng / q=lat,lng / !3dlat!4dlng), or similar. */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const value = (text || '').trim();
  if (!value) return null;
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match) {
      const lat = Number(match[1]), lng = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/** Nepal, with a margin. A point outside is most often a typo or latitude and longitude swapped. */
export function inNepal(lat: number, lng: number): boolean {
  return lat >= 26 && lat <= 30.6 && lng >= 80 && lng <= 88.3;
}

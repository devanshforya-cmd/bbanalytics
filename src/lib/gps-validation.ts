export interface GpsFix { lat: number; lng: number; capturedAt: string; accuracy?: number }

export function validGpsCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function freshGpsFix(fix: GpsFix | null | undefined, now = Date.now()): fix is GpsFix {
  if (!fix || !validGpsCoordinates(fix.lat, fix.lng)) return false;
  const age = now - Date.parse(fix.capturedAt);
  return Number.isFinite(age) && age >= -5000 && age <= 120000;
}

export function geolocationMessage(code: number): string {
  if (code === 1) return 'Location is blocked. Allow location for this site in browser settings, enable device Location Services, then retry.';
  if (code === 3) return 'GPS timed out. Move near a window or outdoors and retry. Keep this app open.';
  return 'The device could not determine your location. Enable Location Services and retry.';
}

export function parseNativeFix(parameters: URLSearchParams, now = Date.now()): GpsFix & { batteryLevel?: number } {
  const valid = parameters.get('valid');
  if (valid === 'false' || valid === '0') throw new Error('Invalid position.');
  const lat = Number(parameters.get('lat'));
  const lng = Number(parameters.get('lon') ?? parameters.get('lng'));
  if (!parameters.get('lat')?.trim() || !(parameters.get('lon') ?? parameters.get('lng'))?.trim() || !validGpsCoordinates(lat, lng)) throw new Error('Valid coordinates are required.');
  const value = parameters.get('timestamp');
  if (!value) throw new Error('Position timestamp is required.');
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) ? numeric < 1e12 ? numeric * 1000 : numeric : Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + 120000 || timestamp < now - 86400000) throw new Error('Position timestamp is outside the accepted window.');
  const accuracy = parameters.has('accuracy') ? Number(parameters.get('accuracy')) : undefined;
  const batteryLevel = parameters.has('batt') ? Number(parameters.get('batt')) : undefined;
  if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)) throw new Error('Invalid accuracy.');
  if (batteryLevel !== undefined && (!Number.isFinite(batteryLevel) || batteryLevel < 0 || batteryLevel > 100)) throw new Error('Invalid battery level.');
  return { lat, lng, capturedAt: new Date(timestamp).toISOString(), accuracy, batteryLevel };
}

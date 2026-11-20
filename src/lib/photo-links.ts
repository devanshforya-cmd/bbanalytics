/**
 * Where a saved photo lives, in a form people can open from an Excel file.
 * Photos are stored in the app's Google Drive folder and kept on records as
 * /api/drive/files/<id>. A photo taken with no signal stays on the record as
 * image data until the hourly job moves it to Drive.
 */

export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'https://bbanalytics-three.vercel.app').replace(/\/+$/, '');

/** The Drive file id inside an app photo link, if it is one. */
export function driveFileId(url?: string | null): string | null {
  const match = String(url || '').match(/\/api\/drive\/files\/([A-Za-z0-9_-]{10,200})(?:[?#]|$)/);
  return match ? match[1] : null;
}

export const isInlineFile = (url?: string | null) => /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i.test(String(url || ''));

/** A link that opens the photo: Drive for saved photos, a note for ones still waiting to upload. */
export function photoLink(url?: string | null): string {
  const value = String(url || '').trim();
  if (!value) return '';
  const id = driveFileId(value);
  if (id) return `https://drive.google.com/file/d/${id}/view`;
  if (isInlineFile(value)) return 'Waiting to upload';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${APP_ORIGIN}${value}`;
  return '';
}

/** How many photo columns a sheet gets for fields that can hold several photos. */
export const PHOTO_COLUMNS = 4;

/** Spread a list of photos over a fixed number of cells (one link per cell). */
export function photoCells(urls: (string | null | undefined)[] | undefined, count = PHOTO_COLUMNS): string[] {
  const links = (urls || []).map(photoLink).filter(Boolean);
  return Array.from({ length: count }, (_, i) => links[i] || '');
}

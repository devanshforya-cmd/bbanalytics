/**
 * Image & Document Upload & Security Infrastructure for Brand Bucket Command Center
 * Fix 56e: File Upload Security
 * - 4MB file size limit
 * - Allowed extension validation (.jpg, .jpeg, .png, .webp, .pdf)
 * - MIME magic bytes verification (real file content sniffing)
 * - EXIF stripping via Canvas to protect location/hardware privacy
 * - Client-side JPEG/WebP compression (phone photos 3-8MB -> ~200-500KB)
 */

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  originalSize?: number;
  dimensions?: { width: number; height: number };
  mimeType?: string;
}

export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // Keep multipart uploads below the hosting request limit.
/** Largest original photo accepted; it is compressed well under 4 MB before upload. */
export const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

/**
 * 56e. Validates file header magic bytes to verify true MIME signature
 */
export async function validateFileSignature(file: File): Promise<{
  valid: boolean;
  detectedType?: string;
  error?: string;
}> {
  // 1. Check size. Photos are compressed before upload, so a large phone photo is fine;
  // the 4 MB limit applies to what is actually sent.
  if (file.size > MAX_ORIGINAL_BYTES) {
    return {
      valid: false,
      error: `This file is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Photos up to 30 MB and PDFs up to 4 MB can be added.`,
    };
  }

  // 2. Check extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Disallowed file extension '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  // 3. Read first 12 bytes for Magic Number verification
  return new Promise((resolve) => {
    const reader = new FileReader();
    const slice = file.slice(0, 16);

    reader.onloadend = () => {
      if (!reader.result) {
        resolve({ valid: false, error: 'Could not read file header.' });
        return;
      }

      const arr = new Uint8Array(reader.result as ArrayBuffer);
      let header = '';
      for (let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16).padStart(2, '0');
      }
      header = header.toUpperCase();

      // JPEG: FF D8 FF
      if (header.startsWith('FFD8FF')) {
        resolve({ valid: true, detectedType: 'image/jpeg' });
        return;
      }

      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (header.startsWith('89504E47')) {
        resolve({ valid: true, detectedType: 'image/png' });
        return;
      }

      // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
      if (header.startsWith('52494646') && header.slice(16, 24) === '57454250') {
        resolve({ valid: true, detectedType: 'image/webp' });
        return;
      }

      // PDF: %PDF (25 50 44 46)
      if (header.startsWith('25504446')) {
        resolve({ valid: true, detectedType: 'application/pdf' });
        return;
      }

      resolve({
        valid: false,
        error: 'Invalid file signature. File content does not match expected image or PDF format.',
      });
    };

    reader.onerror = () => {
      resolve({ valid: false, error: 'Failed to inspect file magic bytes.' });
    };

    reader.readAsArrayBuffer(slice);
  });
}

/** Photos are shrunk to fit inside this many pixels on the longest side. */
export const PHOTO_MAX_SIDE = 1600;
/** Compression keeps lowering quality until a photo is under this size (or quality hits its floor). */
export const PHOTO_TARGET_BYTES = 450 * 1024;

/** How big a picture of this size ends up, keeping its shape. */
export function fitWithin(width: number, height: number, maxSide = PHOTO_MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** A photo waiting for signal is held smaller, since it travels inside the record until then. */
export const OFFLINE_MAX_SIDE = 1280;
export const OFFLINE_TARGET_BYTES = 160 * 1024;

/** Quality steps tried in order until the photo is small enough. */
export const QUALITY_STEPS = [0.78, 0.68, 0.58, 0.5];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read.')); };
    img.src = url;
  });
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/**
 * Built-in photo compressor, used on every upload. Resizes to fit 1600 px, re-encodes as JPEG
 * and lowers quality step by step until the file is under about 450 KB. Redrawing the picture
 * also drops hidden EXIF data (phone location and camera details).
 * A 4-8 MB phone photo usually ends up around 200-400 KB. PDFs and non-images pass through.
 */
export async function stripExifAndCompress(file: File, maxSide: number = PHOTO_MAX_SIDE, targetBytes: number = PHOTO_TARGET_BYTES): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  let img: HTMLImageElement;
  try { img = await loadImage(file); } catch { return file; }
  const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // White behind transparent PNG screenshots, so they do not turn black as JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  let blob: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    blob = await toBlob(canvas, quality);
    if (!blob || blob.size <= targetBytes) break;
  }
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^/.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * Backward compatibility alias
 */
export const compressImage = stripExifAndCompress;

/** Where each kind of photo is filed in Drive (BB Analytics → Photos → …). Matches the server list. */
export const PHOTO_FEATURES = ['shelf_photos', 'document_handover', 'cheque_tracker', 'dispatches', 'beat_plans', 'call_tracker', 'reviews', 'orderflow'] as const;
export type PhotoFeature = typeof PHOTO_FEATURES[number];

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('This file could not be read.'));
  reader.readAsDataURL(file);
});

/**
 * Check, compress and save a photo or PDF. Online, it goes straight to Google Drive and the
 * record keeps a link. With no signal (or Drive unreachable) the compressed photo is kept on
 * the record for now and the hourly job moves it to Drive, so nobody is ever blocked.
 */
export async function uploadImage(file: File, folder: string = 'beat_plans', compress: boolean = true): Promise<UploadResult & { savedToDrive: boolean }> {
  const originalSize = file.size;
  const verification = await validateFileSignature(file);
  if (!verification.valid) throw new Error(verification.error || 'File failed security validation.');
  if (!(PHOTO_FEATURES as readonly string[]).includes(folder)) throw new Error('Choose a supported upload feature.');

  const isImage = (verification.detectedType || file.type).startsWith('image/');
  const processedFile = (compress && isImage) ? await stripExifAndCompress(file) : file;
  if (processedFile.size > MAX_FILE_SIZE_BYTES) throw new Error(isImage ? 'This photo could not be made small enough. Try another photo.' : 'PDFs can be up to 4 MB.');
  const base = { filename: processedFile.name, size: processedFile.size, originalSize, mimeType: processedFile.type || verification.detectedType || file.type };

  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const form = new FormData();
      form.set('file', processedFile);
      form.set('feature', folder);
      const response = await fetch('/api/drive/upload', { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success && result.viewUrl) return { ...base, url: result.viewUrl, filename: result.fileName || base.filename, savedToDrive: true };
      // A refused file type or size will not succeed later either.
      if (response.status === 400 || response.status === 413) throw new Error(result.error || 'Upload failed.');
    } catch (error) {
      if (error instanceof Error && /Only valid|exceeds|Provide an image/.test(error.message)) throw error;
    }
  }
  // Kept on the record until it reaches Drive, so it is made smaller still to keep syncing light.
  const offlineCopy = isImage ? await stripExifAndCompress(file, OFFLINE_MAX_SIDE, OFFLINE_TARGET_BYTES) : processedFile;
  return { ...base, size: offlineCopy.size, url: await readAsDataUrl(offlineCopy), savedToDrive: false };
}

/** Save one photo and get back what to store on the record. */
export async function savePhoto(file: File, feature: PhotoFeature): Promise<string> {
  return (await uploadImage(file, feature, true)).url;
}

/**
 * Batch upload multiple verified files.
 */
export async function uploadMultipleImages(
  files: File[],
  folder: string = 'uploads',
  compress: boolean = true
): Promise<UploadResult[]> {
  const results = await Promise.all(
    files.map((file) => uploadImage(file, folder, compress))
  );
  return results;
}

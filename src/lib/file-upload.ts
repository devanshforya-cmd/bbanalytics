/**
 * Image & Document Upload & Security Infrastructure for Brand Bucket Command Center
 * Fix 56e: File Upload Security
 * - 5MB file size limit
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

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit (Fix 56e)
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

/**
 * 56e. Validates file header magic bytes to verify true MIME signature
 */
export async function validateFileSignature(file: File): Promise<{
  valid: boolean;
  detectedType?: string;
  error?: string;
}> {
  // 1. Check size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum limit of 5MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
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

/**
 * 56e. Strips EXIF metadata by drawing onto an HTML5 Canvas, then re-encoding.
 * Protects officer & customer location privacy and camera timestamps.
 */
export async function stripExifAndCompress(
  file: File,
  maxWidth: number = 1200,
  quality: number = 0.75
): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Drawing on canvas automatically discards all EXIF segments
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const cleanFile = new File([blob], cleanName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            resolve(cleanFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        resolve(file);
      };
    };

    reader.onerror = () => {
      resolve(file);
    };
  });
}

/**
 * Backward compatibility alias
 */
export const compressImage = stripExifAndCompress;

/**
 * Uploads a verified, EXIF-stripped, and compressed file.
 */
export async function uploadImage(
  file: File,
  folder: string = 'uploads',
  compress: boolean = true
): Promise<UploadResult> {
  const originalSize = file.size;

  // 56e. Security verification
  const verification = await validateFileSignature(file);
  if (!verification.valid) {
    throw new Error(verification.error || 'File failed security validation.');
  }

  const isImage = (verification.detectedType || file.type).startsWith('image/');
  const processedFile = (compress && isImage) ? await stripExifAndCompress(file) : file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(processedFile);

    reader.onload = () => {
      const resultUrl = reader.result as string;
      const uploadResult: UploadResult = {
        url: resultUrl,
        filename: `${folder}/${Date.now()}_${processedFile.name}`,
        size: processedFile.size,
        originalSize,
        mimeType: verification.detectedType || file.type,
      };

      resolve(uploadResult);
    };

    reader.onerror = (err) => {
      reject(new Error(`Failed to read file: ${err}`));
    };
  });
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

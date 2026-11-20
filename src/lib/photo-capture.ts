'use client';
/**
 * One way to take in a photo anywhere in the app: compress it, save it to Google Drive and
 * hand back what to store on the record. With no signal the photo is kept on the record and
 * moved to Drive automatically later; the person is told once, then carries on.
 */
import { toast } from '@/components/common/Toast';
import { uploadImage, type PhotoFeature } from './file-upload';

let toldOffline = false;

export async function capturePhoto(file: File | null | undefined, feature: PhotoFeature, apply: (url: string) => void): Promise<void> {
  if (!file) return;
  try {
    const saved = await uploadImage(file, feature, true);
    apply(saved.url);
    if (!saved.savedToDrive && !toldOffline) {
      toldOffline = true;
      toast.info('Photo saved on this phone', 'It moves to Google Drive by itself once there is signal.');
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'This photo could not be saved.');
  }
}

/** Several photos at once (gallery picks). */
export async function capturePhotos(files: FileList | File[] | null | undefined, feature: PhotoFeature, apply: (url: string) => void): Promise<void> {
  for (const file of Array.from(files || [])) await capturePhoto(file, feature, apply);
}

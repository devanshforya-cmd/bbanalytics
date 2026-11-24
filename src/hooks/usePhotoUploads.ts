'use client';
import { useSyncExternalStore } from 'react';
import { subscribeUploads, uploadsServerSnapshot, uploadsSnapshot } from '@/lib/photo-capture';

/** Photos uploading right now, anywhere in the app. Optionally only one kind. */
export function usePhotoUploads(feature?: string) {
  const all = useSyncExternalStore(subscribeUploads, uploadsSnapshot, uploadsServerSnapshot);
  return feature ? all.filter((entry) => entry.feature === feature).length : all.length;
}

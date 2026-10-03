'use client';

import React, { useState, useRef } from 'react';
import { compressImage, uploadImage, UploadResult } from '@/lib/file-upload';
import {
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Maximize2,
  Sparkles,
} from 'lucide-react';

export interface CameraCaptureProps {
  onCapture?: (files: File[]) => void;
  onUpload?: (results: UploadResult[]) => void;
  maxFiles?: number;
  label?: string;
  sublabel?: string;
  folder?: string;
  existingUrls?: string[];
  onRemoveExisting?: (index: number) => void;
  autoCompress?: boolean;
  disabled?: boolean;
  className?: string;
}

interface CapturedItem {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  isCompressing: boolean;
}

export default function CameraCapture({
  onCapture,
  onUpload,
  maxFiles = 4,
  label = 'Capture Photo Evidence',
  sublabel,
  folder = 'evidence',
  existingUrls = [],
  onRemoveExisting,
  autoCompress = true,
  disabled = false,
  className = '',
}: CameraCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const totalCount = existingUrls.length + capturedItems.length;
  const canAddMore = totalCount < maxFiles;

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || disabled) return;

    const rawFiles = Array.from(fileList);
    const availableSlots = maxFiles - totalCount;
    const filesToProcess = rawFiles.slice(0, availableSlots);

    if (filesToProcess.length === 0) return;

    setIsProcessing(true);

    const newItems: CapturedItem[] = [];
    const processedFiles: File[] = [];
    const uploadResults: UploadResult[] = [];

    for (const rawFile of filesToProcess) {
      const originalSize = rawFile.size;
      let finalFile = rawFile;

      if (autoCompress && rawFile.type.startsWith('image/')) {
        try {
          finalFile = await compressImage(rawFile, 1200, 0.75);
        } catch {
          finalFile = rawFile;
        }
      }

      processedFiles.push(finalFile);

      // Create object URL for instant preview
      const previewUrl = URL.createObjectURL(finalFile);
      const itemId = `cap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      newItems.push({
        id: itemId,
        file: finalFile,
        previewUrl,
        originalSize,
        compressedSize: finalFile.size,
        isCompressing: false,
      });

      if (onUpload) {
        try {
          const res = await uploadImage(finalFile, folder, false);
          uploadResults.push(res);
        } catch (e) {
          console.error('Error uploading image', e);
        }
      }
    }

    const updated = [...capturedItems, ...newItems];
    setCapturedItems(updated);
    setIsProcessing(false);

    // Call callbacks
    if (onCapture) {
      onCapture(updated.map((item) => item.file));
    }
    if (onUpload && uploadResults.length > 0) {
      onUpload(uploadResults);
    }
  };

  const handleRemoveCaptured = (indexToRemove: number) => {
    const itemToRemove = capturedItems[indexToRemove];
    if (itemToRemove?.previewUrl) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
    }

    const nextItems = capturedItems.filter((_, idx) => idx !== indexToRemove);
    setCapturedItems(nextItems);

    if (onCapture) {
      onCapture(nextItems.map((item) => item.file));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Hidden inputs: Mobile Camera (capture="environment") & Desktop File Picker */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || !canAddMore}
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={maxFiles > 1}
        className="hidden"
        disabled={disabled || !canAddMore}
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Header and Trigger Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">{label}</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
              {totalCount} / {maxFiles}
            </span>
          </div>
          {sublabel && <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Snap with native camera */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled || !canAddMore || isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Open camera"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera</span>
          </button>

          {/* Browse file picker */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || !canAddMore || isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Choose image file"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Browse</span>
          </button>
        </div>
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg text-xs text-blue-800">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
          <span className="font-medium">Compressing and optimizing photo for instant storage...</span>
        </div>
      )}

      {/* Thumbnails Grid */}
      {(existingUrls.length > 0 || capturedItems.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Existing URLs */}
          {existingUrls.map((url, idx) => (
            <div
              key={`exist-${idx}`}
              className="group relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Saved Photo ${idx + 1}`} className="w-full h-full object-cover" />
              
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg text-xs font-bold transition shadow-xs"
                  aria-label="View large photo"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                {onRemoveExisting && (
                  <button
                    type="button"
                    onClick={() => onRemoveExisting(idx)}
                    className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                    aria-label="Delete photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                Attached #{idx + 1}
              </div>
            </div>
          ))}

          {/* Newly Captured & Compressed Items */}
          {capturedItems.map((item, idx) => {
            const savingsPct =
              item.originalSize > 0
                ? Math.round(((item.originalSize - item.compressedSize) / item.originalSize) * 100)
                : 0;

            return (
              <div
                key={item.id}
                className="group relative aspect-4/3 rounded-xl overflow-hidden border border-blue-300 bg-slate-100 shadow-2xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={`Captured Photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                />

                {/* Hover overlay actions */}
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(item.previewUrl)}
                    className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg text-xs font-bold transition shadow-xs"
                    aria-label="View large photo"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCaptured(idx)}
                    className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                    aria-label="Delete captured photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Compression Pill Badge */}
                <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between pointer-events-none">
                  <span className="bg-blue-900/80 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-2xs">
                    {formatFileSize(item.compressedSize)}
                  </span>
                  {savingsPct > 10 && (
                    <span className="bg-emerald-600/90 text-white text-[8px] font-bold px-1 py-0.5 rounded shadow-2xs">
                      -{savingsPct}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 z-10 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full p-1.5 transition"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Photo preview"
              className="max-h-[80vh] w-auto max-w-full object-contain rounded-xl mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}

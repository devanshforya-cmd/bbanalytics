'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Navigation,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Store,
  Battery,
  Clock,
  Phone,
  ShieldCheck,
  Radio,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { StaffLiveLocation, BeatItem } from '@/lib/types';

interface InteractiveMapProps {
  reps: StaffLiveLocation[];
  beatItems?: BeatItem[];
  selectedRepId?: string;
  onSelectRep?: (repId: string) => void;
  className?: string;
}

// Slippy map coordinate math
function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

function lon2pixel(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom) * 256;
}

function lat2pixel(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, zoom) *
    256
  );
}

export default function InteractiveMap({
  reps,
  beatItems = [],
  selectedRepId,
  onSelectRep,
  className = 'h-[500px]',
}: InteractiveMapProps) {
  // Center on Kathmandu by default
  const [centerLat, setCenterLat] = useState(27.700769);
  const [centerLng, setCenterLng] = useState(85.31514);
  const [zoom, setZoom] = useState(13);

  // Drag pan state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [activePopup, setActivePopup] = useState<{
    type: 'REP' | 'STORE';
    rep?: StaffLiveLocation;
    store?: BeatItem;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Center on selected rep if provided
  useEffect(() => {
    if (selectedRepId) {
      const rep = reps.find((r) => r.officerId === selectedRepId);
      if (rep) {
        setCenterLat(rep.currentLat);
        setCenterLng(rep.currentLng);
        setPanOffset({ x: 0, y: 0 });
      }
    }
  }, [selectedRepId, reps]);

  // Handle Drag Start
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Commit pan to coordinates
    if (containerRef.current) {
      const scale = Math.pow(2, zoom) * 256;
      const dLng = (-panOffset.x / scale) * 360;
      const currentPixelY = lat2pixel(centerLat, zoom) - panOffset.y;
      const n = Math.PI - (2 * Math.PI * currentPixelY) / scale;
      const newLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

      setCenterLng((prev) => prev + dLng);
      setCenterLat(Math.max(-85, Math.min(85, newLat)));
      setPanOffset({ x: 0, y: 0 });
    }
  };

  // Touch handlers for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - panOffset.x,
        y: e.touches[0].clientY - panOffset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPanOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (zoom < 17) setZoom((z) => z + 1);
  };

  const handleZoomOut = () => {
    if (zoom > 10) setZoom((z) => z - 1);
  };

  const handleResetToReps = () => {
    if (reps.length > 0) {
      setCenterLat(reps[0].currentLat);
      setCenterLng(reps[0].currentLng);
      setPanOffset({ x: 0, y: 0 });
      setZoom(13);
    }
  };

  // Calculate visible tiles
  const getVisibleTiles = () => {
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 500;

    const centerPxX = lon2pixel(centerLng, zoom) - panOffset.x;
    const centerPxY = lat2pixel(centerLat, zoom) - panOffset.y;

    const startPxX = centerPxX - width / 2;
    const endPxX = centerPxX + width / 2;
    const startPxY = centerPxY - height / 2;
    const endPxY = centerPxY + height / 2;

    const startTileX = Math.floor(startPxX / 256);
    const endTileX = Math.floor(endPxX / 256);
    const startTileY = Math.floor(startPxY / 256);
    const endTileY = Math.floor(endPxY / 256);

    const tiles: { x: number; y: number; z: number; left: number; top: number; key: string }[] = [];
    const maxTiles = Math.pow(2, zoom);

    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        if (ty >= 0 && ty < maxTiles) {
          const normTx = ((tx % maxTiles) + maxTiles) % maxTiles;
          const left = tx * 256 - (centerPxX - width / 2);
          const top = ty * 256 - (centerPxY - height / 2);

          tiles.push({
            x: normTx,
            y: ty,
            z: zoom,
            left,
            top,
            key: `${zoom}-${normTx}-${ty}`,
          });
        }
      }
    }
    return tiles;
  };

  // Convert lat/lng to container pixel offset
  const getPixelPosition = useCallback(
    (lat: number, lng: number) => {
      const width = containerRef.current?.clientWidth || 800;
      const height = containerRef.current?.clientHeight || 500;

      const centerPxX = lon2pixel(centerLng, zoom) - panOffset.x;
      const centerPxY = lat2pixel(centerLat, zoom) - panOffset.y;

      const pxX = lon2pixel(lng, zoom);
      const pxY = lat2pixel(lat, zoom);

      return {
        x: pxX - (centerPxX - width / 2),
        y: pxY - (centerPxY - height / 2),
      };
    },
    [centerLat, centerLng, zoom, panOffset]
  );

  const tiles = getVisibleTiles();

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-inner select-none cursor-grab active:cursor-grabbing ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slippy Map Tiles Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
            alt=""
            loading="lazy"
            className="absolute w-[256px] h-[256px] opacity-90 transition-opacity"
            style={{
              left: `${tile.left}px`,
              top: `${tile.top}px`,
              filter: 'saturate(1.05) contrast(1.02)',
            }}
          />
        ))}
      </div>

      {/* SVG Polylines for Rep Routes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        {reps.map((rep) => {
          if (!rep.todayRoute || rep.todayRoute.length < 2) return null;
          // Connect rep current location to stores
          const repPos = getPixelPosition(rep.currentLat, rep.currentLng);
          return (
            <g key={`path-${rep.officerId}`}>
              <circle
                cx={repPos.x}
                cy={repPos.y}
                r="30"
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeOpacity="0.4"
                className="animate-ping"
              />
            </g>
          );
        })}
      </svg>

      {/* Beat Store Markers */}
      {beatItems.map((store) => {
        if (!store.lat || !store.lng) return null;
        const pos = getPixelPosition(store.lat, store.lng);
        const isVisited = store.status === 'VISITED';
        const isSkipped = store.status === 'SKIPPED';

        return (
          <div
            key={`store-${store.id}`}
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setActivePopup({
                type: 'STORE',
                store,
                x: pos.x,
                y: pos.y,
              });
            }}
            className="absolute z-20 cursor-pointer group"
          >
            <div
              className={`p-1.5 rounded-full border-2 shadow-md transition-transform group-hover:scale-125 ${
                isVisited
                  ? 'bg-emerald-500 border-white text-white'
                  : isSkipped
                  ? 'bg-rose-500 border-white text-white'
                  : 'bg-amber-500 border-white text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-slate-900/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {store.storeName}
            </div>
          </div>
        );
      })}

      {/* Field Rep Live GPS Markers */}
      {reps.map((rep) => {
        const pos = getPixelPosition(rep.currentLat, rep.currentLng);
        const isSelected = selectedRepId === rep.officerId;

        return (
          <div
            key={`rep-${rep.officerId}`}
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectRep) onSelectRep(rep.officerId);
              setActivePopup({
                type: 'REP',
                rep,
                x: pos.x,
                y: pos.y,
              });
            }}
            className="absolute z-30 cursor-pointer group"
          >
            {/* Live Radar Pulse */}
            <div className="relative flex items-center justify-center">
              <div
                className={`absolute w-10 h-10 rounded-full animate-ping opacity-75 ${
                  rep.status === 'AT_STORE'
                    ? 'bg-emerald-400'
                    : rep.status === 'IN_TRANSIT'
                    ? 'bg-blue-400'
                    : 'bg-amber-400'
                }`}
              />
              <div
                className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-xl text-white font-bold text-xs transition-transform group-hover:scale-110 ${
                  rep.status === 'AT_STORE'
                    ? 'bg-emerald-600'
                    : rep.status === 'IN_TRANSIT'
                    ? 'bg-blue-600'
                    : 'bg-amber-600'
                } ${isSelected ? 'ring-4 ring-emerald-400/60' : ''}`}
              >
                <Radio className="w-4 h-4" />
              </div>

              {/* Name Tag Pill */}
              <div className="absolute top-9 bg-slate-950/90 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-800 shadow-md whitespace-nowrap flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{rep.officerName.split(' ')[0]}</span>
                {rep.status === 'AT_STORE' && <span className="text-emerald-400 font-normal">(@Store)</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Interactive Popup Card */}
      {activePopup && (
        <div
          style={{
            left: `${Math.min(Math.max(activePopup.x, 140), (containerRef.current?.clientWidth || 600) - 140)}px`,
            top: `${Math.max(activePopup.y - 120, 20)}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className="absolute z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 w-64 text-slate-800 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {activePopup.type === 'REP' && activePopup.rep && (
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h4 className="font-bold text-xs text-slate-900">{activePopup.rep.officerName}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePopup(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Telemetry Status:</span>
                  <span
                    className={`font-semibold px-1.5 py-0.2 rounded text-[10px] ${
                      activePopup.rep.status === 'AT_STORE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {activePopup.rep.status.replace('_', ' ')}
                  </span>
                </div>

                {activePopup.rep.currentStoreName && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Current Store:</span>
                    <span className="font-semibold text-slate-900 truncate max-w-[120px]">
                      {activePopup.rep.currentStoreName}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" /> Dwell Time:
                  </span>
                  <span className="font-semibold text-slate-700">
                    {activePopup.rep.timeAtCurrentStoreMinutes || 0} mins
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Battery className="w-3 h-3 text-emerald-500" /> Phone Battery:
                  </span>
                  <span className="font-semibold text-slate-700 font-mono">
                    {activePopup.rep.batteryLevel}%
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono">
                  {activePopup.rep.currentLat.toFixed(4)}, {activePopup.rep.currentLng.toFixed(4)}
                </span>
                <span className="font-semibold text-emerald-600">GPS Ping Active</span>
              </div>
            </div>
          )}

          {activePopup.type === 'STORE' && activePopup.store && (
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <h4 className="font-bold text-xs text-slate-900 truncate pr-2">
                  {activePopup.store.storeName}
                </h4>
                <button
                  type="button"
                  onClick={() => setActivePopup(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">{activePopup.store.address}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400">Beat Status</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                    activePopup.store.status === 'VISITED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {activePopup.store.status}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="absolute right-3 top-3 z-30 flex flex-col gap-1.5 shadow-md">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-xs text-slate-700 hover:text-slate-950 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-xs text-slate-700 hover:text-slate-950 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetToReps}
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-xs text-emerald-600 hover:text-emerald-700 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Center on Sales Reps"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Map Legend & OSM Attribution */}
      <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 bg-slate-900/85 backdrop-blur-xs px-3 py-1.5 rounded-xl text-[10px] text-white shadow-lg pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-medium">Active Rep</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Store className="w-3 h-3 text-emerald-400" />
            <span>Visited</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Store className="w-3 h-3 text-amber-400" />
            <span>Pending</span>
          </div>
        </div>

        <div className="text-[9px] text-slate-500 bg-white/80 px-2 py-0.5 rounded shadow pointer-events-auto">
          &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a>
        </div>
      </div>
    </div>
  );
}

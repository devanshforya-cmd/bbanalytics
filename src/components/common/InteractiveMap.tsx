'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Layers,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
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

// Subdomains for load balancing tile requests
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const OSM_SUBDOMAINS = ['a', 'b', 'c'];

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
  const [zoom, setZoom] = useState(14);
  const [mapStyle, setMapStyle] = useState<'STREET' | 'SATELLITE' | 'TOPO'>('STREET');

  // Dynamic container dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Drag pan state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Touch pinch-to-zoom distance tracker
  const touchStartDistRef = useRef<number | null>(null);

  // Failed tiles fallback tracker
  const [failedTiles, setFailedTiles] = useState<Record<string, number>>({});

  // Active popup
  const [activePopup, setActivePopup] = useState<{
    type: 'REP' | 'STORE';
    rep?: StaffLiveLocation;
    store?: BeatItem;
    x: number;
    y: number;
  } | null>(null);

  // Observe container dimensions with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const updateSize = () => {
      if (el) {
        const w = el.clientWidth || 800;
        const h = el.clientHeight || 500;
        setDimensions({ width: w, height: h });
      }
    };

    updateSize();

    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  // Center on selected rep if provided
  useEffect(() => {
    if (selectedRepId) {
      const rep = reps.find((r) => r.officerId === selectedRepId);
      if (rep && !isNaN(rep.currentLat) && !isNaN(rep.currentLng)) {
        setCenterLat(rep.currentLat);
        setCenterLng(rep.currentLng);
        setPanOffset({ x: 0, y: 0 });
      }
    }
  }, [selectedRepId, reps]);

  // Handle Drag Start
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with primary mouse button
    if (e.button !== 0) return;
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

  const commitPan = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    if (panOffset.x === 0 && panOffset.y === 0) return;

    const scale = Math.pow(2, zoom) * 256;
    const dLng = (-panOffset.x / scale) * 360;
    const currentPixelY = lat2pixel(centerLat, zoom) - panOffset.y;
    const n = Math.PI - (2 * Math.PI * currentPixelY) / scale;
    const newLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

    setCenterLng((prev) => prev + dLng);
    setCenterLat(Math.max(-85, Math.min(85, newLat)));
    setPanOffset({ x: 0, y: 0 });
  }, [isDragging, panOffset, zoom, centerLat]);

  const handleMouseUp = () => {
    commitPan();
  };

  // Wheel zoom with delta threshold
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < -15) {
      setZoom((z) => Math.min(18, z + 1));
    } else if (e.deltaY > 15) {
      setZoom((z) => Math.max(10, z - 1));
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
      touchStartDistRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPanOffset({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diff = dist - touchStartDistRef.current;
      if (diff > 40) {
        setZoom((z) => Math.min(18, z + 1));
        touchStartDistRef.current = dist;
      } else if (diff < -40) {
        setZoom((z) => Math.max(10, z - 1));
        touchStartDistRef.current = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
    commitPan();
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (zoom < 18) setZoom((z) => z + 1);
  };

  const handleZoomOut = () => {
    if (zoom > 10) setZoom((z) => z - 1);
  };

  // Center on first active rep
  const handleResetToReps = () => {
    if (reps.length > 0) {
      setCenterLat(reps[0].currentLat);
      setCenterLng(reps[0].currentLng);
      setPanOffset({ x: 0, y: 0 });
      setZoom(14);
    } else {
      setCenterLat(27.700769);
      setCenterLng(85.31514);
      setPanOffset({ x: 0, y: 0 });
      setZoom(13);
    }
  };

  // Fit bounds to all markers (reps and stores)
  const handleFitAll = () => {
    const points: { lat: number; lng: number }[] = [];
    reps.forEach((r) => {
      if (!isNaN(r.currentLat) && !isNaN(r.currentLng)) {
        points.push({ lat: r.currentLat, lng: r.currentLng });
      }
    });
    beatItems.forEach((b) => {
      if (b.lat && b.lng && !isNaN(b.lat) && !isNaN(b.lng)) {
        points.push({ lat: b.lat, lng: b.lng });
      }
    });

    if (points.length === 0) {
      handleResetToReps();
      return;
    }

    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    points.forEach((p) => {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    setCenterLat(midLat);
    setCenterLng(midLng);
    setPanOffset({ x: 0, y: 0 });

    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);

    if (maxDiff > 0.15) setZoom(11);
    else if (maxDiff > 0.08) setZoom(12);
    else if (maxDiff > 0.03) setZoom(13);
    else setZoom(14);
  };

  // Calculate visible tiles based on container dimensions
  const tiles = useMemo(() => {
    const { width, height } = dimensions;

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

    const result: {
      x: number;
      y: number;
      z: number;
      left: number;
      top: number;
      key: string;
      subdomainCarto: string;
      subdomainOsm: string;
    }[] = [];
    const maxTiles = Math.pow(2, zoom);

    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        if (ty >= 0 && ty < maxTiles) {
          const normTx = ((tx % maxTiles) + maxTiles) % maxTiles;
          const left = tx * 256 - (centerPxX - width / 2);
          const top = ty * 256 - (centerPxY - height / 2);

          const subCarto = CARTO_SUBDOMAINS[Math.abs(normTx + ty) % CARTO_SUBDOMAINS.length];
          const subOsm = OSM_SUBDOMAINS[Math.abs(normTx + ty) % OSM_SUBDOMAINS.length];

          result.push({
            x: normTx,
            y: ty,
            z: zoom,
            left,
            top,
            key: `${zoom}-${normTx}-${ty}`,
            subdomainCarto: subCarto,
            subdomainOsm: subOsm,
          });
        }
      }
    }
    return result;
  }, [centerLng, centerLat, zoom, panOffset, dimensions]);

  // Convert lat/lng to container pixel offset
  const getPixelPosition = useCallback(
    (lat: number, lng: number) => {
      const { width, height } = dimensions;

      const centerPxX = lon2pixel(centerLng, zoom) - panOffset.x;
      const centerPxY = lat2pixel(centerLat, zoom) - panOffset.y;

      const pxX = lon2pixel(lng, zoom);
      const pxY = lat2pixel(lat, zoom);

      return {
        x: pxX - (centerPxX - width / 2),
        y: pxY - (centerPxY - height / 2),
      };
    },
    [centerLat, centerLng, zoom, panOffset, dimensions]
  );

  // Ultra-vivid, reliable slippy map tiles with multi-CDN fallback pipeline
  const getTileSrc = (tile: typeof tiles[0]) => {
    const failures = failedTiles[tile.key] || 0;

    if (mapStyle === 'SATELLITE') {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tile.z}/${tile.y}/${tile.x}`;
    } else if (mapStyle === 'TOPO') {
      return `https://a.tile.opentopomap.org/${tile.z}/${tile.x}/${tile.y}.png`;
    }

    // Default STREET: CartoDB Voyager (ultra-vivid, crystal clear roads, neighborhood landmarks & 100% reliable)
    if (failures === 0) {
      return `https://${tile.subdomainCarto}.basemaps.cartocdn.com/rastertiles/voyager/${tile.z}/${tile.x}/${tile.y}.png`;
    } else if (failures === 1) {
      return `https://${tile.subdomainCarto}.basemaps.cartocdn.com/light_all/${tile.z}/${tile.x}/${tile.y}.png`;
    } else if (failures === 2) {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${tile.z}/${tile.y}/${tile.x}`;
    } else {
      return `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
    }
  };

  const handleTileError = (key: string) => {
    setFailedTiles((prev) => ({
      ...prev,
      [key]: (prev[key] || 0) + 1,
    }));
  };

  // Center on device geolocation
  const handleLocateMe = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCenterLat(pos.coords.latitude);
          setCenterLng(pos.coords.longitude);
          setPanOffset({ x: 0, y: 0 });
          setZoom(15);
        },
        () => {
          handleResetToReps();
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      handleResetToReps();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-inner select-none cursor-grab active:cursor-grabbing ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slippy Map Tiles Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {tiles.map((tile) => {
          const failures = failedTiles[tile.key] || 0;
          if (failures >= 4) {
            // Render styled subtle topographic grid fallback if all CDNs are unreachable
            return (
              <div
                key={tile.key}
                className="absolute w-[256px] h-[256px] bg-slate-100 border border-slate-200/40"
                style={{
                  left: `${tile.left}px`,
                  top: `${tile.top}px`,
                  backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
            );
          }

          return (
            <img
              key={`${tile.key}-${mapStyle}-${failures}`}
              src={getTileSrc(tile)}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
              onError={() => handleTileError(tile.key)}
              className="absolute w-[256px] h-[256px] opacity-100 transition-opacity duration-150 select-none pointer-events-none"
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
              }}
            />
          );
        })}
      </div>

      {/* SVG Polylines for Rep Routes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <defs>
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#1e3a8a" floodOpacity="0.3" />
          </filter>
        </defs>

        {reps.map((rep) => {
          const isSelected = selectedRepId === rep.officerId;
          const points: { x: number; y: number }[] = [];

          // Collect stops with coordinates
          if (rep.todayRoute && rep.todayRoute.length > 0) {
            rep.todayRoute.forEach((step) => {
              if (step.lat && step.lng) {
                points.push(getPixelPosition(step.lat, step.lng));
              } else {
                // If route step has no explicit lat/lng, attempt to lookup by store name in beatItems
                const matchedBeat = beatItems.find(
                  (b) => b.storeName.toLowerCase() === step.storeName.toLowerCase()
                );
                if (matchedBeat?.lat && matchedBeat?.lng) {
                  points.push(getPixelPosition(matchedBeat.lat, matchedBeat.lng));
                }
              }
            });
          }

          // Finally connect to rep current location
          const repPos = getPixelPosition(rep.currentLat, rep.currentLng);
          points.push(repPos);

          const pointsString = points.map((p) => `${p.x},${p.y}`).join(' ');

          return (
            <g key={`path-${rep.officerId}`}>
              {/* Outer stroke glow */}
              {points.length >= 2 && (
                <polyline
                  points={pointsString}
                  fill="none"
                  stroke={isSelected ? '#2563eb' : '#64748b'}
                  strokeWidth={isSelected ? '5' : '3'}
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={isSelected ? 0.85 : 0.45}
                  filter="url(#glow)"
                />
              )}

              {/* Waypoint circles along the path */}
              {points.map((pt, idx) => {
                const isLast = idx === points.length - 1;
                if (isLast) return null; // Last point is the rep itself
                return (
                  <g key={`wpt-${rep.officerId}-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="7"
                      fill="#ffffff"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                    />
                    <text
                      x={pt.x}
                      y={pt.y + 3}
                      textAnchor="middle"
                      fontSize="8"
                      fontWeight="bold"
                      fill="#1e3a8a"
                    >
                      {idx + 1}
                    </text>
                  </g>
                );
              })}

              {/* Active Radar Ping Circle */}
              <circle
                cx={repPos.x}
                cy={repPos.y}
                r="28"
                fill="none"
                stroke={rep.status === 'AT_STORE' ? '#10b981' : '#3b82f6'}
                strokeWidth="1.5"
                strokeOpacity="0.5"
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
              {isVisited ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : isSkipped ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <Store className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-slate-900/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
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
                } ${isSelected ? 'ring-4 ring-emerald-400/60 ring-offset-1' : ''}`}
              >
                <Radio className="w-4 h-4" />
              </div>

              {/* Name Tag Pill */}
              <div className="absolute top-9 bg-slate-950/90 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-800 shadow-md whitespace-nowrap flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{rep.officerName.split(' ')[0]}</span>
                {rep.status === 'AT_STORE' && (
                  <span className="text-emerald-400 font-normal">(@Store)</span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Interactive Popup Card */}
      {activePopup && (
        <div
          style={{
            left: `${Math.min(
              Math.max(activePopup.x, 140),
              dimensions.width - 140
            )}px`,
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
                  <h4 className="font-bold text-xs text-slate-900">
                    {activePopup.rep.officerName}
                  </h4>
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
                    className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
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
                    <Battery className="w-3 h-3 text-emerald-500" /> Battery:
                  </span>
                  <span className="font-semibold text-slate-700 font-mono">
                    {activePopup.rep.batteryLevel}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Distance Today:</span>
                  <span className="font-semibold text-slate-700 font-mono">
                    {activePopup.rep.todayDistanceKm || 0} km
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
              <p className="text-[11px] text-slate-500 line-clamp-2">
                {activePopup.store.address}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Beat Status
                </span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                    activePopup.store.status === 'VISITED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : activePopup.store.status === 'SKIPPED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {activePopup.store.status}
                </span>
              </div>
              {activePopup.store.checkedInAt && (
                <div className="mt-1 text-[10px] text-slate-400">
                  Checked in at: {new Date(activePopup.store.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Map Style Switcher (Street / Satellite / Terrain) */}
      <div className="absolute left-3 top-3 z-30 flex items-center rounded-xl bg-white/95 backdrop-blur-xs p-1 shadow-md border border-slate-200 text-xs font-semibold">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMapStyle('STREET');
          }}
          className={`px-2.5 py-1 rounded-lg transition ${
            mapStyle === 'STREET'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Street
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMapStyle('SATELLITE');
          }}
          className={`px-2.5 py-1 rounded-lg transition ${
            mapStyle === 'SATELLITE'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Satellite
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMapStyle('TOPO');
          }}
          className={`px-2.5 py-1 rounded-lg transition ${
            mapStyle === 'TOPO'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Terrain
        </button>
      </div>

      {/* Floating Map Controls */}
      <div className="absolute right-3 top-3 z-30 flex flex-col gap-1.5 shadow-md">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-xs text-slate-700 hover:text-slate-950 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-xs text-slate-700 hover:text-slate-950 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleFitAll();
          }}
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-xs text-blue-600 hover:text-blue-700 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Fit All Reps &amp; Stores"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleLocateMe();
          }}
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-xs text-indigo-600 hover:text-indigo-700 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Locate My GPS"
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleResetToReps();
          }}
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-xs text-emerald-600 hover:text-emerald-700 hover:bg-white flex items-center justify-center border border-slate-200 active:scale-95 transition"
          title="Center on Sales Reps"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Map Legend & Attribution */}
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
          Map data &copy; OpenStreetMap contributors &bull; Esri
        </div>
      </div>
    </div>
  );
}

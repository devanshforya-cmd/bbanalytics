'use client';

import React, { useState } from 'react';
import { Crosshair, ExternalLink, MapPin, X } from 'lucide-react';
import Portal from '@/components/common/Portal';
import { toast } from '@/components/common/Toast';
import { db } from '@/lib/db/db-service';
import { pinnedLocation } from '@/lib/gps-validation';
import { inNepal, parseCoordinates } from '@/lib/geo-input';

interface Props {
  type: 'RETAILER' | 'BRANCH' | 'DISTRIBUTOR';
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  onClose: () => void;
  onSaved?: () => void;
}

/** Set, correct or remove a store's location after it was created. */
export default function SetLocationModal({ type, id, name, lat, lng, onClose, onSaved }: Props) {
  const pinned = pinnedLocation(lat, lng);
  const [latText, setLatText] = useState(pinned ? String(lat) : '');
  const [lngText, setLngText] = useState(pinned ? String(lng) : '');
  const [paste, setPaste] = useState('');
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const latNum = Number(latText), lngNum = Number(lngText);
  const filled = latText.trim() !== '' && lngText.trim() !== '';
  const valid = filled && Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180 && !(latNum === 0 && lngNum === 0);
  const outside = valid && !inNepal(latNum, lngNum);
  const swappedFits = outside && inNepal(lngNum, latNum);

  const applyPaste = (text: string) => {
    setPaste(text);
    const found = parseCoordinates(text);
    if (found) { setLatText(String(found.lat)); setLngText(String(found.lng)); setAccuracy(null); }
  };
  const locateDevice = () => {
    if (!navigator.geolocation) { toast.error('This device cannot share its location.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLatText(position.coords.latitude.toFixed(7)); setLngText(position.coords.longitude.toFixed(7)); setAccuracy(Math.round(position.coords.accuracy)); setLocating(false); },
      () => { setLocating(false); toast.error('Location not available', 'Allow location for this site, or type or paste the coordinates.'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const save = (clear = false) => {
    try {
      db.setStoreLocation(type, id, clear ? null : { lat: latNum, lng: lngNum });
      toast.success(clear ? `Location removed from ${name}` : `Location saved for ${name}`, clear ? 'Check-in skips the distance check until it is pinned again.' : 'Check-ins and routes use the new pin from now on.');
      onSaved?.(); onClose();
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'Location not saved.'); }
  };

  const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono';
  return (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-labelledby="set-location-title">
      <div className="my-6 w-full max-w-md space-y-4 rounded-2xl bg-white p-5 text-xs shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="set-location-title" className="text-base font-bold text-slate-900">Store location</h3>
            <p className="text-slate-500">{name} · {pinned ? `pinned at ${lat}, ${lng}` : 'no pin yet'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <button type="button" onClick={locateDevice} disabled={locating} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2.5 font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60">
          <Crosshair className="h-4 w-4" />{locating ? 'Finding this device…' : 'Use this device’s location (when at the store)'}
        </button>
        {accuracy !== null && <p className={`text-[11px] ${accuracy > 100 ? 'text-amber-700' : 'text-slate-500'}`}>Accurate to about {accuracy} m{accuracy > 100 ? '. Step outside or wait a moment and try again for a better fix.' : '.'}</p>}

        <label className="block font-semibold text-slate-700">Or paste a Google Maps link or coordinates
          <input value={paste} onChange={(e) => applyPaste(e.target.value)} placeholder="https://maps.google.com/… or 27.7172, 85.3240" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          {paste && !parseCoordinates(paste) && <span className="mt-1 block text-[11px] font-normal text-amber-700">No coordinates found in that. In Google Maps, long-press the store and copy the numbers shown.</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block font-semibold text-slate-700">Latitude<input inputMode="decimal" value={latText} onChange={(e) => { setLatText(e.target.value.trim()); setAccuracy(null); }} placeholder="27.7172" className={field} /></label>
          <label className="block font-semibold text-slate-700">Longitude<input inputMode="decimal" value={lngText} onChange={(e) => { setLngText(e.target.value.trim()); setAccuracy(null); }} placeholder="85.3240" className={field} /></label>
        </div>
        {filled && !valid && <p role="alert" className="text-[11px] font-semibold text-rose-700">Latitude must be between −90 and 90 and longitude between −180 and 180.</p>}
        {outside && (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
            That point is outside Nepal.{swappedFits ? <> Latitude and longitude look swapped. <button type="button" onClick={() => { setLatText(lngText); setLngText(latText); }} className="font-bold underline">Swap them</button></> : ' Check the numbers before saving.'}
          </p>
        )}
        {valid && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${latNum},${lngNum}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
            <MapPin className="h-3.5 w-3.5" />Check this point on Google Maps<ExternalLink className="h-3 w-3" />
          </a>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          {pinned ? <button type="button" onClick={() => save(true)} className="font-semibold text-rose-700 hover:underline">Remove pin</button> : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
            <button type="button" disabled={!valid} onClick={() => save(false)} className="btn btn-primary disabled:opacity-50">Save location</button>
          </div>
        </div>
      </div>
    </div></Portal>
  );
}

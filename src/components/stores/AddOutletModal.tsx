'use client';

import Portal from '@/components/common/Portal';
import { useState } from 'react';
import { X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { validGpsCoordinates } from '@/lib/gps-validation';
import { hasAccess } from '@/lib/permissions';
import { toast } from '@/components/common/Toast';
import SearchSelect from '@/components/common/SearchSelect';
import type { Distributor } from '@/lib/types';

/** Add an outlet (branch) under an MT chain. */
export default function AddOutletModal({ chain, onClose, onSaved }: { chain: Distributor; onClose: () => void; onSaved: () => void }) {
  const officers = db.getUsers().filter((user) => hasAccess(user, 'beat_plans'));
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState(chain.city || 'Kathmandu');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [officerId, setOfficerId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const useGps = () => {
    if (!navigator.geolocation) { toast.error('This browser does not support GPS. Enter the coordinates.'); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      if (position.coords.accuracy > 200) { toast.error('GPS accuracy is too low. Retry outdoors or enter the coordinates.'); return; }
      setLat(String(position.coords.latitude)); setLng(String(position.coords.longitude));
    }, () => toast.error('Location is unavailable. Allow location or enter the coordinates.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !area.trim()) { toast.error('Enter the outlet name and area.'); return; }
    const hasGps = lat !== '' && lng !== '';
    if (hasGps && !validGpsCoordinates(Number(lat), Number(lng))) { toast.error('Those coordinates are not valid.'); return; }
    setSaving(true);
    try {
      const officer = officers.find((user) => user.id === officerId);
      db.addBranch({
        distributorId: chain.id,
        distributorName: chain.name,
        name: name.trim(),
        area: area.trim(),
        city: city.trim(),
        address: address.trim() || `${area.trim()}, ${city.trim()}`,
        lat: hasGps ? Number(lat) : 0,
        lng: hasGps ? Number(lng) : 0,
        assignedOfficerId: officer?.id || '',
        assignedOfficerName: officer?.fullName || '',
        contactName: contactName.trim(),
        contactRole: 'Store Manager',
        contactPhone: contactPhone.trim(),
        contacts: contactName.trim() || contactPhone.trim() ? [{ id: `cnt_${Date.now()}`, name: contactName.trim(), role: 'Store Manager', phone: contactPhone.trim(), isPrimary: true }] : [],
        brandsAvailable: chain.brandsCarried || [],
        defaultMargins: chain.defaultMargins,
      });
      if (!chain.hasBranches) db.updateDistributor(chain.id, { hasBranches: true });
      toast.success(`Outlet "${name.trim()}" added to ${chain.name}.`);
      onSaved();
      onClose();
    } catch (error) {
      toast.error('Outlet not added', error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  const field = 'mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm';
  return (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-labelledby="add-outlet-title">
      <form onSubmit={save} className="my-6 w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 text-xs shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 id="add-outlet-title" className="text-base font-bold text-slate-900">Add outlet to {chain.name}</h3>
            <p className="text-slate-500">Orders, deliveries and counts for this outlet roll up into the chain&apos;s history.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <label className="block font-semibold">Outlet name *<input required value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${chain.name} Naxal`} className={field} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-semibold">Area *<input required value={area} onChange={(e) => setArea(e.target.value)} className={field} /></label>
          <label className="block font-semibold">City<input value={city} onChange={(e) => setCity(e.target.value)} className={field} /></label>
        </div>
        <label className="block font-semibold">Address<input value={address} onChange={(e) => setAddress(e.target.value)} className={field} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-semibold">Latitude<input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className={field} /></label>
          <label className="block font-semibold">Longitude<input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} className={field} /></label>
        </div>
        <button type="button" onClick={useGps} className="w-full rounded-lg border border-slate-300 p-2 font-semibold text-blue-700">Use this device&apos;s GPS (when at the outlet)</button>
        <SearchSelect label="Field officer" options={officers.map((user) => ({ value: user.id, label: user.fullName, hint: user.role }))} value={officerId} onChange={setOfficerId} allowClear clearLabel="Not assigned yet" placeholder="Search staff" />
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-semibold">Contact name<input value={contactName} onChange={(e) => setContactName(e.target.value)} className={field} /></label>
          <label className="block font-semibold">Contact phone<input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" className={field} /></label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-50">Add outlet</button>
        </div>
      </form>
    </div></Portal>
  );
}

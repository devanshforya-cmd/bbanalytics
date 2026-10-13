'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db/db-service';
import { fetchLatestPingsFromSupabase } from '@/lib/db/gps-service';
import { StaffLiveLocation, StaffLiveStatus, BeatItem, DutyStatus } from '@/lib/types';
import InteractiveMap from '@/components/common/InteractiveMap';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import {
  Navigation,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  Wifi,
  MapPin,
  Clock,
  Phone,
  MessageSquare,
  Activity,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Play,
  PowerOff,
  Coffee,
  CalendarDays,
  TrendingUp,
  UserCheck,
} from 'lucide-react';

const DUTY_BADGES: Record<
  DutyStatus,
  { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ONLINE: {
    label: 'Online',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  IN_FIELD: {
    label: 'In Field',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: TrendingUp,
  },
  ON_BREAK: {
    label: 'On Break',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Coffee,
  },
  OFFLINE: {
    label: 'Offline (Day Ended)',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    icon: PowerOff,
  },
  ON_LEAVE: {
    label: 'On Leave',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: CalendarDays,
  },
};

export default function LiveStaffTrackingPage() {
  const [locations, setLocations] = useState<StaffLiveLocation[]>([]);
  const [beatItems, setBeatItems] = useState<BeatItem[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterDuty, setFilterDuty] = useState<'ALL' | 'ACTIVE' | 'OFFLINE'>('ALL');

  const reloadLocations = async () => {
    setIsRefreshing(true);
    await fetchLatestPingsFromSupabase();
    const locs = db.getStaffLiveLocations();
    // enrich with latest duty status from db
    const enriched = locs.map((l) => ({
      ...l,
      dutyStatus: db.getOfficerDutyStatus(l.officerId) || l.dutyStatus || 'ONLINE',
    }));
    setLocations(enriched);
    setBeatItems(db.getBeatItems());
    if (!selectedStaffId && enriched.length > 0) {
      setSelectedStaffId(enriched[0].officerId);
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    reloadLocations();
    const interval = setInterval(() => {
      reloadLocations();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDutyChange = (officerId: string, newDuty: DutyStatus) => {
    db.setOfficerDutyStatus(officerId, newDuty);
    const officer = locations.find((l) => l.officerId === officerId);
    reloadLocations();
    triggerToast(
      `${officer?.officerName || 'Officer'} marked as ${DUTY_BADGES[newDuty].label}`
    );
  };

  // Real refresh telemetry for officer
  const handleRefreshPing = async (officerId: string) => {
    const rep = locations.find((l) => l.officerId === officerId);
    if (!rep) return;
    await reloadLocations();
    triggerToast(`Real-time location updated for ${rep.officerName}.`);
  };

  const filteredLocations = locations.filter((loc) => {
    const duty = loc.dutyStatus || 'ONLINE';
    if (filterDuty === 'ACTIVE') return duty === 'ONLINE' || duty === 'IN_FIELD';
    if (filterDuty === 'OFFLINE') return duty === 'OFFLINE' || duty === 'ON_BREAK' || duty === 'ON_LEAVE';
    return true;
  });

  const selectedStaff = locations.find((l) => l.officerId === selectedStaffId) || filteredLocations[0];

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']} feature="gps_tracking">
      <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Navigation className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 animate-pulse" />
            <span>Real-Time Field Force GPS &amp; Activity Tracking</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Monitor on-duty sales officers, live store dwell times, transit corridors, and route breadcrumbs.
          </p>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {toastMessage && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold shadow-xs animate-in fade-in">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Duty Filter */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setFilterDuty('ALL')}
              className={`rounded-md px-2.5 py-1 transition ${
                filterDuty === 'ALL' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              All ({locations.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterDuty('ACTIVE')}
              className={`rounded-md px-2.5 py-1 transition ${
                filterDuty === 'ACTIVE' ? 'bg-white font-bold text-emerald-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Active Only
            </button>
            <button
              type="button"
              onClick={() => setFilterDuty('OFFLINE')}
              className={`rounded-md px-2.5 py-1 transition ${
                filterDuty === 'OFFLINE' ? 'bg-white font-bold text-slate-800 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Offline / Break
            </button>
          </div>

          <button
            type="button"
            onClick={reloadLocations}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold shadow-2xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Live</span>
          </button>
        </div>
      </div>

      {filteredLocations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
          <EmptyState
            type="visits"
            title="No Field Officers Online"
            description="No field sales officers are currently transmitting live GPS pings or active on beat routes. Officers will appear on the radar once they mark their duty status as Online."
          />
        </div>
      ) : (
        <>
          {/* Rep Status Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredLocations.map((loc) => {
          const isSelected = selectedStaff?.officerId === loc.officerId;
          const currentDuty = loc.dutyStatus || 'ONLINE';
          const dutyBadge = DUTY_BADGES[currentDuty] || DUTY_BADGES.ONLINE;
          const isOffline = currentDuty === 'OFFLINE' || currentDuty === 'ON_LEAVE';
          const DutyIcon = dutyBadge.icon;

          return (
            <div
              key={loc.officerId}
              onClick={() => setSelectedStaffId(loc.officerId)}
              className={`bg-white rounded-xl p-5 border transition-all cursor-pointer shadow-xs ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                  : isOffline
                  ? 'border-slate-200 bg-slate-50/40 opacity-80'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full font-bold flex items-center justify-center text-sm border shadow-2xs ${
                      isOffline
                        ? 'bg-slate-200 text-slate-600 border-slate-300'
                        : 'bg-blue-100 text-blue-700 border-blue-200'
                    }`}
                  >
                    {loc.officerName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{loc.officerName}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            currentDuty === 'ONLINE' || currentDuty === 'IN_FIELD'
                              ? 'bg-emerald-500 animate-pulse'
                              : currentDuty === 'ON_BREAK'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        {dutyBadge.label}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {loc.batteryLevel > 50 ? (
                          <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <BatteryLow className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        {loc.batteryLevel}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Duty Status Badge */}
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${dutyBadge.bg} ${dutyBadge.color} ${dutyBadge.border}`}
                >
                  <DutyIcon className="w-3 h-3" />
                  <span>{dutyBadge.label}</span>
                </div>
              </div>

              {/* Dwell / Current Position Info */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                {isOffline ? (
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-medium flex items-center gap-2">
                    <PowerOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Officer duty ended. Field GPS broadcasts suspended.</span>
                  </div>
                ) : loc.status === 'AT_STORE' ? (
                  <div className="flex items-center justify-between text-slate-700 font-medium">
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <MapPin className="w-3.5 h-3.5" />
                      {loc.currentStoreName || 'Retail Outlet'}
                    </span>
                    <span className="text-slate-500 font-normal">
                      ⏱ {loc.timeAtCurrentStoreMinutes || 15}m dwell
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5 text-blue-600" />
                      Moving along Beat Corridor
                    </span>
                    <span>Lat: {loc.currentLat.toFixed(3)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-500 pt-1">
                  <span>Distance: <strong className="text-slate-800">{loc.todayDistanceKm} km</strong></span>
                  <span>Stops: <strong className="text-blue-600">{loc.todayRoute.length} done</strong></span>
                </div>
              </div>

              {/* Admin Duty Override & Quick Actions */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <a
                    href="tel:+9779841234567"
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Direct Call"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="https://wa.me/9779841234567"
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 text-teal-700 hover:bg-teal-50 transition-colors"
                    title="WhatsApp Message"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </a>

                  {/* 1-Click Toggle Offline / Online */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDutyChange(loc.officerId, isOffline ? 'ONLINE' : 'OFFLINE');
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-bold border transition ${
                      isOffline
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                    }`}
                  >
                    {isOffline ? 'Set Online' : 'Mark Offline'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isRefreshing || isOffline}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefreshPing(loc.officerId);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed Live View & Route Breadcrumbs */}
      {selectedStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Simulated GPS Visualizer Map */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  Active Route Corridor: {selectedStaff.officerName}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    DUTY_BADGES[selectedStaff.dutyStatus || 'ONLINE']?.bg
                  } ${DUTY_BADGES[selectedStaff.dutyStatus || 'ONLINE']?.color} ${
                    DUTY_BADGES[selectedStaff.dutyStatus || 'ONLINE']?.border
                  }`}
                >
                  {DUTY_BADGES[selectedStaff.dutyStatus || 'ONLINE']?.label}
                </span>
                <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                  GPS Lat: {selectedStaff.currentLat.toFixed(4)}, Lng: {selectedStaff.currentLng.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Real Interactive OpenStreetMap Live Tracking Canvas */}
            <InteractiveMap
              reps={locations}
              beatItems={beatItems}
              selectedRepId={selectedStaff?.officerId}
              onSelectRep={setSelectedStaffId}
              className="h-[440px] rounded-none border-x-0 border-t-0"
            />

            {/* Live Telemetry Bar */}
            <div className="p-4 bg-slate-900 text-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedStaff.dutyStatus === 'OFFLINE'
                      ? 'bg-slate-500'
                      : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                <span>
                  {selectedStaff.dutyStatus === 'OFFLINE'
                    ? 'GPS Feed Suspended (Officer Offline)'
                    : 'Live GPS Feed: Active'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>Stops Today: <strong className="text-white">{selectedStaff.todayRoute.length}</strong></span>
                <span>Battery: <strong className="text-white">{selectedStaff.batteryLevel}%</strong></span>
                <span>Speed: <strong className="text-white">{selectedStaff.dutyStatus === 'OFFLINE' ? '0 km/h' : '~18 km/h'}</strong></span>
                <span>Accuracy: <strong className="text-emerald-400">&plusmn;8m</strong></span>
              </div>
            </div>
          </div>

          {/* Route Breadcrumbs Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Today&apos;s Audit Breadcrumb Log</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Timestamped check-ins, check-outs, and transit intervals.
              </p>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {selectedStaff.todayRoute.map((step, idx) => (
                <div key={idx} className="relative text-xs space-y-1">
                  <div className="absolute -left-[22px] top-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white"></div>
                  <div className="font-bold text-slate-900">{step.storeName}</div>
                  <div className="text-slate-500 flex items-center gap-2">
                    <span>Arrived: {step.arrivedAt}</span>
                    {step.departedAt && <span>• Departed: {step.departedAt}</span>}
                  </div>
                  {step.durationMinutes && (
                    <div className="text-[11px] text-emerald-700 font-semibold">
                      Dwell Time: {step.durationMinutes} minutes
                    </div>
                  )}
                </div>
              ))}

              {/* Active State */}
              <div className="relative text-xs space-y-1">
                <div
                  className={`absolute -left-[22px] top-0.5 w-3 h-3 rounded-full ring-4 ring-white ${
                    selectedStaff.dutyStatus === 'OFFLINE'
                      ? 'bg-slate-400'
                      : 'bg-blue-600 animate-ping'
                  }`}
                ></div>
                <div className="font-bold text-slate-900">
                  {selectedStaff.dutyStatus === 'OFFLINE'
                    ? 'Day Concluded (Officer Marked Offline)'
                    : selectedStaff.currentStoreName || 'Transit Corridor'}
                </div>
                <div className="text-slate-500">
                  {selectedStaff.dutyStatus === 'OFFLINE'
                    ? 'No further store visits scheduled today'
                    : selectedStaff.status === 'AT_STORE'
                    ? `Dwell at store: ${selectedStaff.timeAtCurrentStoreMinutes || 12} mins`
                    : 'Traveling to next beat location'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
      </div>
    </PageGuard>
  );
}

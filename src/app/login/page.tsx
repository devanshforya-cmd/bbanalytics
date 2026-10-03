'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, Phone, AlertCircle, ArrowRight, Eye, EyeOff, Sparkles, Mail, Zap, RefreshCw } from 'lucide-react';
import { loginWithMobile, getSessionUser, getRedirectPathForRole } from '@/lib/auth';
import { rateLimitCheck, rateLimitRecordFailure, rateLimitReset, rateLimitClearAll } from '@/lib/rate-limit';

interface QuickAccount {
  name: string;
  roleTitle: string;
  phone: string;
  pass: string;
  color: string;
  badgeBg: string;
  badgeText: string;
}

const QUICK_ACCOUNTS: QuickAccount[] = [
  {
    name: 'Devansh',
    roleTitle: 'Super Admin',
    phone: '9801234567',
    pass: 'admin123',
    color: 'bg-purple-500',
    badgeBg: 'hover:border-purple-400 hover:bg-purple-50/50',
    badgeText: 'text-purple-700',
  },
  {
    name: 'Ravi',
    roleTitle: 'Sales Officer',
    phone: '9841239876',
    pass: 'ravi123',
    color: 'bg-blue-500',
    badgeBg: 'hover:border-blue-400 hover:bg-blue-50/50',
    badgeText: 'text-blue-700',
  },
  {
    name: 'Pooja',
    roleTitle: 'Sales Officer',
    phone: '9841987654',
    pass: 'pooja123',
    color: 'bg-blue-500',
    badgeBg: 'hover:border-blue-400 hover:bg-blue-50/50',
    badgeText: 'text-blue-700',
  },
  {
    name: 'Aayush',
    roleTitle: 'Brand Mgr',
    phone: '9802223344',
    pass: 'forya123',
    color: 'bg-emerald-500',
    badgeBg: 'hover:border-emerald-400 hover:bg-emerald-50/50',
    badgeText: 'text-emerald-700',
  },
  {
    name: 'Sita',
    roleTitle: 'Data Entry',
    phone: '9841778899',
    pass: 'sita123',
    color: 'bg-amber-500',
    badgeBg: 'hover:border-amber-400 hover:bg-amber-50/50',
    badgeText: 'text-amber-700',
  },
  {
    name: 'Suman',
    roleTitle: 'Sales Officer',
    phone: '9841556677',
    pass: 'suman123',
    color: 'bg-blue-500',
    badgeBg: 'hover:border-blue-400 hover:bg-blue-50/50',
    badgeText: 'text-blue-700',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('9801234567');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  // If already logged in, redirect right away
  useEffect(() => {
    const existing = getSessionUser();
    if (existing) {
      window.location.href = getRedirectPathForRole(existing.role);
    }
  }, []);

  // Live Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (lockoutRemaining > 0) return;

    setError(null);
    setLoading(true);

    const clientIdentifier = phone.trim() || 'staff_terminal';
    const check = rateLimitCheck(clientIdentifier);

    if (!check.allowed) {
      const remainingSec = check.retryAfterSeconds || 900;
      setLockoutRemaining(remainingSec);
      setError(`Account temporarily locked. Too many failed attempts. Try again in ${Math.ceil(remainingSec / 60)} minutes.`);
      setLoading(false);
      return;
    }

    try {
      const res = await loginWithMobile(phone, password);
      if (!res.success || !res.user) {
        const failureRecord = rateLimitRecordFailure(clientIdentifier);
        if (failureRecord.remaining <= 2 && failureRecord.remaining > 0) {
          setError(
            `${res.error || 'Authentication failed.'} Warning: ${failureRecord.remaining} attempt${
              failureRecord.remaining === 1 ? '' : 's'
            } remaining before temporary lockout.`
          );
        } else {
          setError(res.error || 'Authentication failed. Please verify credentials.');
        }
        setLoading(false);
      } else {
        rateLimitReset(clientIdentifier);
        const dest = getRedirectPathForRole(res.user.role);
        // Force full page navigation to ensure browser synchronization on mobile
        window.location.href = dest;
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error.');
      setLoading(false);
    }
  };

  const handleDirectLogin = async (account: QuickAccount) => {
    setError(null);
    setLoading(true);
    setActiveAction(account.name);
    setPhone(account.phone);
    setPassword(account.pass);

    rateLimitReset(account.phone);
    rateLimitReset('staff_terminal');
    setLockoutRemaining(0);

    try {
      const res = await loginWithMobile(account.phone, account.pass);
      if (res.success && res.user) {
        const dest = getRedirectPathForRole(res.user.role);
        window.location.href = dest;
      } else {
        setError(res.error || 'Authentication failed.');
        setLoading(false);
        setActiveAction(null);
      }
    } catch (e: any) {
      setError(e?.message || 'Login failed.');
      setLoading(false);
      setActiveAction(null);
    }
  };

  const isEmailInput = phone.includes('@') || /[a-zA-Z]/.test(phone);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between p-4 sm:p-6 selection:bg-blue-500 selection:text-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between max-w-md mx-auto w-full pt-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 font-black text-white text-base tracking-tight">
            BB
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-wide text-slate-900 flex items-center gap-2">
              <span>Brand Bucket Command Center</span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">Field operations &bull; Retailer secondary &bull; Ops telemetry</p>
          </div>
        </div>
        <span className="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold">
          Ops v2.2
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md mx-auto w-full my-auto py-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
          <div className="text-center mb-5">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-1.5">
              Staff Portal Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Tap any test account below for 1-touch sign-in or enter credentials.
            </p>
          </div>

          {/* 1-Tap Quick Demo Accounts Header */}
          <div className="mb-6 p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/80">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-blue-600 fill-blue-600" />
                <span>1-Tap Instant Sign In</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                Ready for Testing
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACCOUNTS.map((acc) => (
                <button
                  key={acc.name}
                  type="button"
                  onClick={() => handleDirectLogin(acc)}
                  disabled={loading}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-200 ${acc.badgeBg} text-left transition-all active:scale-95 shadow-2xs group`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${acc.color} shrink-0`}></span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate leading-tight">{acc.name}</p>
                      <p className={`text-[10px] font-semibold ${acc.badgeText} truncate`}>{acc.roleTitle}</p>
                    </div>
                  </div>
                  {activeAction === acc.name ? (
                    <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Separator */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-medium">
              <span className="bg-white px-3 text-slate-400 text-[11px]">Or Manual Sign In</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
              {lockoutRemaining > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    rateLimitClearAll();
                    setLockoutRemaining(0);
                    setError(null);
                  }}
                  className="mt-1 self-start text-[11px] text-blue-700 font-semibold underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset Lockout Counter
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Phone or Email Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Mobile Number or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono text-xs border-r border-slate-200 pr-2.5">
                  {isEmailInput ? (
                    <Mail className="w-4 h-4 text-blue-600" />
                  ) : (
                    <>
                      <span className="text-blue-600 font-bold mr-1">+977</span>
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                    </>
                  )}
                </div>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9801234567 or email"
                  className={`w-full ${isEmailInput ? 'pl-12' : 'pl-24'} pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium tracking-wide transition-all`}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <span className="text-[11px] text-slate-400">
                  Demo: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">admin123</code>
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading && !activeAction ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Brand Badges Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <span>Supported Brands:</span>
          <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-700 font-medium border border-pink-200">Forya</span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">Pee Safe</span>
          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-200">FURR</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-medium border border-purple-200">Renee</span>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="text-center text-[11px] text-slate-400 max-w-md mx-auto w-full pb-2">
        <p>Brand Bucket Nepal Pvt. Ltd. &bull; Kathmandu, Bagmati Province</p>
      </div>
    </div>
  );
}

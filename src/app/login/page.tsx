'use client';

import BrandLogo from '@/components/layout/BrandLogo';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react';
import { loginWithMobile, getSessionUser, getRedirectPathForUser } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect directly to role landing page
  useEffect(() => {
    const existing = getSessionUser();
    if (existing) {
      window.location.href = getRedirectPathForUser(existing);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!identifier.trim() || !password.trim()) {
      setError('Enter your email or mobile number, and your password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await loginWithMobile(identifier, password);
      if (!res.success || !res.user) {
        setError(res.error || 'That email or number and password don’t match. Check both and try again.');
        setLoading(false);
      } else {
        const dest = getRedirectPathForUser(res.user);
        window.location.href = dest;
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error.');
      setLoading(false);
    }
  };

  const isEmail = identifier.includes('@') || /[a-zA-Z]/.test(identifier);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f5f5f7] text-slate-900">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
        <BrandLogo variant="full" priority className="h-12 sm:h-14" />
        <h1 className="mt-10 text-center text-[28px] font-semibold leading-tight text-slate-900 sm:text-[32px]">Sign in</h1>
        <p className="mt-2 text-center text-[15px] text-slate-500">Use your work email or mobile number.</p>
        

        <form onSubmit={handleLogin} className="mt-8 w-full max-w-[380px]" noValidate>
          {error && (
            <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15">
            <label className="flex items-center gap-3 px-4">
              <span className="sr-only">Email or mobile number</span>
              {isEmail ? <Mail className="h-[18px] w-[18px] shrink-0 text-slate-400" aria-hidden="true" /> : <Phone className="h-[18px] w-[18px] shrink-0 text-slate-400" aria-hidden="true" />}
              <input
                type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Email or mobile number"
                className="h-[52px] w-full bg-transparent text-[16px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:shadow-none"
                required autoFocus
              />
            </label>
            <div className="ml-11 h-px bg-black/[0.08]" />
            <label className="flex items-center gap-3 px-4">
              <span className="sr-only">Password</span>
              <Lock className="h-[18px] w-[18px] shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-[52px] w-full bg-transparent text-[16px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:shadow-none"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="-mr-1 rounded-full p-1.5 text-slate-400 hover:bg-black/[0.04] hover:text-slate-700">
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </label>
          </div>

          <button type="submit" disabled={loading} aria-busy={loading}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[15px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70">
            {loading ? <><span className="bb-spinner" aria-hidden="true" /> Signing in…</> : 'Sign in'}
          </button>
          <p className="mt-4 text-center text-[12px] text-slate-400">You stay signed in for 24 hours on this device.</p>
        </form>
      </div>

      <footer className="pb-6 text-center text-[12px] text-slate-400">Brand Bucket Nepal Pvt. Ltd. · Kathmandu</footer>
    </main>
  );
}

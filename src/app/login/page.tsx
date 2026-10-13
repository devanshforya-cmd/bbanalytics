'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Phone, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
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
      setError('Please provide your email/phone and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await loginWithMobile(identifier, password);
      if (!res.success || !res.user) {
        setError(res.error || 'Invalid credentials. Please verify your email/phone and password.');
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between p-4 sm:p-6 selection:bg-blue-500 selection:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-md mx-auto w-full pt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 font-black text-white text-base tracking-tight">
            BB
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-wide text-slate-900">
              Brand Bucket Command Center
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">Enterprise Field Operations &bull; Secondary Sales Telemetry</p>
          </div>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md mx-auto w-full my-auto py-8">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-1.5">
              Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Enter your credentials to access the operations command center.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email / Mobile Identifier */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Email or Mobile Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  {isEmail ? <Mail className="w-4 h-4 text-blue-600" /> : <Phone className="w-4 h-4 text-blue-600" />}
                </div>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@brandbucket.com or 98XXXXXXXX"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium tracking-wide transition-all"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
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
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 font-medium">
          Operational Intelligence Platform
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="text-center text-[11px] text-slate-400 max-w-md mx-auto w-full pb-3">
        <p>Brand Bucket Nepal Pvt. Ltd. &bull; Kathmandu, Nepal</p>
      </div>
    </div>
  );
}

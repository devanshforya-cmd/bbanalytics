'use client';

import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db/db-service';
import { getRedirectPathForUser } from '@/lib/auth';

export default function NoAccessPage() {
  const user = getSessionUser() || db.getCurrentUser();
  const destination = getRedirectPathForUser(user);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">BB</div>
      <h1 className="text-xl font-bold text-slate-900">Workspace access is not set up</h1>
      <p className="mt-2 text-sm text-slate-500">Ask your administrator to assign your workspace access.</p>
      {destination !== '/no-access' && (
        <Link href={destination} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Continue to your workspace
        </Link>
      )}
    </main>
  );
}

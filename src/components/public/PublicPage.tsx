import Link from 'next/link';
import type { ReactNode } from 'react';

export const CONTACT_EMAIL = 'brandbucketanalytics@gmail.com';

/** Plain public page (about, privacy, terms) that opens without signing in. */
export default function PublicPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-y-auto bg-white text-slate-800">
      <header className="border-b border-slate-200">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 text-sm">
          <Link href="/about" className="mr-auto font-bold text-slate-900">Brand Bucket Analytics</Link>
          <Link href="/privacy" className="text-slate-600 hover:text-slate-900">Privacy</Link>
          <Link href="/terms" className="text-slate-600 hover:text-slate-900">Terms</Link>
          <Link href="/login" className="font-semibold text-blue-700">Sign in</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {updated && <p className="mt-1 text-sm text-slate-500">Last updated {updated}</p>}
        <div className="mt-6 space-y-4 text-[15px] leading-7 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_a]:text-blue-700 [&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200">
        <p className="mx-auto max-w-3xl px-5 py-6 text-sm text-slate-500">Brand Bucket, Kathmandu, Nepal · <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a></p>
      </footer>
    </div>
  );
}

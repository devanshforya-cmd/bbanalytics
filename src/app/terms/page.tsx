import type { Metadata } from 'next';
import PublicPage, { CONTACT_EMAIL } from '@/components/public/PublicPage';

export const metadata: Metadata = { title: 'Terms of use · Brand Bucket Analytics' };

export default function TermsPage() {
  return (
    <PublicPage title="Terms of use" updated="20 November 2026">
      <p>Brand Bucket Analytics is an internal tool of Brand Bucket, Kathmandu, Nepal. It is provided only to Brand Bucket staff and partners given an account by an administrator.</p>
      <h2>Using the app</h2>
      <ul>
        <li>Keep your sign-in details to yourself and use the app only for Brand Bucket work.</li>
        <li>Enter records accurately. Customer and store information you see in the app is confidential and must not be shared outside Brand Bucket.</li>
        <li>Administrators can change or remove accounts and access at any time.</li>
      </ul>
      <h2>Google services</h2>
      <p>When a Google account is connected, the app saves backups, reports and uploads to that account&apos;s Google Drive as described in the <a href="/privacy">privacy policy</a>. Use of Google services is also subject to Google&apos;s own terms.</p>
      <h2>No warranty</h2>
      <p>The app is provided as is. Brand Bucket keeps backups but is not liable for losses caused by outages, errors or misuse.</p>
      <h2>Contact</h2>
      <p>Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </PublicPage>
  );
}

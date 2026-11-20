import type { Metadata } from 'next';
import PublicPage from '@/components/public/PublicPage';

export const metadata: Metadata = { title: 'About · Brand Bucket Analytics' };

export default function AboutPage() {
  return (
    <PublicPage title="Brand Bucket Analytics">
      <p>Brand Bucket Analytics is the internal operations platform of Brand Bucket, a Kathmandu company that runs consumer brands in Nepal. Our team uses it to record online orders, store sales, deliveries, returns, customer feedback and field visits, and to report on them.</p>
      <p>Only staff accounts created by a Brand Bucket administrator can sign in. There is no public sign-up.</p>
      <h2>Google Drive and Sheets</h2>
      <p>An administrator can connect the company&apos;s Google account so the app can save backups and reports to Google Drive and Google Sheets, and keep uploaded documents and photos there. The app can only see and change files it created itself. See the <a href="/privacy">privacy policy</a> for details.</p>
    </PublicPage>
  );
}

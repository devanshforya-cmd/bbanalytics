import type { Metadata } from 'next';
import PublicPage, { CONTACT_EMAIL } from '@/components/public/PublicPage';

export const metadata: Metadata = { title: 'Privacy policy · Brand Bucket Analytics' };

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy policy" updated="20 November 2026">
      <p>This policy covers Brand Bucket Analytics (&quot;the app&quot;), the internal operations platform of Brand Bucket, Kathmandu, Nepal. Only Brand Bucket staff with accounts created by an administrator can use it.</p>

      <h2>What the app stores</h2>
      <ul>
        <li>Staff account details: name, phone number, role and the brands each person works on.</li>
        <li>Business records our team enters: orders, customers&apos; names, phone numbers and delivery addresses, store orders, deliveries, returns, feedback, visits, cheques and tasks.</li>
        <li>For field staff who are on duty and have allowed it on their device, their location during working hours, so managers can see store visits and routes.</li>
      </ul>
      <p>These records are kept in our database (Supabase) and are used only to run Brand Bucket&apos;s business. We do not sell them, share them for advertising, or use them for any other purpose.</p>

      <h2>Google user data</h2>
      <p>An administrator may connect a Google account. The app then asks Google for one permission: <strong>see, edit, create and delete only the specific Google Drive files that this app uses</strong> (the <code>drive.file</code> scope). With it, the app:</p>
      <ul>
        <li>creates a &quot;BB Analytics&quot; folder in that Drive;</li>
        <li>saves hourly backup workbooks of the app&apos;s own business records into a &quot;Backups&quot; folder there, and moves older backups to Drive&apos;s trash;</li>
        <li>writes reports into a Google Sheets workbook it created;</li>
        <li>stores documents and photos staff upload in the app.</li>
      </ul>
      <p>The app cannot see any other file in the Drive. It reads the connected account&apos;s email address and name only to show which account is connected. Google data is used only for these features. It is not sold, not used for advertising, not shared with anyone outside Brand Bucket, and not used to train AI models.</p>
      <p>Brand Bucket Analytics&apos; use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <p>The Google sign-in token is stored encrypted on our server. An administrator can remove the connection in the app at any time (Settings → Google Sheets &amp; Drive), and you can also remove the app&apos;s access at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>. Files already saved to Drive stay there until you delete them.</p>

      <h2>Keeping data safe</h2>
      <p>Access to the app requires a staff account, and each person only sees the brands and pages their role allows. Connections are encrypted (HTTPS).</p>

      <h2>Keeping and deleting data</h2>
      <p>Business records are kept for as long as Brand Bucket needs them for its operations and accounts. Hourly backups are kept for 48 hours, then one per day for 30 days. To ask about, correct or delete information about you, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top of this page changes with it.</p>
    </PublicPage>
  );
}

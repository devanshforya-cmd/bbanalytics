import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import AppShell from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Brand Bucket',
  description: 'Operational intelligence & field sales force management for Brand Bucket Nepal',
  manifest: '/manifest.json',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Brand Bucket',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fafafa',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                window.addEventListener('error', function(e) {
                  if (e.filename && (e.filename.indexOf('chrome-extension://') !== -1 || e.filename.indexOf('moz-extension://') !== -1 || e.filename.indexOf('extension') !== -1)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    return true;
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  var reason = (e && e.reason) ? (e.reason.stack || String(e.reason)) : '';
                  if (reason.indexOf('chrome-extension://') !== -1 || reason.indexOf('moz-extension://') !== -1) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    return true;
                  }
                }, true);
              })();
            `,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#fafafa" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@raha/ui/styles.css';
import { ToastProvider } from '@raha/ui';
import { fontVariables } from '@/lib/fonts';

export const metadata: Metadata = {
  title: { default: 'Raha Operations', template: '%s · Raha Ops' },
  description: 'Internal control room for Raha Operations.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { themeColor: '#0F0E13' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="theme-ops" style={{ minHeight: '100vh' }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

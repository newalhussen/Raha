import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@raha/ui/styles.css';
import { ToastProvider } from '@raha/ui';
import { fontVariables } from '@/lib/fonts';

export const metadata: Metadata = {
  title: { default: 'Raha — Every truck on the road has room', template: '%s · Raha' },
  description: 'Raha matches cargo with trucks already heading your way, and with empty return legs. Freight for Ethiopia.',
  applicationName: 'Raha',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#15141A', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

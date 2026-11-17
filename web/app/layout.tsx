import type { Metadata, Viewport } from 'next';
import { SWRegister } from '@/components/SWRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Тармақ',
  description: 'Ш. Уәлиханов атындағы КУ жанындағы көпсалалы колледждің ішкі желісі',
  manifest: '/manifest.json',
  applicationName: 'Тармақ',
  appleWebApp: { capable: true, title: 'Тармақ', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  other: { 'mobile-web-app-capable': 'yes', 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // контент под «чёлкой» iPhone, отступы через env(safe-area-inset-*)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101010' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="kk" suppressHydrationWarning>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Shell } from '@/components/shell';
import { WorkoutProvider } from '@/components/workout-provider';
import './globals.css';
export const metadata: Metadata = {
  title: 'Stillform · Adaptive Training',
  description:
    'Explainable training, recovery and performance. Local demo foundation.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Stillform', statusBarStyle: 'default' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#244f46',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WorkoutProvider>
          <Shell>{children}</Shell>
        </WorkoutProvider>
      </body>
    </html>
  );
}

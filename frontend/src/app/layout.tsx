import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AuthProvider } from '../components/auth/auth-provider';
import { AppShell } from '../components/layout/AppShell';

export const metadata: Metadata = {
  title: 'PrioraScan',
  description: 'AI-powered automotive diagnostic assistant',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}

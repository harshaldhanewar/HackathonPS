import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HackSys AI — Incident Assistant',
  description: 'AI-powered incident monitoring, root cause analysis, and self-healing platform',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0d14] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

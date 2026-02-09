import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from './components/ToastProvider';

export const metadata: Metadata = {
  title: "TaskFlow",
  description: "Todo and Calendar Planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Avoid `next/font/google` so `next build` works in network-restricted environments. */}
      <body className="antialiased">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

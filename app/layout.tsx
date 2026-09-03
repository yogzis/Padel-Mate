import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Padel Mate',
  description: 'Live Padel scoring, activity sessions, and group leaderboards.',
  openGraph: {
    title: 'Padel Mate',
    description: 'Live Padel scoring, shared activity sessions, and exact four-player group leaderboards.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1536,
        height: 1024,
        alt: 'Padel Mate live scoreboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Padel Mate',
    description: 'Live Padel scoring, shared activity sessions, and exact four-player group leaderboards.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

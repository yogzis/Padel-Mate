import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { copy } from '../copy';
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
  title: copy.meta.title,
  description: copy.meta.description,
  openGraph: {
    title: copy.meta.openGraphTitle,
    description: copy.meta.openGraphDescription,
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1536,
        height: 1024,
        alt: copy.meta.openGraphImageAlt,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: copy.meta.twitterTitle,
    description: copy.meta.twitterDescription,
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

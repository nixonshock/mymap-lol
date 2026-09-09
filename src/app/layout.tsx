import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mymap.lol — own the Malaysia map",
  description:
    "A public map where organizations stake Malaysia's states. Your rank is your total stake — claim a state, stake to climb, top up to take #1.",
  openGraph: {
    title: "mymap.lol — own the Malaysia map",
    description:
      "A public map where organizations stake Malaysia's states. Your rank is your total stake.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "mymap.lol — own the Malaysia map",
    description:
      "A public map where organizations stake Malaysia's states. Your rank is your total stake.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}

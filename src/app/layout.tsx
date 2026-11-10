import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wisdom Land Academy | Grades 1–8",
  description: "Discover Wisdom Land Academy, Grades 1–8, and browse the public school digital library.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WLA Library",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/images/wla-emblem.png",
    apple: "/images/wla-emblem.png",
  },
};

// iPad/iPhone safe-area handling requires viewport-fit=cover, otherwise
// env(safe-area-inset-*) resolves to 0 on iOS and notches/home indicators
// overlap the UI.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#001030",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

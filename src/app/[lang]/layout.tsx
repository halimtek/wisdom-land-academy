import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/client";
import { LOCALES, LOCALE_INFO, isLocale, localePath } from "@/i18n/locales.mjs";
import { getMessages } from "@/i18n/server";
import "../globals.css";

// Every page exists in English, Amharic, Afaan Oromo and Arabic (/en, /am, /om, /ar).
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = await getMessages(lang);
  return {
    title: m.meta.title,
    description: m.meta.description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: m.meta.libraryAppTitle,
      statusBarStyle: "default",
    },
    icons: {
      icon: "/images/wla-emblem.png",
      apple: "/images/wla-emblem.png",
    },
    // Tell search engines about the same page in the other languages.
    alternates: { languages: Object.fromEntries(LOCALES.map((code) => [code, localePath(code, "/")])) },
  };
}

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

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const messages = await getMessages(lang);
  return (
    <html lang={lang} dir={LOCALE_INFO[lang].dir}>
      <body>
        <I18nProvider locale={lang} messages={messages}>{children}</I18nProvider>
      </body>
    </html>
  );
}

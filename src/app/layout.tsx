import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const display = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

const text = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "FloorDrop · NYU food, brought to your floor", template: "%s · FloorDrop" },
  description:
    "Order pickup from spots near your dorm. A verified NYU student grabs it and brings it up to your floor. Small fee, no awkward lobby wait.",
  applicationName: "FloorDrop",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FloorDrop", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4EFE6" },
    { media: "(prefers-color-scheme: dark)", color: "#15130F" },
  ],
};

// Applies the saved theme before paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem('fd-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

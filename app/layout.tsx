import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./components.css";
import "./shell.css";
import "./home.css";
import "./refined.css";
export const metadata: Metadata = {
  title: "DayHub — Your day. One place.",
  description:
    "A little more clarity. Your day, tasks, spending and price watch in one personal space.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DayHub",
  },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#17151f" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f9" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

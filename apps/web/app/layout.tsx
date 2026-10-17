import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrivatePath",
  description: "Discover, control, and remove your own publicly available personal data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3 focus:bg-white">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

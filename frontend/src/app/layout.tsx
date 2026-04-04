import type { Metadata } from "next";
import { PlayerProvider } from "@/lib/PlayerContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archive - Cyber-Organic DJ Workspace",
  description: "Next gen music workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen w-full flex-col bg-background-light overflow-hidden text-black">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}

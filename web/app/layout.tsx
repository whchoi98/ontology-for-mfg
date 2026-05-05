// web/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AMZN Tech Ontology Demo",
  description: "Hi-Tech MFG knowledge graph + AgentCore + Neptune",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="font-sans">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css" />
      </head>
      <body className="bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}

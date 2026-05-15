import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

import { PersonaProvider } from '@/lib/persona-context';
import LayoutShell from '@/components/LayoutShell';

// Pretendard isn't on Google Fonts and the GitHub release ZIP exceeds
// CDN limits — using Noto Sans KR (Google Fonts CDN-friendly) for reliable
// builds. Replace with Pretendard via next/font/local once font CDN is set up.
const pretendard = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-pretendard',
});

export const metadata: Metadata = {
  title: 'Ontology MFG — AMZN Tech Hi-Tech 데모',
  description: 'AWS Bedrock + AgentCore + Neptune 기반 의미 검색 / 대화형 에이전트 / 12 시나리오 × 5 페르소나',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} dark`}>
      <body className="font-sans antialiased h-screen overflow-hidden bg-ink-950 text-ink-200">
        <PersonaProvider>
          {/* LayoutShell branches on pathname: /manny renders a minimal
              chrome-free shell (chat-only popup); other paths render the
              standard 3-zone shell with Sidebar + top bar + FloatingChat. */}
          <LayoutShell>{children}</LayoutShell>
        </PersonaProvider>
      </body>
    </html>
  );
}

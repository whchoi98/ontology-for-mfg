import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

import { PersonaProvider } from '@/lib/persona-context';
import { Sidebar } from '@/components/Sidebar';
import { PersonaSwitch } from '@/components/PersonaSwitch';
import { GuidedTour } from '@/components/GuidedTour';
import FloatingChat from '@/components/FloatingChat';

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
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {/* Top bar — fixed-height flex sibling (not absolute) so it
                  reserves vertical space and never overlaps page headers
                  like ScenarioHeader. Pattern mirrored from ontology-for-gcc. */}
              <div className="flex items-center justify-end gap-3 px-6 h-12 bg-ink-950/85 backdrop-blur border-b border-ink-800/60 shrink-0">
                <GuidedTour />
                <PersonaSwitch />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {children}
              </div>
            </main>
          </div>
          {/* Manny — global floating chatbot, available on every page. */}
          <FloatingChat />
        </PersonaProvider>
      </body>
    </html>
  );
}

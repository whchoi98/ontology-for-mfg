// web/components/GuidedTour.tsx
"use client";
import { useState } from "react";

const STEPS = [
  { title: "AMZN Tech 데모", body: "한국 Hi-Tech MFG 시나리오 12개를 5명의 페르소나 시점에서 시연합니다." },
  { title: "페르소나 전환", body: "상단 토글로 Buyer/Engineer/Quality/SCM/Plant 화면을 전환." },
  { title: "Wow 모먼트", body: "A 검색 → B 대화(Memory+Guardrails) → H lane reroute → J 8D 자동 작성." },
];

export function GuidedTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg">
        ❓ 가이드
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-[480px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">{STEPS[i].title}</h3>
            <p className="mt-2 text-sm text-neutral-700">{STEPS[i].body}</p>
            <div className="flex justify-between mt-4">
              <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>← 이전</button>
              <span className="text-xs text-neutral-500">{i + 1}/{STEPS.length}</span>
              {i < STEPS.length - 1
                ? <button onClick={() => setI(i + 1)}>다음 →</button>
                : <button onClick={() => setOpen(false)} className="text-blue-600">닫기</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

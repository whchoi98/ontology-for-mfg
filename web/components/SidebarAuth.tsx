'use client';

// Sidebar footer auth widget — fetches /api/auth/whoami to determine login state.
// Reads mfg_id_token cookie presence via whoami endpoint response.

import { useEffect, useState } from 'react';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

type Whoami =
  | { authenticated: true; email?: string; sub?: string; username?: string }
  | { authenticated: false };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export function SidebarAuth() {
  const [me, setMe] = useState<Whoami | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/auth/whoami`, { credentials: 'include' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({ authenticated: false }));
        if (!cancelled) setMe(body as Whoami);
      })
      .catch(() => { if (!cancelled) setMe({ authenticated: false }); });
    return () => { cancelled = true; };
  }, []);

  if (!me) {
    return (
      <div className="border-t border-ink-700 px-4 py-3 text-xs text-ink-500 italic">
        세션 확인 중…
      </div>
    );
  }

  if (!me.authenticated) {
    return (
      <div className="border-t border-ink-700 p-3">
        <a
          href={`${API_BASE}/api/auth/login`}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md bg-accent-500 text-ink-950 text-xs font-semibold hover:bg-accent-400 transition"
        >
          <LogIn className="w-3.5 h-3.5" />
          로그인
        </a>
      </div>
    );
  }

  const label = me.email || me.username || me.sub || 'authenticated';
  return (
    <div className="border-t border-ink-700 p-3 space-y-2">
      <div className="flex items-center gap-2 px-1 min-w-0">
        <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
          <UserIcon className="w-3.5 h-3.5 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-ink-400 leading-tight">로그인됨</div>
          <div className="text-xs text-ink-100 font-medium truncate" title={label}>{label}</div>
        </div>
      </div>
      <a
        href={`${API_BASE}/api/auth/logout`}
        className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md border border-ink-700 bg-ink-800 text-ink-200 text-xs hover:border-rose-500/40 hover:text-rose-300 transition"
      >
        <LogOut className="w-3.5 h-3.5" />
        로그아웃
      </a>
    </div>
  );
}

'use client';
import { Heart, Home, Plus, Search, User } from 'lucide-react';
import { useApp } from '@/lib/store';

const ITEMS = [['home', Home], ['search', Search], ['plus', Plus], ['notif', Heart], ['me', User]] as const;

export function BottomNav() {
  const { tab, stack, go, setComposer, unread, t, me } = useApp();
  return (
    <nav className="nav"><div className="in">
      {ITEMS.map(([k, Ic]) => {
        if (k === 'plus') return <button key={k} className="plusb" aria-label={t('newThread')} disabled={!me} onClick={() => setComposer({})}><Ic size={24} strokeWidth={2.2} /></button>;
        const on = !stack.length && tab === k;
        return (
          <button key={k} className={on ? 'on' : ''} aria-label={k} onClick={() => go.tab(k)}>
            <Ic size={26} strokeWidth={on ? 2.4 : 1.9} fill={k === 'notif' && on ? 'currentColor' : 'none'} />
            {k === 'notif' && unread && <span className="dot" />}
          </button>
        );
      })}
    </div></nav>
  );
}

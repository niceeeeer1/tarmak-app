'use client';
import { EyeOff, Plus, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useApp } from '@/lib/store';
import { fmtDate } from '@/lib/utils';
import type { Role } from '@/lib/types';

/** Знак «Тармақ» — ветка (своя иконка, не логотип Meta). */
export function Logo({ size = 30, stroke = 2.3 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22V10" /><path d="M12 14c0-4.2 3.2-6.8 7.5-6.8" /><path d="M12 10c0-3.6-2.7-6-6.5-6" />
      <circle cx="19.5" cy="7.2" r="1.3" fill="currentColor" /><circle cx="5.5" cy="4" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function VBadge({ role, size = 15 }: { role?: Role; size?: number }) {
  if (role !== 'teacher' && role !== 'admin') return null;
  const c = role === 'teacher' ? 'var(--verified)' : 'var(--official)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="verified" style={{ flex: 'none' }}>
      <path fill={c} d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Avatar({ uid, anon, size = 36, plus }: { uid: string | null; anon?: boolean; size?: number; plus?: boolean }) {
  const { users, go, act } = useApp();
  const u = uid ? users[uid] : null;
  if (anon || !u) return <div className="av anon" style={{ width: size, height: size }}><EyeOff size={size * 0.48} /></div>;
  const ini = u.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <div className="av" role="link" tabIndex={0} aria-label={u.name}
      onClick={(e: MouseEvent) => { e.stopPropagation(); go.profile(u.id); }}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(140deg,hsl(${u.hue} 72% 62%),hsl(${(u.hue + 38) % 360} 66% 44%))` }}>
      {u.role === 'admin' ? <Logo size={size * 0.55} stroke={2.4} /> : ini}
      {plus && (
        <button className="plus" aria-label="follow" onClick={e => { e.stopPropagation(); act.follow(u.id); }}>
          <Plus size={11} strokeWidth={3.2} />
        </button>
      )}
    </div>
  );
}

export function useAgo() {
  const { t, lang, now } = useApp();
  return (ts: number) => {
    const s = (now - ts) / 1000;
    if (s < 60) return t('justNow');
    const m = s / 60; if (m < 60) return Math.floor(m) + ' ' + t('min');
    const h = m / 60; if (h < 24) return Math.floor(h) + ' ' + t('h');
    const d = h / 24; if (d < 7) return Math.floor(d) + ' ' + t('d');
    return fmtDate(ts, lang);
  };
}

const TOKEN_RE = /(#[\p{L}\p{N}_]+|@[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/u;
/** Кликабельные #хэштеги и @упоминания */
export function RichText({ text }: { text: string }) {
  const { go } = useApp();
  const parts = (text || '').split(TOKEN_RE);
  return (
    <>
      {parts.map((p, i) => i % 2 === 1
        ? <a key={i} className="tag" role="link" tabIndex={0} onClick={e => { e.stopPropagation(); p[0] === '#' ? go.search(p) : go.handle(p.slice(1)); }}>{p}</a>
        : p)}
    </>
  );
}

/** Карусель фото как в Threads. src — ссылка Google Диска или data URL (пока идёт загрузка). */
export function Photos({ images, onRemove }: { images: string[]; onRemove?: (i: number) => void }) {
  if (!images?.length) return null;
  return (
    <div className={'photos' + (images.length === 1 ? ' one' : '')} onClick={e => e.stopPropagation()}>
      {images.map((src, i) => (
        <div key={i} className="photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
          {onRemove && <button className="x" aria-label="remove" onClick={() => onRemove(i)}><X size={14} strokeWidth={2.6} /></button>}
        </div>
      ))}
    </div>
  );
}

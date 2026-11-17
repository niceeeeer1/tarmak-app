'use client';
import { Copy, LayoutDashboard, Link2, LogOut, Quote, RefreshCw, Repeat2, ShieldCheck, Trash2 } from 'lucide-react';
import { DEMO } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import { pad } from '@/lib/utils';
import { RoleSwitch } from './Profile';

export function Sheets() {
  const { sheet, setSheet, posts, users, t, me, role, act, setComposer, lang, setLang, theme, setTheme, go, refresh } = useApp();
  if (!sheet) return null;
  const close = () => setSheet(null);
  const p = 'id' in sheet ? posts.find(x => x.id === sheet.id) : undefined;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  let body: React.ReactNode = null;

  if (sheet.kind === 'repost' && p) {
    const mine = !!me && p.repostedBy.includes(me.id);
    body = (
      <div className="menu">
        <button onClick={() => { act.repost(p); close(); }} style={mine ? { color: 'var(--bad)' } : undefined}>{mine ? t('removeRepost') : t('repost')}<Repeat2 size={20} /></button>
        <button onClick={() => { close(); setComposer({ quoteId: p.id }); }}>{t('quote')}<Quote size={20} /></button>
      </div>
    );
  }
  if (sheet.kind === 'share' && p) {
    const link = `${origin}/?p=${p.id}`;
    const author = p.anon || !p.authorId ? t('anon') : users[p.authorId]?.name;
    const card = (p.ticket ? `${pad(p.ticket.num)} · ${t(('st_' + p.ticket.status) as TKey)}\n` : '') + `${author}: ${p.text}\n${link}`;
    body = (<>
      <div className="sh-title" style={{ wordBreak: 'break-all', color: 'var(--muted)', fontWeight: 500, fontSize: 13 }}>{link}</div>
      <div className="menu">
        <button onClick={() => { act.copy(link, t('linkCopied')); close(); }}>{t('copyLink')}<Link2 size={20} /></button>
        <button onClick={() => { act.copy(card, t('cardCopied')); close(); }}>{t('sendCard')}<Copy size={20} /></button>
      </div>
    </>);
  }
  if (sheet.kind === 'more' && p) {
    body = (
      <div className="menu">
        <button onClick={() => { act.copy(`${origin}/?p=${p.id}`, t('linkCopied')); close(); }}>{t('copyLink')}<Link2 size={20} /></button>
        {role === 'admin' && p.ticket && <button onClick={() => { close(); go.post(p.id); }}>{t('openAdmin')}<ShieldCheck size={20} /></button>}
        {(role === 'admin' || p.mine) && <button className="danger" onClick={() => { act.deletePost(p); close(); }}>{t('delete')}<Trash2 size={20} /></button>}
      </div>
    );
  }
  if (sheet.kind === 'settings') {
    body = (<>
      <div className="sh-title">{t('settings')}</div>
      <span className="lbl">{t('language')}</span>
      <div className="seg"><button className={lang === 'kz' ? 'on' : ''} onClick={() => setLang('kz')}>Қазақша</button><button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>Русский</button></div>
      <span className="lbl">{t('theme')}</span>
      <div className="seg">{(['system', 'light', 'dark'] as const).map(k => <button key={k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>{t(k)}</button>)}</div>
      {DEMO && <><span className="lbl">{t('demoRole')}</span><RoleSwitch /></>}
      <div style={{ height: 14 }} />
      <div className="menu">
        {role === 'admin' && <button onClick={() => { close(); go.admin(); }}>{t('adminPanel')}<LayoutDashboard size={20} /></button>}
        <button onClick={() => { refresh(); close(); }}>{t('retry')}<RefreshCw size={20} /></button>
        <button className="danger" onClick={() => { act.logout(); close(); }}>{t('logout')}<LogOut size={20} /></button>
      </div>
    </>);
  }
  if (!body) return null;
  return (<>
    <div className="scrim" onClick={close} />
    <div className="sheet" role="dialog" aria-modal="true"><div className="grab" />{body}</div>
  </>);
}

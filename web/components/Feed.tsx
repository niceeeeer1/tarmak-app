'use client';
import { LayoutDashboard, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import { FeedItem } from './PostCard';
import { Logo } from './ui';

const TABS = ['all', 'talk', 'idea', 'complaint', 'lost'] as const;

export function LangSwitch() {
  const { lang, setLang } = useApp();
  return (
    <div className="lang" role="group" aria-label="language">
      <button className={lang === 'kz' ? 'on' : ''} onClick={() => setLang('kz')}>ҚАЗ</button>
      <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУС</button>
    </div>
  );
}

export function Feed() {
  const { posts, t, feedTab, setFeedTab, theme, setTheme, role, go } = useApp();
  const [sysDark, setSysDark] = useState(false);
  useEffect(() => { setSysDark(window.matchMedia('(prefers-color-scheme: dark)').matches); }, []);
  const dark = theme === 'dark' || (theme === 'system' && sysDark);
  const top = posts.filter(p => !p.chainOf);
  const items = (feedTab === 'all' ? top : top.filter(p => p.type === feedTab)).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="top">
        <div className="bar">
          <div className="l">
            <button className="ib" aria-label="theme" onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={21} /> : <Moon size={21} />}</button>
            {role === 'admin' && <button className="ib" aria-label={t('adminPanel')} onClick={go.admin}><LayoutDashboard size={21} /></button>}
          </div>
          <div className="logo" title="Тармақ"><Logo /></div>
          <div className="r"><LangSwitch /></div>
        </div>
        <nav className="tabs">
          {TABS.map(k => <button key={k} className={feedTab === k ? 'on' : ''} onClick={() => setFeedTab(k)}>{k === 'all' ? t('all') : t(('tab_' + k) as TKey)}</button>)}
        </nav>
      </div>
      {items.map(p => <FeedItem key={p.id} p={p} />)}
      {!items.length && <div className="empty">—</div>}
    </div>
  );
}

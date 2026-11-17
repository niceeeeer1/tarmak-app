'use client';
import { Search as SearchIcon, X } from 'lucide-react';
import { useMemo } from 'react';
import { useApp } from '@/lib/store';
import type { User } from '@/lib/types';
import { FeedItem, PostCard } from './PostCard';
import { Avatar, VBadge } from './ui';

/** Поиск: посты, #хэштеги, люди, кабинеты (204) и номера заявок (#0042). */
export function Search() {
  const { posts, users, query, setQuery, t, go, me, act } = useApp();
  const q = query.trim();
  const top = posts.filter(p => p.type !== 'repost');
  const res = useMemo(() => {
    if (!q) return null;
    const ql = q.toLowerCase();
    const num = /^#?\d{1,4}$/.test(q) ? parseInt(q.replace('#', ''), 10) : null;
    const tickets = num !== null ? top.filter(p => p.ticket?.num === num) : [];
    const roomQ = q.replace('#', '').toLowerCase();
    const rooms = /^#?\d{2,4}$/.test(q) ? top.filter(p => p.ticket && (p.ticket.room || '').toLowerCase().includes(roomQ) && !tickets.includes(p)) : [];
    const uq = ql.replace(/^@/, '');
    const people = Object.values(users).filter(u => u.name.toLowerCase().includes(uq) || u.handle.toLowerCase().includes(uq));
    const found = top.filter(p => !tickets.includes(p) && !rooms.includes(p) && p.text.toLowerCase().includes(ql)).sort((a, b) => b.createdAt - a.createdAt);
    return { tickets, rooms, people, found };
  }, [q, posts, users]); // eslint-disable-line react-hooks/exhaustive-deps

  const tags = useMemo(() => {
    const m: Record<string, number> = {};
    posts.forEach(p => (p.text.match(/#[\p{L}_][\p{L}\p{N}_]*/gu) || []).forEach(h => { const k = h.toLowerCase(); m[k] = (m[k] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [posts]);

  const URow = ({ u }: { u: User }) => {
    const f = !!me?.following.includes(u.id);
    return (
      <div className="urow" onClick={() => go.profile(u.id)}>
        <Avatar uid={u.id} />
        <div className="ui"><div className="un">{u.name}<VBadge role={u.role} size={14} /></div><div className="us">@{u.handle} · {u.group}</div></div>
        {me && u.id !== me.id && <button className={'btn sm' + (f ? '' : ' pri')} onClick={e => { e.stopPropagation(); act.follow(u.id); }}>{f ? t('following') : t('follow')}</button>}
      </div>
    );
  };

  return (
    <div className="view">
      <div className="top" style={{ paddingTop: 8 }}>
        <div className="title" style={{ fontSize: 26, padding: '6px 0 2px' }}>{t('search')}</div>
        <div className="sbox"><SearchIcon size={18} />
          <input id="searchInput" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchPh')} autoComplete="off" />
          {query && <button onClick={() => setQuery('')} aria-label="clear"><X size={16} /></button>}
        </div>
      </div>
      {!res && (<>
        <div className="sh">{t('trending')}</div>
        {tags.map(([h, n]) => <button key={h} className="trow" onClick={() => setQuery(h)}><b>{h}</b><span>{n} {t('postsN')}</span></button>)}
        <div className="sh">{t('suggested')}</div>
        {Object.values(users).filter(u => u.id !== me?.id).slice(0, 5).map(u => <URow key={u.id} u={u} />)}
      </>)}
      {res && (<>
        {res.tickets.length > 0 && <><div className="sh">{t('tickets')}</div>{res.tickets.map(p => <FeedItem key={p.id} p={p} />)}</>}
        {res.rooms.length > 0 && <><div className="sh">{t('rooms')}</div>{res.rooms.map(p => <FeedItem key={p.id} p={p} />)}</>}
        {res.people.length > 0 && <><div className="sh">{t('people')}</div>{res.people.map(u => <URow key={u.id} u={u} />)}</>}
        {res.found.length > 0 && <><div className="sh">{t('posts')}</div>{res.found.map(p => <div key={p.id} className="item"><PostCard post={p} /></div>)}</>}
        {!res.tickets.length && !res.rooms.length && !res.people.length && !res.found.length && <div className="empty">{t('noResults')}</div>}
      </>)}
    </div>
  );
}

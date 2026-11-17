'use client';
import { Box, Clock, Heart, Megaphone, MessageCircle, Pin, Quote, Repeat2, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TONE } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { NotifType } from '@/lib/types';
import { pad } from '@/lib/utils';
import { Avatar, useAgo } from './ui';

const BADGE: Record<NotifType, [typeof Heart, string]> = {
  like: [Heart, 'var(--like)'], reply: [MessageCircle, 'var(--link)'], repost: [Repeat2, 'var(--ok)'], quote: [Quote, 'var(--ok)'],
  follow: [UserPlus, '#7c3aed'], status: [Clock, 'var(--warn)'], official: [Pin, 'var(--official)'], ticket: [Megaphone, 'var(--warn)'], confirm: [ShieldCheck, 'var(--info)'],
};

export function Notifications() {
  const { notifications, users, posts, t, go, act } = useApp();
  const ago = useAgo();
  const [f, setF] = useState<'all' | 'replies' | 'tickets'>('all');
  // помечаем прочитанными при уходе с экрана, чтобы точки «новое» успели показаться
  useEffect(() => () => act.markRead(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = notifications
    .filter(n => f === 'all' || (f === 'replies' ? n.type === 'reply' : ['status', 'official', 'ticket', 'confirm'].includes(n.type)))
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="view">
      <div className="top" style={{ paddingTop: 8 }}>
        <div className="title" style={{ fontSize: 26, padding: '6px 0 2px' }}>{t('activity')}</div>
        <div className="fchips">{(['all', 'replies', 'tickets'] as const).map(k => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{t(('f_' + k) as TKey)}</button>)}</div>
      </div>
      {list.map(n => {
        const p = n.postId ? posts.find(x => x.id === n.postId) : undefined;
        const [Ic, col] = BADGE[n.type] || BADGE.like;
        const from = n.fromId ? users[n.fromId] : undefined;
        const sys = n.type === 'status' || n.type === 'ticket';
        const num = p?.ticket?.num || n.payload.num;
        return (
          <div key={n.id} className={'nrow' + (n.read ? '' : ' unread')} onClick={() => (p ? go.post(p.id) : from && go.profile(from.id))}>
            <div style={{ position: 'relative' }}>
              {sys ? <div className="av anon" style={{ width: 36, height: 36 }}>{p?.type === 'lost' ? <Box size={18} /> : <Megaphone size={18} />}</div> : <Avatar uid={from?.id || null} anon={!from} />}
              <span className="nb" style={{ background: col }}><Ic size={10} strokeWidth={2.8} fill={n.type === 'like' ? 'currentColor' : 'none'} /></span>
            </div>
            <div className="ntx">
              {sys || n.type === 'official'
                ? <><b>{t(('n_' + n.type) as TKey)}</b>{num ? <> · {pad(num)}</> : null} <span className="time">{ago(n.createdAt)}</span>
                    {n.type === 'status' && n.payload.status && <div className="chips"><span className={'chip ' + TONE[n.payload.status]}>{t(('st_' + n.payload.status) as TKey)}</span></div>}</>
                : <><b>{from ? from.name : t('anon')}</b> {t(('n_' + n.type) as TKey)} <span className="time">{ago(n.createdAt)}</span></>}
              {p && <div className="ns">{n.type === 'official' && p.ticket?.official ? p.ticket.official.text : p.text}</div>}
            </div>
          </div>
        );
      })}
      {!list.length && <div className="empty">{t('noNotif')}</div>}
    </div>
  );
}

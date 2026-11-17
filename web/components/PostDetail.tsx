'use client';
import { Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import type { Comment } from '@/lib/types';
import { CommentCard, ThreadBlock } from './PostCard';
import { OfficialReply } from './PostParts';
import { SubBar } from './SubBar';
import { TicketAdmin } from './TicketAdmin';
import { Avatar } from './ui';

export function PostDetail({ id, focus }: { id: string; focus?: boolean }) {
  const { posts, comments, users, t, me, act, role } = useApp();
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [txt, setTxt] = useState('');
  const inRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focus) setTimeout(() => inRef.current?.focus(), 300); }, [focus]);

  const p0 = posts.find(p => p.id === id);
  if (!p0) return <div><SubBar title={t('thread')} /><div className="empty">—</div></div>;
  const head = p0.chainOf ? posts.find(p => p.id === p0.chainOf) || p0 : p0;
  const ids = [head.id, ...posts.filter(p => p.chainOf === head.id).map(p => p.id)];
  const mine = comments.filter(c => ids.includes(c.postId));
  const kids = (pid: string | null) => mine.filter(c => (c.parentId || null) === pid).sort((a, b) => a.createdAt - b.createdAt);
  const pick = (c: Comment) => { setReplyTo(c); inRef.current?.focus(); };

  const Tree = ({ c }: { c: Comment }) => {
    const ch = kids(c.id);
    return (
      <div>
        <CommentCard c={c} line={ch.length > 0} onReply={pick} />
        {ch.length > 0 && <div className="nest">{ch.map(x => <Tree key={x.id} c={x} />)}</div>}
      </div>
    );
  };
  const roots = kids(null);
  const send = () => {
    const text = txt.trim();
    if (!text) return;
    act.comment(replyTo ? replyTo.postId : head.id, replyTo ? replyTo.id : null, text);
    setTxt(''); setReplyTo(null);
  };
  const toName = replyTo ? (replyTo.anon || !replyTo.authorId ? t('anon') : '@' + users[replyTo.authorId]?.handle) : '';

  return (
    <div className="view" style={{ paddingBottom: 110 }}>
      <SubBar title={t('thread')} />
      <div style={{ borderBottom: '1px solid var(--line)' }}><ThreadBlock head={head} isStatic /></div>
      {head.ticket && <OfficialReply tk={head.ticket} />}
      {head.ticket && role === 'admin' && !head.pending && <TicketAdmin post={head} />}
      <div className="dsec"><span>{t('repliesH')}</span><span className="pm">{mine.length}</span></div>
      {roots.map(c => <div key={c.id} style={{ borderBottom: '1px solid var(--line)' }}><Tree c={c} /></div>)}
      {!roots.length && <div className="empty">{t('noReplies')}</div>}
      {me && (
        <div className="replybar"><div className="in">
          {replyTo && <div className="rt">{t('replyTo')} <b>{toName}</b><button className="ib" style={{ width: 24, height: 24 }} onClick={() => setReplyTo(null)} aria-label="cancel"><X size={14} /></button></div>}
          <div className="box">
            <Avatar uid={me.id} size={32} />
            <input id="replyInput" ref={inRef} value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={t('writeReply')} disabled={head.pending} />
            <button className="sendb" disabled={!txt.trim() || head.pending} onClick={send} aria-label="send"><Send size={17} strokeWidth={2.2} /></button>
          </div>
        </div></div>
      )}
    </div>
  );
}

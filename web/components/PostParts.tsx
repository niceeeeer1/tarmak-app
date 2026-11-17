'use client';
import { Box, Check, Clock, Heart, Lightbulb, MapPin, Megaphone, MessageCircle, Pin, Repeat2, Send, ShieldCheck, ThumbsUp, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { CLOSED, TONE } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Comment, Post, Ticket } from '@/lib/types';
import { fmtDate, isOverdue, pad } from '@/lib/utils';
import { Avatar, useAgo, VBadge } from './ui';

export function PollBox({ post }: { post: Post }) {
  const { act, t } = useApp();
  const poll = post.poll!;
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const voted = poll.myVote !== null;
  const max = Math.max(...poll.counts);
  return (
    <div className="poll" onClick={e => e.stopPropagation()}>
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((poll.counts[i] / total) * 100) : 0;
        const mine = poll.myVote === i;
        return (
          <button key={i} className={'opt' + (mine ? ' mine' : '')} aria-pressed={mine} disabled={post.pending} onClick={() => act.vote(post, i)}>
            <span className="fill" style={{ width: voted ? pct + '%' : '0%' }} />
            <span className="lb" style={{ fontWeight: voted && poll.counts[i] === max ? 700 : 500 }}>{o}{mine && <Check size={16} strokeWidth={2.6} />}</span>
            {voted && <span className="pc">{pct}%</span>}
          </button>
        );
      })}
      <div className="pm">{total} {t('votes')}</div>
    </div>
  );
}

export function TicketMeta({ post, full }: { post: Post; full?: boolean }) {
  const { t, lang, now, users } = useApp();
  const tk = post.ticket;
  if (!tk) return null;
  const over = isOverdue(tk, now);
  const teacher = tk.confirmedBy.some(id => users[id]?.role === 'teacher');
  const Ic = post.type === 'idea' ? Lightbulb : post.type === 'lost' ? Box : Megaphone;
  const loc = [t(('b_' + tk.building) as TKey), tk.floor ? tk.floor + t('flr') : null, tk.room || null].filter(Boolean).join(' · ');
  const closed = CLOSED.includes(tk.status);
  return (
    <>
      <div className="chips">
        <span className="chip num"><Ic size={13} strokeWidth={2.2} />{tk.num ? pad(tk.num) : pad(null)} · {post.type === 'complaint' ? t(('c_' + tk.category) as TKey) : t(('ty_' + post.type) as TKey)}</span>
        <span className={'chip ' + TONE[tk.status]}>{(tk.status === 'resolved' || tk.status === 'returned') && <Check size={12} strokeWidth={3} />}{t(('st_' + tk.status) as TKey)}</span>
        {over && <span className="chip solid-bad"><TriangleAlert size={12} strokeWidth={2.6} />{t('overdue')}</span>}
        {teacher && <span className="chip info"><ShieldCheck size={12} strokeWidth={2.4} />{t('teacherConfirmed')}</span>}
      </div>
      <div className="meta">
        <span><MapPin size={13} />{loc}</span>
        {(tk.deadline || full) && !closed && (
          <span className={over ? 'late' : ''}><Clock size={13} />{tk.deadline ? t('deadline') + ': ' + fmtDate(tk.deadline, lang) : t('noDeadline')}</span>
        )}
      </div>
    </>
  );
}

export function OfficialReply({ tk, clamp }: { tk: Ticket | null; clamp?: boolean }) {
  const { t, lang, users } = useApp();
  if (!tk?.official) return null;
  const u = users[tk.official.by];
  return (
    <div className="official">
      <div className="oh"><Pin size={13} strokeWidth={2.2} />{t('officialReply')} · {u?.name || '—'}<VBadge role="admin" size={13} />
        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {fmtDate(tk.official.at, lang)}</span></div>
      <div className={'ot' + (clamp ? ' clamp' : '')}>{tk.official.text}</div>
    </div>
  );
}

export function QuoteCard({ id }: { id: string }) {
  const { posts, users, go, t } = useApp();
  const ago = useAgo();
  const q = posts.find(p => p.id === id);
  if (!q) return <div className="quote" style={{ color: 'var(--muted)' }}>—</div>;
  const u = q.authorId ? users[q.authorId] : null;
  return (
    <div className="quote" onClick={e => { e.stopPropagation(); go.post(q.id); }}>
      <div className="qh"><Avatar uid={q.authorId} anon={q.anon} size={20} /><b style={{ fontWeight: 600 }}>{q.anon || !u ? t('anon') : u.name}</b>
        {!q.anon && <VBadge role={u?.role} size={13} />}<span className="time">{ago(q.createdAt)}</span></div>
      {q.ticket && <div className="chips"><span className="chip num">{pad(q.ticket.num)}</span><span className={'chip ' + TONE[q.ticket.status]}>{t(('st_' + q.ticket.status) as TKey)}</span></div>}
      <div className="qt">{q.text}</div>
    </div>
  );
}

export function Actions({ post }: { post: Post }) {
  const { me, act, comments, t, go, setSheet } = useApp();
  const [k, setK] = useState(0);
  const uid = me?.id || '';
  const liked = post.likedBy.includes(uid), reposted = post.repostedBy.includes(uid);
  const nReplies = comments.filter(c => c.postId === post.id).length;
  const tk = post.ticket;
  const confirmed = !!tk && tk.confirmedBy.includes(uid);
  const off = post.pending || !me;
  return (
    <div className="acts" onClick={e => e.stopPropagation()}>
      <button key={'l' + k} disabled={off} className={'act' + (liked ? ' liked' : '') + (k && liked ? ' pop' : '')} aria-pressed={liked} aria-label="like"
        onClick={() => { setK(x => x + 1); act.likePost(post); }}>
        <Heart size={20} fill={liked ? 'currentColor' : 'none'} />{post.likedBy.length > 0 && <span>{post.likedBy.length}</span>}
      </button>
      <button className="act" disabled={post.pending} aria-label="reply" onClick={() => go.post(post.id, true)}><MessageCircle size={20} />{nReplies > 0 && <span>{nReplies}</span>}</button>
      <button className={'act' + (reposted ? ' reposted spin' : '')} disabled={off} aria-label="repost" onClick={() => setSheet({ kind: 'repost', id: post.id })}>
        <Repeat2 size={20} />{post.repostedBy.length > 0 && <span>{post.repostedBy.length}</span>}
      </button>
      <button className="act" disabled={post.pending} aria-label="share" onClick={() => setSheet({ kind: 'share', id: post.id })}><Send size={19} /></button>
      {post.type === 'complaint' && tk && (
        <button className={'act conf' + (confirmed ? ' on' : '')} disabled={off} aria-pressed={confirmed} onClick={() => act.confirm(post)}>
          {me?.role === 'teacher' ? <ShieldCheck size={15} strokeWidth={2.1} /> : <ThumbsUp size={15} strokeWidth={2.1} />}{t('confirm')} · {tk.confirmedBy.length}
        </button>
      )}
    </div>
  );
}

export function CommentActions({ c, onReply }: { c: Comment; onReply: (c: Comment) => void }) {
  const { me, act } = useApp();
  const [k, setK] = useState(0);
  const liked = !!me && c.likedBy.includes(me.id);
  return (
    <div className="acts">
      <button key={k} disabled={c.pending || !me} className={'act' + (liked ? ' liked' : '') + (k && liked ? ' pop' : '')}
        onClick={e => { e.stopPropagation(); setK(x => x + 1); act.likeComment(c); }}>
        <Heart size={18} fill={liked ? 'currentColor' : 'none'} />{c.likedBy.length > 0 && <span>{c.likedBy.length}</span>}
      </button>
      <button className="act" disabled={c.pending} onClick={e => { e.stopPropagation(); onReply(c); }}><MessageCircle size={18} /></button>
    </div>
  );
}

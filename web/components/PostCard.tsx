'use client';
import { MoreHorizontal, Repeat2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { Comment, Post } from '@/lib/types';
import { Actions, CommentActions, OfficialReply, PollBox, QuoteCard, TicketMeta } from './PostParts';
import { Avatar, Photos, RichText, useAgo, VBadge } from './ui';

function Header({ authorId, anon, mine, createdAt, onMore }: { authorId: string | null; anon: boolean; mine: boolean; createdAt: number; onMore?: () => void }) {
  const { users, t, go } = useApp();
  const ago = useAgo();
  const u = authorId ? users[authorId] : null;
  return (
    <div className="ph">
      <span className={'name' + (anon ? '' : ' link')} onClick={e => { if (!anon && u) { e.stopPropagation(); go.profile(u.id); } }}>{anon || !u ? t('anon') : u.name}</span>
      {!anon && <VBadge role={u?.role} />}
      {anon && mine && <span className="mine-anon">{t('mineAnon')}</span>}
      <span className="time">{ago(createdAt)}</span>
      {onMore && <button className="more" aria-label="more" onClick={e => { e.stopPropagation(); onMore(); }}><MoreHorizontal size={20} strokeWidth={2.4} /></button>}
    </div>
  );
}

export function PostCard({ post, line, isStatic }: { post: Post; line?: boolean; isStatic?: boolean }) {
  const { go, me, setSheet } = useApp();
  const showPlus = !!me && !post.anon && !!post.authorId && post.authorId !== me.id && !me.following.includes(post.authorId);
  return (
    <article className={'post' + (isStatic ? ' static' : '') + (post.pending ? ' pending' : '')} onClick={() => !isStatic && !post.pending && go.post(post.id)}>
      <div className="rail"><Avatar uid={post.authorId} anon={post.anon} plus={showPlus} />{line && <div className="line" />}</div>
      <div className="main">
        <Header authorId={post.authorId} anon={post.anon} mine={post.mine} createdAt={post.createdAt} onMore={post.pending ? undefined : () => setSheet({ kind: 'more', id: post.id })} />
        {!post.chainOf && <TicketMeta post={post} full={isStatic} />}
        {post.text && <div className="txt"><RichText text={post.text} /></div>}
        <Photos images={post.images} />
        {post.poll && <PollBox post={post} />}
        {post.quoteId && <QuoteCard id={post.quoteId} />}
        {post.ticket && !isStatic && <OfficialReply tk={post.ticket} clamp />}
        <Actions post={post} />
      </div>
    </article>
  );
}

export function CommentCard({ c, line, onReply }: { c: Comment; line?: boolean; onReply: (c: Comment) => void }) {
  return (
    <article className={'post static' + (c.pending ? ' pending' : '')}>
      <div className="rail"><Avatar uid={c.authorId} anon={c.anon} />{line && <div className="line" />}</div>
      <div className="main">
        <Header authorId={c.authorId} anon={c.anon} mine={c.mine} createdAt={c.createdAt} />
        <div className="txt"><RichText text={c.text} /></div>
        <CommentActions c={c} onReply={onReply} />
      </div>
    </article>
  );
}

/** Пост + его продолжения («Тармақ қосу»), соединённые вертикальной линией. */
export function ThreadBlock({ head, isStatic }: { head: Post; isStatic?: boolean }) {
  const { posts } = useApp();
  const chain = posts.filter(p => p.chainOf === head.id).sort((a, b) => a.chainIdx - b.chainIdx);
  const all = [head, ...chain];
  return <>{all.map((p, i) => <PostCard key={p.id} post={p} line={i < all.length - 1} isStatic={isStatic} />)}</>;
}

export function FeedItem({ p }: { p: Post }) {
  const { posts, users, t } = useApp();
  if (p.type === 'repost') {
    const o = posts.find(x => x.id === p.repostOf);
    if (!o) return null;
    return (
      <div className="item">
        <div className="rph"><Repeat2 size={14} strokeWidth={2.2} />{(p.authorId && users[p.authorId]?.name) || ''} {t('repostedBy')}</div>
        <ThreadBlock head={o} />
      </div>
    );
  }
  return <div className="item"><ThreadBlock head={p} /></div>;
}

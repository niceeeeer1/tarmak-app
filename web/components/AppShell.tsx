'use client';
import { useEffect } from 'react';
import { useApp } from '@/lib/store';
import { AdminPanel } from './AdminPanel';
import { BottomNav } from './BottomNav';
import { Composer } from './Composer';
import { Feed } from './Feed';
import { Notifications } from './Notifications';
import { Onboarding } from './Onboarding';
import { PostDetail } from './PostDetail';
import { Profile } from './Profile';
import { Search } from './Search';
import { Sheets } from './Sheets';
import { Logo } from './ui';

export function AppShell() {
  const { booted, status, me, view, vkey, composer, setComposer, toast, syncing, token, t, go, posts } = useApp();

  // ссылки вида /?p=<id> открывают пост
  useEffect(() => {
    if (status !== 'ready') return;
    const id = new URLSearchParams(window.location.search).get('p');
    if (id && posts.some(p => p.id === id)) { go.post(id); window.history.replaceState(null, '', '/'); }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!booted || (status === 'loading' && token)) {
    return <div className="onb" style={{ alignItems: 'center' }}><Logo size={48} /><p>{t('loading')}</p></div>;
  }
  if (!me) return <div className="app"><Onboarding /></div>;

  let body;
  switch (view.name) {
    case 'post': body = <PostDetail key={vkey} id={view.id} focus={view.focus} />; break;
    case 'profile': body = <Profile key={vkey} uid={view.uid} />; break;
    case 'admin': body = <AdminPanel key={vkey} />; break;
    case 'search': body = <Search />; break;
    case 'notif': body = <Notifications key={me.id} />; break;
    case 'me': body = <Profile key={'me' + me.id} uid={me.id} />; break;
    default: body = <Feed />;
  }
  return (
    <>
      {syncing > 0 && <div className="syncbar" aria-hidden="true"><i /></div>}
      <div className="app">{body}</div>
      <BottomNav />
      {composer && <Composer quoteId={composer.quoteId} onClose={() => setComposer(null)} />}
      <Sheets />
      {toast && <div className="toastw"><div className="toast" key={toast.k} role="status">{toast.s}</div></div>}
    </>
  );
}

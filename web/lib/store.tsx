'use client';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, hasApi } from './api';
import { DEMO_TOKENS, SOLVED } from './constants';
import { I18N, type Lang, type TKey } from './i18n';
import { computeStats } from './stats';
import type { Category, Comment, Draft, Me, Notif, Post, Role, Sheet, Stats, TicketStatus, User, View } from './types';
import { pad, tempId, toggle, copyText } from './utils';

interface Data { me: Me | null; users: Record<string, User>; posts: Post[]; comments: Comment[]; notifications: Notif[] }
const EMPTY: Data = { me: null, users: {}, posts: [], comments: [], notifications: [] };
type Theme = 'system' | 'light' | 'dark';
type FeedTab = 'all' | 'talk' | 'idea' | 'complaint' | 'lost';

function useStore() {
  // ── сессия и настройки ──
  const [booted, setBooted] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [lang, setLangState] = useState<Lang>('kz');
  const [theme, setThemeState] = useState<Theme>('system');
  const t = useCallback((k: TKey) => (I18N[lang][k] ?? k) as string, [lang]);

  // ── данные ──
  const [data, setData] = useState<Data>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorKey, setErrorKey] = useState<TKey | null>(null);
  const [syncing, setSyncing] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(0);      // сколько фоновых запросов ещё в полёте
  const epoch = useRef(0);        // растёт при каждом optimistic-изменении: устаревший refresh не затрёт его
  const dirty = useRef(false);    // была ошибка синхронизации → перечитать с сервера

  // ── навигация и UI ──
  const [tab, setTab] = useState<'home' | 'search' | 'notif' | 'me'>('home');
  const [stack, setStack] = useState<View[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [composer, setComposer] = useState<{ quoteId?: string } | null>(null);
  const [toast, setToast] = useState<{ s: string; k: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const scrollMem = useRef<Record<string, number>>({});

  const showToast = useCallback((s: string) => {
    setToast({ s, k: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const setToken = useCallback((tok: string | null) => {
    tokenRef.current = tok;
    setTokenState(tok);
    try { tok ? localStorage.setItem('tarmak.token', tok) : localStorage.removeItem('tarmak.token'); } catch {}
  }, []);

  useEffect(() => {
    try {
      const tok = localStorage.getItem('tarmak.token');
      tokenRef.current = tok; setTokenState(tok);
      const l = localStorage.getItem('tarmak.lang'); if (l === 'kz' || l === 'ru') setLangState(l);
      const th = localStorage.getItem('tarmak.theme'); if (th === 'light' || th === 'dark' || th === 'system') setThemeState(th);
    } catch {}
    setBooted(true);
  }, []);

  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem('tarmak.lang', l); } catch {} };
  const setTheme = (th: Theme) => { setThemeState(th); try { localStorage.setItem('tarmak.theme', th); } catch {} };
  useEffect(() => {
    const el = document.documentElement;
    theme === 'system' ? el.removeAttribute('data-theme') : el.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { document.documentElement.lang = lang === 'kz' ? 'kk' : 'ru'; }, [lang]);

  // ── синхронизация с Apps Script ──
  const refresh = useCallback(async () => {
    if (!hasApi) { setStatus('error'); setErrorKey('noApi'); return; }
    if (pending.current > 0) return;
    const e0 = epoch.current;
    try {
      const b = await api.bootstrap(tokenRef.current);
      if (epoch.current !== e0 || pending.current > 0) return; // пока шли данные, пользователь что-то изменил
      if (tokenRef.current && !b.me) setToken(null);
      setData({ me: b.me, users: Object.fromEntries(b.users.map(u => [u.id, u])), posts: b.posts, comments: b.comments, notifications: b.notifications });
      setNow(Date.now());
      setStatus('ready'); setErrorKey(null);
    } catch {
      setStatus(s => (s === 'ready' ? 'ready' : 'error'));
      setErrorKey('offline');
    }
  }, [setToken]);

  useEffect(() => {
    if (!booted) return;
    refresh();
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); };
  }, [booted, token, refresh]);

  /**
   * Optimistic UI: apply() меняет экран сразу, request() уходит в фоне,
   * done() сверяет ответ сервера (например, заменяет временный id и номер заявки).
   * При ошибке — тост и полная перезагрузка состояния с сервера.
   */
  const run = useCallback(<T,>(apply: (d: Data) => Data, request: (tok: string) => Promise<T>, done?: (r: T, d: Data) => Data, after?: (r: T) => void) => {
    const tok = tokenRef.current;
    if (!tok) return;
    epoch.current++;
    pending.current++; setSyncing(pending.current);
    setData(apply);
    request(tok)
      .then(r => { if (done) setData(d => done(r, d)); after?.(r); })
      .catch((e: unknown) => {
        dirty.current = true;
        const msg = e instanceof ApiError && e.message && e.message !== e.code ? e.message : I18N[lang].syncError;
        showToast(msg);
      })
      .finally(() => {
        pending.current--; setSyncing(pending.current);
        if (pending.current === 0 && dirty.current) { dirty.current = false; refresh(); }
      });
  }, [lang, refresh, showToast]);

  const me = data.me;
  const role: Role = me?.role || 'student';
  const mapPosts = (d: Data, id: string, fn: (p: Post) => Post): Data => ({ ...d, posts: d.posts.map(p => (p.id === id ? fn(p) : p)) });
  const mergeTicket = (d: Data, srv: Post): Data => mapPosts(d, srv.id, p => ({ ...p, ticket: srv.ticket }));

  const act = {
    toast: showToast,
    copy: (s: string, ok: string) => copyText(s).then(r => showToast(r ? ok : t('copyFail') + ': ' + s)),

    likePost: (p: Post) => {
      if (!me || p.pending) return;
      const on = !p.likedBy.includes(me.id);
      run(d => mapPosts(d, p.id, x => ({ ...x, likedBy: toggle(x.likedBy, me.id, on) })), tok => api.like(tok, 'post', p.id, on));
    },
    likeComment: (c: Comment) => {
      if (!me || c.pending) return;
      const on = !c.likedBy.includes(me.id);
      run(d => ({ ...d, comments: d.comments.map(x => (x.id === c.id ? { ...x, likedBy: toggle(x.likedBy, me.id, on) } : x)) }),
        tok => api.like(tok, 'comment', c.id, on));
    },
    vote: (p: Post, idx: number) => {
      if (!me || !p.poll || p.pending) return;
      const prev = p.poll.myVote;
      const next = prev === idx ? null : idx;
      run(d => mapPosts(d, p.id, x => {
        const counts = [...x.poll!.counts];
        if (prev !== null) counts[prev]--;
        if (next !== null) counts[next]++;
        return { ...x, poll: { ...x.poll!, counts, myVote: next } };
      }), tok => api.vote(tok, p.id, next), (r, d) => mapPosts(d, p.id, x => ({ ...x, poll: r.poll })));
    },
    confirm: (p: Post) => {
      if (!me || !p.ticket || p.pending) return;
      const on = !p.ticket.confirmedBy.includes(me.id);
      run(d => mapPosts(d, p.id, x => ({ ...x, ticket: { ...x.ticket!, confirmedBy: toggle(x.ticket!.confirmedBy, me.id, on) } })),
        tok => api.confirm(tok, p.id, on));
    },
    repost: (p: Post) => {
      if (!me || p.pending) return;
      const on = !p.repostedBy.includes(me.id);
      const tmp = tempId();
      run(d => {
        const posts = d.posts.map(x => (x.id === p.id ? { ...x, repostedBy: toggle(x.repostedBy, me.id, on) } : x));
        return on
          ? { ...d, posts: [{ id: tmp, createdAt: Date.now(), authorId: me.id, anon: false, mine: true, type: 'repost', text: '', images: [], quoteId: null, repostOf: p.id, chainOf: null, chainIdx: 0, likedBy: [], repostedBy: [], ticket: null, poll: null, pending: true }, ...posts] }
          : { ...d, posts: posts.filter(x => !(x.type === 'repost' && x.repostOf === p.id && x.authorId === me.id)) };
      }, tok => api.repost(tok, p.id, on), (r, d) => ({ ...d, posts: d.posts.map(x => (x.id === tmp && r.repost ? r.repost : x)) }));
      showToast(on ? t('repostDone') : t('repostRemoved'));
    },
    publish: (dr: Draft) => {
      if (!me) return;
      const segs = dr.segments.filter(s => s.text.trim() || s.images.length);
      const ids = segs.map(() => tempId());
      const isTicket = dr.type !== 'talk';
      const ts = Date.now();
      const temp: Post[] = segs.map((s, i) => ({
        id: ids[i], createdAt: ts + i, authorId: me.id, anon: dr.anon, mine: true, type: dr.type, text: s.text.trim(), images: s.images,
        quoteId: i === 0 ? dr.quoteId : null, repostOf: null, chainOf: i ? ids[0] : null, chainIdx: i, likedBy: [], repostedBy: [],
        ticket: i === 0 && isTicket ? {
          num: null, category: (dr.type === 'complaint' ? dr.category : dr.type) as Category, building: dr.building, floor: dr.floor, room: dr.room,
          status: dr.type === 'lost' ? 'searching' : 'accepted', deadline: null, resolvedAt: null, confirmedBy: [], official: null,
        } : null,
        poll: s.poll ? { options: s.poll.options.map(o => o.trim()).filter(Boolean), counts: s.poll.options.filter(o => o.trim()).map(() => 0), myVote: null } : null,
        pending: true,
      }));
      setComposer(null); setStack([]); setTab('home'); setFeedTab('all');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 30);
      if (segs.some(s => s.images.length)) showToast(t('uploading'));
      run(d => ({ ...d, posts: [...temp, ...d.posts] }),
        async tok => {
          // 1) фото → Google Диск (каждое отдельным запросом, параллельно)
          const segments = await Promise.all(segs.map(async s => ({
            text: s.text.trim(),
            poll: s.poll ? { options: s.poll.options.map(o => o.trim()).filter(Boolean) } : null,
            images: await Promise.all(s.images.map(src => (src.startsWith('data:') ? api.upload(tok, src).then(r => r.url) : Promise.resolve(src)))),
          })));
          // 2) сам пост / ветка / заявка
          return api.createPost(tok, { type: dr.type, anon: dr.anon, quoteId: dr.quoteId, category: dr.category, building: dr.building, floor: dr.floor, room: dr.room, segments });
        },
        (r, d) => ({ ...d, posts: [...r.posts, ...d.posts.filter(p => !ids.includes(p.id))] }),
        r => showToast(r.ticketNum ? `${t('published')} · ${pad(r.ticketNum)}` : t('published')));
    },
    comment: (postId: string, parentId: string | null, text: string, anon = false) => {
      if (!me) return;
      const tmp = tempId();
      run(d => ({ ...d, comments: [...d.comments, { id: tmp, postId, parentId, authorId: me.id, anon, mine: true, text, createdAt: Date.now(), likedBy: [], pending: true }] }),
        tok => api.comment(tok, postId, parentId, text, anon),
        (r, d) => ({ ...d, comments: d.comments.map(c => (c.id === tmp ? r.comment : c)) }));
    },
    setStatus: (p: Post, s: TicketStatus) => {
      if (!p.ticket || p.ticket.status === s) return;
      const keep = SOLVED.includes(s) && SOLVED.includes(p.ticket.status) && p.ticket.resolvedAt;
      run(d => mapPosts(d, p.id, x => ({ ...x, ticket: { ...x.ticket!, status: s, resolvedAt: SOLVED.includes(s) ? (keep ? x.ticket!.resolvedAt : Date.now()) : null } })),
        tok => api.setStatus(tok, p.id, s), (r, d) => mergeTicket(d, r.post));
      showToast(t('statusChanged') + ': ' + t(('st_' + s) as TKey));
    },
    setDeadline: (p: Post, deadline: number | null) => {
      run(d => mapPosts(d, p.id, x => ({ ...x, ticket: { ...x.ticket!, deadline } })), tok => api.setDeadline(tok, p.id, deadline), (r, d) => mergeTicket(d, r.post));
      showToast(t('deadlineSet'));
    },
    setOfficial: (p: Post, text: string) => {
      if (!me) return;
      run(d => mapPosts(d, p.id, x => ({ ...x, ticket: { ...x.ticket!, official: { text, by: me.id, at: Date.now() } } })),
        tok => api.setOfficial(tok, p.id, text), (r, d) => mergeTicket(d, r.post));
      showToast(t('published'));
    },
    deletePost: (p: Post) => {
      run(d => ({ ...d, posts: d.posts.filter(x => x.id !== p.id && x.chainOf !== p.id && x.repostOf !== p.id) }), tok => api.deletePost(tok, p.id));
      setStack(s => s.filter(v => !(v.name === 'post' && v.id === p.id)));
      showToast(t('deleted'));
    },
    follow: (uid: string) => {
      if (!me) return;
      const on = !me.following.includes(uid);
      run(d => ({
        ...d,
        me: d.me ? { ...d.me, following: toggle(d.me.following, uid, on) } : d.me,
        users: { ...d.users, [uid]: { ...d.users[uid], followers: d.users[uid].followers + (on ? 1 : -1) } },
      }), tok => api.follow(tok, uid, on));
      showToast(on ? t('followed') + ': ' + data.users[uid]?.name : t('unfollowed'));
    },
    markRead: () => {
      if (!me || !data.notifications.some(n => !n.read)) return;
      run(d => ({ ...d, notifications: d.notifications.map(n => ({ ...n, read: true })) }), tok => api.markRead(tok));
    },
    register: async (name: string, group: string) => {
      const r = await api.register(name, group);
      setToken(r.token);
      await refresh();
    },
    demoLogin: (r: Role) => {
      setToken(DEMO_TOKENS[r]);
      setStack([]);
      showToast(t('roleSet') + ' ' + t(('r_' + r) as TKey));
    },
    logout: () => { setToken(null); setData(d => ({ ...d, me: null, notifications: [] })); setStack([]); setTab('home'); },
  };

  // ── навигация ──
  const view: View = stack.length ? stack[stack.length - 1] : { name: tab };
  const vkey = JSON.stringify(view) + stack.length;
  useLayoutEffect(() => { window.scrollTo(0, scrollMem.current[vkey] || 0); }, [vkey]);
  const rootOf = (id: string) => {
    const p = data.posts.find(x => x.id === id);
    if (!p) return id;
    if (p.type === 'repost' && p.repostOf) return p.repostOf;
    return p.chainOf || p.id;
  };
  const go = {
    tab: (k: typeof tab) => {
      scrollMem.current[vkey] = window.scrollY;
      if (k === 'home' && tab === 'home' && !stack.length) window.scrollTo({ top: 0, behavior: 'smooth' });
      setStack([]); setTab(k);
    },
    push: (v: View) => { scrollMem.current[vkey] = window.scrollY; setStack(s => [...s, v]); },
    back: () => setStack(s => s.slice(0, -1)),
    post: (id: string, focus = false) => go.push({ name: 'post', id: rootOf(id), focus }),
    profile: (uid: string) => go.push({ name: 'profile', uid }),
    handle: (h: string) => {
      const u = Object.values(data.users).find(x => x.handle.toLowerCase() === h.toLowerCase());
      u ? go.profile(u.id) : go.search('@' + h);
    },
    search: (q: string) => { setQuery(q); setStack([]); setTab('search'); },
    admin: () => go.push({ name: 'admin' }),
  };

  const stats: Stats = useMemo(() => computeStats(data.posts, now), [data.posts, now]);
  const unread = data.notifications.some(n => !n.read);

  return {
    booted, token, lang, setLang, theme, setTheme, t, status, errorKey, syncing, now, refresh,
    data, me, role, users: data.users, posts: data.posts, comments: data.comments, notifications: data.notifications, stats, unread,
    tab, stack, view, vkey, feedTab, setFeedTab, query, setQuery, sheet, setSheet, composer, setComposer, toast,
    act, go,
  };
}

export type Store = ReturnType<typeof useStore>;
const Ctx = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
export function useApp() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp outside AppProvider');
  return s;
}

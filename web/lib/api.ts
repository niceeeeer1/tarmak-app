import type { Bootstrap, Comment, Me, PollView, Post } from './types';

const BASE = process.env.NEXT_PUBLIC_GAS_API_URL || '';
export const hasApi = !!BASE;

export class ApiError extends Error {
  constructor(public code: string, message?: string) { super(message || code); }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError('http_' + res.status);
  const j = await res.json();
  if (!j.ok) throw new ApiError(j.error, j.message);
  return j.data as T;
}

/** GET — публичная лента (с token дополнительно приходят «мои» уведомления и флаги mine). */
export async function gasGet<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  return parse<T>(await fetch(url.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' }));
}

/**
 * POST в Apps Script без CORS preflight: «простой» запрос с Content-Type text/plain,
 * а в теле — JSON-строка. Apps Script читает её как e.postData.contents.
 */
export async function gasPost<T>(action: string, token: string | null, payload: object = {}, retries = 2): Promise<T> {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, ...payload }),
    });
    return await parse<T>(res);
  } catch (e) {
    // «busy» = замок LockService занят другим запросом → короткая пауза и повтор
    if (retries > 0 && (!(e instanceof ApiError) || e.code === 'busy' || e.code.startsWith('http_5'))) {
      await new Promise(r => setTimeout(r, 700 * (3 - retries)));
      return gasPost<T>(action, token, payload, retries - 1);
    }
    throw e;
  }
}

export const api = {
  bootstrap: (token: string | null) => gasGet<Bootstrap>({ action: 'bootstrap', token: token || '' }),
  register: (name: string, group: string) => gasPost<{ token: string; me: Me }>('register', null, { name, group }),
  upload: (token: string, dataUrl: string) => gasPost<{ fileId: string; url: string }>('upload', token, { data: dataUrl }),
  createPost: (token: string, p: object) => gasPost<{ ticketNum: number | null; posts: Post[] }>('createPost', token, p),
  like: (token: string, kind: 'post' | 'comment', id: string, on: boolean) => gasPost('like', token, { kind, id, on }),
  repost: (token: string, postId: string, on: boolean) => gasPost<{ repost: Post | null }>('repost', token, { postId, on }),
  vote: (token: string, postId: string, option: number | null) => gasPost<{ poll: PollView }>('vote', token, { postId, option }),
  confirm: (token: string, postId: string, on: boolean) => gasPost<{ post: Post }>('confirm', token, { postId, on }),
  comment: (token: string, postId: string, parentId: string | null, text: string, anon: boolean) =>
    gasPost<{ comment: Comment }>('comment', token, { postId, parentId, text, anon }),
  setStatus: (token: string, postId: string, status: string) => gasPost<{ post: Post }>('setStatus', token, { postId, status }),
  setDeadline: (token: string, postId: string, deadline: number | null) => gasPost<{ post: Post }>('setDeadline', token, { postId, deadline }),
  setOfficial: (token: string, postId: string, text: string) => gasPost<{ post: Post }>('setOfficial', token, { postId, text }),
  deletePost: (token: string, postId: string) => gasPost('deletePost', token, { postId }),
  follow: (token: string, userId: string, on: boolean) => gasPost('follow', token, { userId, on }),
  markRead: (token: string) => gasPost('markRead', token),
};

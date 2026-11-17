import { ALL_CATS, H, SOLVED, CLOSED } from './constants';
import { isOverdue } from './utils';
import type { Post, Stats } from './types';

/** Та же формула, что в Code.gs (stats_): считается на клиенте, чтобы KPI менялись мгновенно (optimistic UI). */
export function computeStats(posts: Post[], now: number): Stats {
  const tickets = posts.filter(p => p.ticket && p.type !== 'repost');
  const solved = tickets.filter(p => SOLVED.includes(p.ticket!.status));
  const times = solved.filter(p => p.ticket!.resolvedAt).map(p => (p.ticket!.resolvedAt! - p.createdAt) / H);
  const sum = times.reduce((a, b) => a + b, 0);
  const byCat: Stats['byCat'] = {};
  ALL_CATS.forEach(c => (byCat[c] = { total: 0, solved: 0 }));
  const byStatus: Stats['byStatus'] = {};
  tickets.forEach(p => {
    const tk = p.ticket!;
    const c = byCat[tk.category] || (byCat[tk.category] = { total: 0, solved: 0 });
    c.total++;
    if (SOLVED.includes(tk.status)) c.solved++;
    byStatus[tk.status] = (byStatus[tk.status] || 0) + 1;
  });
  return {
    total: tickets.length,
    open: tickets.filter(p => !CLOSED.includes(p.ticket!.status)).length,
    solved: solved.length,
    solvedPct: tickets.length ? Math.round((solved.length / tickets.length) * 100) : 0,
    sumHours: Math.round(sum * 10) / 10,
    n: times.length,
    avgHours: times.length ? Math.round((sum / times.length) * 10) / 10 : 0,
    overdue: tickets.filter(p => isOverdue(p.ticket, now)).length,
    byCat, byStatus,
  };
}

import type { Building, Category, TicketStatus } from './types';
export const H = 3600e3, D = 24 * H;
export const COMPLAINT_CATS: Category[] = ['cleaning', 'furniture', 'heat', 'wc', 'canteen'];
export const ALL_CATS: Category[] = [...COMPLAINT_CATS, 'idea', 'lost'];
export const BUILDINGS: Building[] = ['main', 'b2', 'dorm', 'gym'];
export const TICKET_FLOW: TicketStatus[] = ['accepted', 'review', 'resolved', 'rejected'];
export const LOST_FLOW: TicketStatus[] = ['searching', 'found', 'returned'];
export const SOLVED: TicketStatus[] = ['resolved', 'returned'];
export const CLOSED: TicketStatus[] = ['resolved', 'returned', 'rejected'];
export type Tone = 'info' | 'warn' | 'ok' | 'neutral';
export const TONE: Record<TicketStatus, Tone> = {
  accepted: 'info', review: 'warn', resolved: 'ok', rejected: 'neutral', searching: 'warn', found: 'info', returned: 'ok',
};
export const TONE_VAR: Record<Tone, string> = { info: 'var(--info)', warn: 'var(--warn)', ok: 'var(--ok)', neutral: 'var(--muted)' };
export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';
export const DEMO_TOKENS = { student: 'demo-student', teacher: 'demo-teacher', admin: 'demo-admin' } as const;
export const SHARE_BASE = typeof window !== 'undefined' ? window.location.origin : '';

import { CLOSED } from './constants';
import { MONTHS, type Lang } from './i18n';
import type { Ticket } from './types';

export const pad = (n: number | null | undefined) => (n ? '#' + String(n).padStart(4, '0') : '#····');
export const tempId = () => 'tmp_' + Math.random().toString(36).slice(2, 10);
export const toggle = <T,>(arr: T[], v: T, on: boolean) => (on ? (arr.includes(v) ? arr : [...arr, v]) : arr.filter(x => x !== v));
export const fmtDate = (ts: number, lang: Lang) => { const d = new Date(ts); return d.getDate() + ' ' + MONTHS[lang][d.getMonth()]; };
export const isOverdue = (tk: Ticket | null, now: number) => !!(tk && tk.deadline && now > tk.deadline && !CLOSED.includes(tk.status));

/** Сжатие фото перед загрузкой: ширина до 1080px, JPEG 0.8 → data URL (Base64). */
export function compressImage(file: File, maxWidth = 1080, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('canvas')); }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

export async function copyText(s: string) {
  try { await navigator.clipboard.writeText(s); return true; } catch { return false; }
}

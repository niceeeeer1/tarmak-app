'use client';
import { Pin, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { D, LOST_FLOW, TICKET_FLOW, TONE } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Post } from '@/lib/types';
import { fmtDate, isOverdue, pad } from '@/lib/utils';

/** Смена статуса, дедлайн (SLA) и официальный ответ — только для роли admin. */
export function TicketAdmin({ post }: { post: Post }) {
  const { t, act, lang, now } = useApp();
  const tk = post.ticket!;
  const flow = post.type === 'lost' ? LOST_FLOW : TICKET_FLOW;
  const [txt, setTxt] = useState(tk.official?.text || '');
  const dateValue = tk.deadline ? new Date(tk.deadline - new Date(tk.deadline).getTimezoneOffset() * 60e3).toISOString().slice(0, 10) : '';
  return (
    <div className="adm" onClick={e => e.stopPropagation()}>
      <div className="ah"><ShieldCheck size={16} strokeWidth={2.2} />{t('adminTools')} · {pad(tk.num)}</div>
      <span className="lbl">{t('setStatus')}</span>
      <div className="stb">
        {flow.map(s => <button key={s} className={(tk.status === s ? 'on ' : '') + TONE[s]} onClick={() => act.setStatus(post, s)}>{t(('st_' + s) as TKey)}</button>)}
      </div>
      {post.type !== 'lost' && (
        <>
          <span className="lbl">{t('setDeadline')} · <span style={{ textTransform: 'none', letterSpacing: 0, color: isOverdue(tk, now) ? 'var(--bad)' : 'var(--fg)' }}>{tk.deadline ? fmtDate(tk.deadline, lang) : t('noDeadline')}</span></span>
          <div className="row">
            {[1, 3, 7].map(d => <button key={d} className="btn sm" onClick={() => act.setDeadline(post, Date.now() + d * D)}>+{d} {t('d')}</button>)}
            <button className="btn sm" onClick={() => act.setDeadline(post, Date.now() - D)}>{t('yesterday')}</button>
            <input className="inp" type="date" id={'dl-' + post.id} aria-label={t('setDeadline')} value={dateValue}
              onChange={e => e.target.value && act.setDeadline(post, new Date(e.target.value + 'T18:00').getTime())} />
          </div>
        </>
      )}
      <span className="lbl">{t('officialReply')}</span>
      <textarea className="inp" id={'or-' + post.id} value={txt} onChange={e => setTxt(e.target.value)} placeholder={t('replyPh')} />
      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
        <button className="btn pri sm" disabled={!txt.trim()} onClick={() => act.setOfficial(post, txt.trim())}><Pin size={14} strokeWidth={2.2} />{t('publishReply')}</button>
      </div>
    </div>
  );
}

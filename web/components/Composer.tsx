'use client';
import { BarChart3, Box, EyeOff, Hash, ImagePlus, Lightbulb, Megaphone, MessageSquare, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BUILDINGS, COMPLAINT_CATS } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Draft, DraftSegment } from '@/lib/types';
import { compressImage, pad } from '@/lib/utils';
import { QuoteCard } from './PostParts';
import { Avatar, Photos } from './ui';

const TYPES = [['talk', MessageSquare], ['idea', Lightbulb], ['complaint', Megaphone], ['lost', Box]] as const;
const emptySeg = (): DraftSegment => ({ text: '', images: [], poll: null });

export function Composer({ quoteId, onClose }: { quoteId?: string; onClose: () => void }) {
  const { t, me, act, posts } = useApp();
  const [d, setD] = useState<Draft>({ type: 'talk', anon: false, quoteId: quoteId || null, category: 'heat', building: 'main', floor: '2', room: '', segments: [emptySeg()] });
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef(0);
  const taRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const isTicket = d.type !== 'talk';
  const nextNum = Math.max(0, ...posts.map(p => p.ticket?.num || 0)) + 1;

  useEffect(() => { taRefs.current[0]?.focus(); }, []);
  const mapSeg = (i: number, fn: (s: DraftSegment) => DraftSegment) => setD(x => ({ ...x, segments: x.segments.map((s, j) => (j === i ? fn(s) : s)) }));
  const grow = (el: HTMLTextAreaElement) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const i = target.current;
    const files = Array.from(e.target.files || []).slice(0, 4);
    e.target.value = '';
    for (const f of files) {
      try {
        const src = await compressImage(f, 1080, 0.8);      // Canvas: до 1080px, JPEG 0.8
        mapSeg(i, s => ({ ...s, images: [...s.images, src].slice(0, 4) }));
      } catch { act.toast('⚠️ ' + f.name); }
    }
  };
  const valid = d.segments.some(s => s.text.trim() || s.images.length) && d.segments.every(s => !s.poll || s.poll.options.filter(o => o.trim()).length >= 2);
  if (!me) return null;

  return (
    <div className="comp" role="dialog" aria-modal="true">
      <div className="cw"><div className="chead"><button className="cx" onClick={onClose}>{t('cancel')}</button><div className="title">{t('newThread')}</div><div /></div></div>
      <div className="body"><div className="cw">
        <div className="types">
          {TYPES.map(([k, Ic]) => <button key={k} className={'tp' + (d.type === k ? ' on' : '')} onClick={() => setD(x => ({ ...x, type: k }))}><Ic size={15} strokeWidth={2.1} />{t(('ty_' + k) as TKey)}</button>)}
        </div>
        {isTicket && (
          <div className="tbox">
            {d.type === 'complaint' && (<>
              <span className="lbl">{t('category')}</span>
              <div className="cats">{COMPLAINT_CATS.map(c => <button key={c} className={'cat' + (d.category === c ? ' on' : '')} onClick={() => setD(x => ({ ...x, category: c }))}>{t(('c_' + c) as TKey)}</button>)}</div>
            </>)}
            <span className="lbl">{t('location')}</span>
            <div className="locrow">
              <select className="inp" id="locB" aria-label={t('building')} value={d.building} onChange={e => setD(x => ({ ...x, building: e.target.value as Draft['building'] }))}>
                {BUILDINGS.map(b => <option key={b} value={b}>{t(('b_' + b) as TKey)}</option>)}
              </select>
              <select className="inp" id="locF" aria-label={t('floor')} value={d.floor} onChange={e => setD(x => ({ ...x, floor: e.target.value }))}>
                {['1', '2', '3', '4'].map(f => <option key={f} value={f}>{f}{t('flr')}</option>)}
              </select>
              <input className="inp" id="locR" placeholder={t('room')} value={d.room} onChange={e => setD(x => ({ ...x, room: e.target.value }))} />
            </div>
            <div className="hint"><Hash size={14} />{t('regNo')} <b style={{ color: 'var(--fg)' }}>{pad(nextNum)}</b></div>
          </div>
        )}
        {d.segments.map((s, i) => (
          <div key={i} className="seg-row">
            <div className="rail"><Avatar uid={d.anon ? null : me.id} anon={d.anon} /><div className="line" /></div>
            <div className="main">
              <div className="ph"><span className="name">{d.anon ? t('anon') : me.name}</span>
                {i > 0 && <button className="more" aria-label="remove" onClick={() => setD(x => ({ ...x, segments: x.segments.filter((_, j) => j !== i) }))}><X size={16} /></button>}</div>
              <textarea ref={el => { taRefs.current[i] = el; }} id={'seg-' + i} className="ta" rows={1} value={s.text}
                placeholder={i > 0 ? t('ph_more') : t(('ph_' + d.type) as TKey)}
                onChange={e => { grow(e.target); const v = e.target.value; mapSeg(i, x => ({ ...x, text: v })); }} />
              <Photos images={s.images} onRemove={k => mapSeg(i, x => ({ ...x, images: x.images.filter((_, j) => j !== k) }))} />
              {s.poll && (
                <div className="pedit">
                  {s.poll.options.map((o, k) => (
                    <div key={k} className="r">
                      <input className="inp" id={`po-${i}-${k}`} placeholder={t('option') + ' ' + (k + 1)} value={o}
                        onChange={e => { const v = e.target.value; mapSeg(i, x => ({ ...x, poll: { options: x.poll!.options.map((ov, j) => (j === k ? v : ov)) } })); }} />
                      {k >= 2 && <button className="ib" aria-label="remove" onClick={() => mapSeg(i, x => ({ ...x, poll: { options: x.poll!.options.filter((_, j) => j !== k) } }))}><X size={16} /></button>}
                    </div>
                  ))}
                  {s.poll.options.length < 4 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => mapSeg(i, x => ({ ...x, poll: { options: [...x.poll!.options, ''] } }))}><Plus size={14} />{t('addOption')}</button>}
                </div>
              )}
              {i === 0 && d.quoteId && <QuoteCard id={d.quoteId} />}
              <div className="tools">
                <button onClick={() => { target.current = i; fileRef.current?.click(); }} aria-label={t('photo')}><ImagePlus size={19} />{t('photo')}</button>
                <button onClick={() => mapSeg(i, x => ({ ...x, poll: x.poll ? null : { options: ['', ''] } }))} style={s.poll ? { color: 'var(--fg)' } : undefined}><BarChart3 size={19} />{t('poll')}</button>
                <button aria-label="hashtag" onClick={() => { mapSeg(i, x => ({ ...x, text: x.text + (x.text && !x.text.endsWith(' ') ? ' #' : '#') })); setTimeout(() => taRefs.current[i]?.focus(), 0); }}><Hash size={18} /></button>
              </div>
            </div>
          </div>
        ))}
        <button className="addt" onClick={() => { const n = d.segments.length; setD(x => ({ ...x, segments: [...x.segments, emptySeg()] })); setTimeout(() => taRefs.current[n]?.focus(), 50); }}>
          <div className="rail"><Avatar uid={d.anon ? null : me.id} anon={d.anon} size={20} /></div><span>{t('addThread')}</span>
        </button>
        {d.anon && <div className="anonhint"><EyeOff size={16} /><span>{t('anonHint')}</span></div>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div></div>
      <div className="cfoot"><div className="cw">
        <button className={'sw' + (d.anon ? ' on' : '')} role="switch" aria-checked={d.anon} onClick={() => setD(x => ({ ...x, anon: !x.anon }))}><span className="k" />{t('anonSend')}</button>
        <button className="btn pri" disabled={!valid} onClick={() => act.publish(d)}>{t('publish')}</button>
      </div></div>
    </div>
  );
}

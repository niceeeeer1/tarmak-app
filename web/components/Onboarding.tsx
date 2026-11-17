'use client';
import { useState } from 'react';
import { hasApi } from '@/lib/api';
import { DEMO } from '@/lib/constants';
import { useApp } from '@/lib/store';
import { LangSwitch } from './Feed';
import { RoleSwitch } from './Profile';
import { Logo } from './ui';

/** Первый вход: регистрация (имя + группа → токен в localStorage) или демо-вход по ролям. */
export function Onboarding() {
  const { t, act, errorKey, refresh } = useApp();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await act.register(name.trim(), group.trim()); } catch (x) { setErr(String((x as Error).message || x)); }
    setBusy(false);
  };
  return (
    <div className="onb">
      <div className="flex items-center justify-between"><Logo size={44} /><LangSwitch /></div>
      <h1>Тармақ</h1>
      <p>{t('welcome')} · {t('college')}</p>
      {!hasApi && <div className="err">{t('noApi')}</div>}
      {hasApi && errorKey === 'offline' && <div className="err">{t('offline')} <button className="btn sm" onClick={refresh}>{t('retry')}</button></div>}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <input className="inp" id="regName" required minLength={2} placeholder={t('yourName')} value={name} onChange={e => setName(e.target.value)} />
        <input className="inp" id="regGroup" placeholder={t('yourGroup')} value={group} onChange={e => setGroup(e.target.value)} />
        <button className="btn pri" disabled={busy || !hasApi || name.trim().length < 2}>{busy ? t('loading') : t('join')}</button>
        {err && <div className="err">{err}</div>}
      </form>
      {DEMO && hasApi && <><span className="lbl">{t('demoLogin')}</span><RoleSwitch /></>}
    </div>
  );
}

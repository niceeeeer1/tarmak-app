'use client';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '@/lib/store';

export function SubBar({ title, right }: { title: string; right?: ReactNode }) {
  const { go } = useApp();
  return (
    <div className="top"><div className="bar">
      <div className="l"><button className="ib" aria-label="back" onClick={go.back}><ChevronLeft size={26} /></button></div>
      <div className="title">{title}</div>
      <div className="r">{right}</div>
    </div></div>
  );
}

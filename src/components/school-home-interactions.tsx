'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Images } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/locales.mjs';

export type SchoolGalleryItem = {
  id: string;
  category: string;
  title: string;
  summary: string | null;
  imageUrl: string;
  imageAlt: string;
  href: string;
};

export function SchoolReveal({ children }: { children: React.ReactNode }) {
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = revealRef.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

    element.classList.add('school-reveal-ready');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      element.classList.add('school-reveal-visible');
      observer.disconnect();
    }, { rootMargin: '0px 0px -48px 0px', threshold: 0.08 });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return <div className="school-reveal" ref={revealRef}>{children}</div>;
}

export function SchoolExperienceGallery({ items }: { items: SchoolGalleryItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { m, locale } = useI18n();
  // Arabic is right-to-left: "previous" scrolls towards the right.
  const rtl = locale === 'ar';

  function move(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: (rtl ? -direction : direction) * Math.max(track.clientWidth * 0.78, 290), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move((event.key === 'ArrowLeft') !== rtl ? -1 : 1);
  }

  if (!items.length) return <div className="school-gallery-empty"><span className="school-gallery-empty-icon"><Images size={24} /></span><div><h3>{m.gallery.emptyTitle}</h3><p>{m.gallery.emptyText}</p></div></div>;

  return <div className="school-gallery" role="region" aria-roledescription="carousel" aria-label={m.gallery.label}>
    <div className="school-gallery-controls">
      <p>{m.gallery.hint}</p>
      <div>
        <button type="button" className="school-gallery-control" aria-label={m.gallery.previous} onClick={() => move(-1)} disabled={items.length < 2}><ArrowLeft size={19} className="flip-rtl" /></button>
        <button type="button" className="school-gallery-control" aria-label={m.gallery.next} onClick={() => move(1)} disabled={items.length < 2}><ArrowRight size={19} className="flip-rtl" /></button>
      </div>
    </div>
    <div className="school-gallery-track" ref={trackRef} tabIndex={0} onKeyDown={handleKeyDown} aria-label={m.gallery.slides}>
      {items.map((item, index) => <article className="school-gallery-slide" key={item.id} role="group" aria-roledescription="slide" aria-label={fmt(m.gallery.slideOf, { n: index + 1, total: items.length })}>
        <Image src={item.imageUrl} alt={item.imageAlt} width={760} height={560} sizes="(max-width: 700px) 86vw, (max-width: 1100px) 54vw, 38vw" unoptimized />
        <div className="school-gallery-slide-copy"><span>{item.category}</span><h3 dir="auto">{item.title}</h3>{item.summary && <p dir="auto">{item.summary}</p>}<Link href={item.href}>{m.gallery.explore} {item.category.toLocaleLowerCase(locale)} <ArrowRight size={15} className="flip-rtl" /></Link></div>
      </article>)}
    </div>
  </div>;
}

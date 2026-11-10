'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Images } from 'lucide-react';
import { useEffect, useRef } from 'react';

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

  function move(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.78, 290), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  }

  if (!items.length) return <div className="school-gallery-empty"><span className="school-gallery-empty-icon"><Images size={24} /></span><div><h3>School photographs are being prepared</h3><p>Approved photos will appear after an administrator publishes school content with images and descriptions.</p></div></div>;

  return <div className="school-gallery" role="region" aria-roledescription="carousel" aria-label="Published Wisdom Land Academy photos">
    <div className="school-gallery-controls">
      <p>Swipe or use the arrow keys to browse published photos.</p>
      <div>
        <button type="button" className="school-gallery-control" aria-label="Show previous photos" onClick={() => move(-1)} disabled={items.length < 2}><ArrowLeft size={19} /></button>
        <button type="button" className="school-gallery-control" aria-label="Show next photos" onClick={() => move(1)} disabled={items.length < 2}><ArrowRight size={19} /></button>
      </div>
    </div>
    <div className="school-gallery-track" ref={trackRef} tabIndex={0} onKeyDown={handleKeyDown} aria-label="Photo slides">
      {items.map((item, index) => <article className="school-gallery-slide" key={item.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${items.length}`}>
        <Image src={item.imageUrl} alt={item.imageAlt} width={760} height={560} sizes="(max-width: 700px) 86vw, (max-width: 1100px) 54vw, 38vw" unoptimized />
        <div className="school-gallery-slide-copy"><span>{item.category}</span><h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}<Link href={item.href}>Explore {item.category.toLowerCase()} <ArrowRight size={15} /></Link></div>
      </article>)}
    </div>
  </div>;
}

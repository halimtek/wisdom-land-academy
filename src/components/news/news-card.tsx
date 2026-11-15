import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { fmt } from '@/i18n/locales.mjs';
import type { Messages } from '@/i18n/messages/en';
import type { NewsStory } from '@/lib/news';

/** Story date in the reader's language, as a calendar day in Ethiopia. */
export function storyDate(date: Date, intl: string) {
  return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Addis_Ababa' }).format(date);
}

export function NewsMeta({ story, m, intl }: { story: NewsStory; m: Messages; intl: string }) {
  return (
    <p className="news-meta">
      <time dateTime={story.date.toISOString()}>{storyDate(story.date, intl)}</time>
      <span aria-hidden="true">·</span>
      <span>{fmt(m.news.minRead, { n: story.minutes })}</span>
    </p>
  );
}

/**
 * A story card. The whole card is clickable through the headline link (one link per
 * card for screen readers). `lead` is the large top story on the news page.
 */
export function NewsCard({ story, href, m, intl, variant = 'card', headingLevel = 3 }: {
  story: NewsStory; href: string; m: Messages; intl: string; variant?: 'lead' | 'card' | 'compact'; headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className={`news-card news-card-${variant}${variant === 'lead' && !story.imageUrl ? ' news-card-lead-text' : ''}`}>
      {/* A top story without a photo is shown as a text-only headline, not an empty panel. */}
      {(story.imageUrl || variant !== 'lead') && (
        <div className="news-card-media">
          {story.imageUrl
            ? <Image src={story.imageUrl} alt="" width={variant === 'lead' ? 1100 : 640} height={variant === 'lead' ? 700 : 400} sizes={variant === 'lead' ? '(max-width: 900px) 100vw, 60vw' : '(max-width: 700px) 100vw, 33vw'} priority={variant === 'lead'} unoptimized />
            : <span className="news-card-placeholder" aria-hidden="true">WLA</span>}
        </div>
      )}
      <div className="news-card-body">
        {variant === 'lead' && <span className="news-kicker">{m.news.featured}</span>}
        <NewsMeta story={story} m={m} intl={intl} />
        <Heading className="news-card-title" dir="auto"><Link href={href}>{story.title}</Link></Heading>
        {variant !== 'compact' && story.excerpt && <p className="news-card-excerpt" dir="auto">{story.excerpt}</p>}
        <span className="news-card-more" aria-hidden="true">{variant === 'lead' ? m.news.readStory : m.news.readMore} <ArrowRight size={15} className="flip-rtl" /></span>
      </div>
    </article>
  );
}

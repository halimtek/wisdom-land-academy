import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { NewsCard, NewsMeta, storyDate } from '@/components/news/news-card';
import { ShareBar } from '@/components/news/share-bar';
import { SchoolSite } from '@/components/school-site';
import { LOCALES, LOCALE_INFO, fmt, isLocale, localePath } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { getMessages } from '@/i18n/server';
import { publishedNews, publishedStory } from '@/lib/news';
import { paragraphs } from '@/lib/news-format.mjs';
import { prisma } from '@/lib/prisma';
import '@/components/news/news.css';

// Each story is rendered on its first visit and then cached (ISR); admin edits
// refresh it through revalidatePublicPages().
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<'/[lang]/news/[id]'>): Promise<Metadata> {
  const { lang, id } = await params;
  const locale = isLocale(lang) ? lang : 'en';
  const [m, story] = await Promise.all([getMessages(locale), publishedStory(id)]);
  if (!story) return {};
  return {
    title: `${story.title} · ${m.common.schoolName}`,
    description: story.excerpt || m.news.intro,
    alternates: { languages: Object.fromEntries(LOCALES.map((code) => [code, localePath(code, `/news/${story.id}`)])) },
    // Link previews on Telegram, Facebook, WhatsApp…
    openGraph: {
      type: 'article',
      title: story.title,
      description: story.excerpt || undefined,
      siteName: m.common.schoolName,
      locale: LOCALE_INFO[locale].intl,
      publishedTime: story.date.toISOString(),
      modifiedTime: story.updatedAt.toISOString(),
      images: story.imageUrl ? [{ url: story.imageUrl, alt: story.imageAlt }] : undefined,
    },
    twitter: { card: story.imageUrl ? 'summary_large_image' : 'summary' },
  };
}

export default async function NewsStoryPage({ params }: PageProps<'/[lang]/news/[id]'>) {
  const { id } = await params;
  const { m, path, intl } = await getI18n();
  const [settings, story, latest] = await Promise.all([prisma.schoolSettings.findUnique({ where: { id: 'main' } }), publishedStory(id), publishedNews(4)]);
  if (!story) notFound();
  const more = latest.filter((other) => other.id !== story.id).slice(0, 3);
  // "Updated" only when the story changed on a later day than its date.
  const edited = story.updatedAt.getTime() - story.date.getTime() > 24 * 60 * 60 * 1000;
  const showCaption = story.imageAlt && story.imageAlt !== story.title;

  return (
    <SchoolSite settings={settings}>
      <article className="news-article">
        <header className="news-article-head">
          <nav className="news-breadcrumb" aria-label={m.news.breadcrumb}>
            <Link href={path('/')}>{m.news.home}</Link><span aria-hidden="true">/</span><Link href={path('/news')}>{m.nav.news}</Link>
          </nav>
          <span className="school-eyebrow">{m.news.eyebrow}</span>
          <h1 dir="auto">{story.title}</h1>
          {story.summary && <p className="news-standfirst" dir="auto">{story.summary}</p>}
          <div className="news-byline">
            <span className="news-source">{m.news.source}</span>
            <NewsMeta story={story} m={m} intl={intl} />
            {edited && <p className="news-updated">{fmt(m.news.updated, { date: storyDate(story.updatedAt, intl) })}</p>}
          </div>
        </header>

        {story.imageUrl && (
          <figure className="news-figure">
            <Image src={story.imageUrl} alt={story.imageAlt} width={1200} height={750} sizes="(max-width: 900px) 100vw, 900px" priority unoptimized />
            {showCaption && <figcaption dir="auto">{story.imageAlt}</figcaption>}
          </figure>
        )}

        <div className="news-body" dir="auto">
          {paragraphs(story.body).map((text, index) => <p key={index}>{text}</p>)}
        </div>

        <footer className="news-article-foot">
          <ShareBar title={story.title} />
          <Link className="news-back" href={path('/news')}><ArrowLeft size={16} aria-hidden="true" className="flip-rtl" />{m.news.back}</Link>
        </footer>
      </article>

      {more.length > 0 && (
        <section className="news-more" aria-labelledby="more-news">
          <div className="school-section-wrap">
            <div className="news-more-head"><h2 id="more-news">{m.news.more}</h2><Link href={path('/news')}>{m.news.allNews}</Link></div>
            <div className="news-grid">{more.map((other) => <NewsCard key={other.id} story={other} href={path(`/news/${other.id}`)} m={m} intl={intl} variant="compact" />)}</div>
          </div>
        </section>
      )}
    </SchoolSite>
  );
}

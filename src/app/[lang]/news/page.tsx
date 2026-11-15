import type { Metadata } from 'next';
import { NewsCard } from '@/components/news/news-card';
import { SchoolSite } from '@/components/school-site';
import { isLocale, plural } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { getMessages } from '@/i18n/server';
import { publishedNews } from '@/lib/news';
import { prisma } from '@/lib/prisma';
import '@/components/news/news.css';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<'/[lang]/news'>): Promise<Metadata> {
  const { lang } = await params;
  const m = await getMessages(isLocale(lang) ? lang : 'en');
  return { title: `${m.news.title} · ${m.common.schoolName}`, description: m.news.intro };
}

export default async function NewsPage() {
  const { m, path, intl } = await getI18n();
  const [settings, stories] = await Promise.all([prisma.schoolSettings.findUnique({ where: { id: 'main' } }), publishedNews()]);
  const [lead, ...rest] = stories;
  return (
    <SchoolSite settings={settings}>
      <section className="school-page-banner news-banner">
        <span className="school-eyebrow">{m.news.eyebrow}</span>
        <h1>{m.news.title}</h1>
        <p>{m.news.intro}</p>
        {stories.length > 0 && <span className="news-count">{plural(stories.length, m.news.count)}</span>}
      </section>
      <section className="news-section">
        <div className="school-section-wrap">
          {!lead ? (
            <div className="school-empty-card"><span className="school-empty-mark" aria-hidden="true">W</span><h3>{m.news.emptyTitle}</h3><p>{m.news.emptyText}</p></div>
          ) : (
            <>
              <NewsCard story={lead} href={path(`/news/${lead.id}`)} m={m} intl={intl} variant="lead" headingLevel={2} />
              {rest.length > 0 && (
                <>
                  <h2 className="news-section-title">{m.news.latest}</h2>
                  <div className="news-grid">{rest.map((story) => <NewsCard key={story.id} story={story} href={path(`/news/${story.id}`)} m={m} intl={intl} />)}</div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </SchoolSite>
  );
}

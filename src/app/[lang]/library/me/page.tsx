import { ArrowLeft, BookOpen, CheckCircle2, Clock, Flame, Layers } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GoalRing, ReaderChip } from '@/components/reading/whos-reading';
import { fmt, isLocale, plural } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { getMessages } from '@/i18n/server';
import { prisma } from '@/lib/prisma';
import { getReader } from '@/lib/reader-auth';
import { readerProgress, readingSummary } from '@/lib/reading-service';
import '../library-v2.css';

export async function generateMetadata({ params }: PageProps<'/[lang]/library/me'>) {
  const { lang } = await params;
  return { title: (await getMessages(isLocale(lang) ? lang : 'en')).meta.myReadingTitle };
}

const minutes = (seconds: number) => Math.floor(seconds / 60);
// Chart labels: show "<1" for a little reading so a visible bar never says 0.
const minuteLabel = (seconds: number) => (seconds > 0 && seconds < 60 ? '<1' : String(minutes(seconds)));

// Personal reading page for the signed-in student (per request, never cached).
export default async function MyReadingPage() {
  const { m, path, intl } = await getI18n();
  const t = m.me;
  const weekday = new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' });
  const reader = await getReader();
  if (!reader) {
    return (
      <main className="wla-lib wr-me">
        <Link href={path('/library')} className="wla-back-link"><ArrowLeft size={20} aria-hidden="true" className="flip-rtl" /> {m.library.back}</Link>
        <section className="wr-me-empty">
          <BookOpen size={40} aria-hidden="true" />
          <h1>{m.reading.myReading}</h1>
          <p>{t.emptyText}</p>
          <ReaderChip />
        </section>
      </main>
    );
  }

  const [summary, progress] = await Promise.all([readingSummary(reader.id), readerProgress(reader.id)]);
  const books = await prisma.book.findMany({ where: { id: { in: progress.map((p) => p.bookId) }, isPublished: true }, select: { id: true, title: true, author: true } });
  const titles = new Map(books.map((b) => [b.id, b]));
  const reading = progress.filter((p) => !p.finished && titles.has(p.bookId)).slice(0, 8);
  const finished = progress.filter((p) => p.finished && titles.has(p.bookId)).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const weekSeconds = summary.week.reduce((sum, d) => sum + d.seconds, 0);
  const weekPages = summary.days.filter((d) => summary.week.some((w) => w.day === d.day)).reduce((sum, d) => sum + d.pages, 0);
  const goal = summary.today.goalSeconds;
  const chartMax = Math.max(goal, ...summary.week.map((d) => d.seconds));

  return (
    <main className="wla-lib wr-me">
      <div className="wr-me-top">
        <Link href={path('/library')} className="wla-back-link"><ArrowLeft size={20} aria-hidden="true" className="flip-rtl" /> {m.library.back}</Link>
        <ReaderChip />
      </div>
      <header className="wr-me-head">
        <GoalRing seconds={summary.today.seconds} goalSeconds={goal} size={96} />
        <div>
          <p className="wla-eyebrow">{reader.gradeName ?? m.common.schoolName}</p>
          <h1>{fmt(t.titleFor, { name: reader.firstName })}</h1>
          <p>{summary.today.seconds >= goal
            ? t.goalReached
            : fmt(t.progress, { n: minutes(summary.today.seconds), goal: minutes(goal), left: Math.ceil((goal - summary.today.seconds) / 60) })}</p>
        </div>
      </header>

      <section className="wr-me-stats" aria-label={t.weekLabel}>
        <Stat icon={<Clock size={20} />} value={`${minutes(weekSeconds)}`} label={t.minutesWeek} />
        <Stat icon={<Flame size={20} />} value={`${summary.streak}`} label={plural(summary.streak, t.dayStreak)} />
        <Stat icon={<CheckCircle2 size={20} />} value={`${finished.length}`} label={plural(finished.length, t.booksFinished)} />
        <Stat icon={<Layers size={20} />} value={`${weekPages}`} label={t.pagesWeek} />
      </section>

      <section className="wr-me-card" aria-labelledby="week-title">
        <h2 id="week-title">{t.thisWeek}</h2>
        <div className="wr-chart" role="img" aria-label={summary.week.map((d) => fmt(t.dayMinutes, { day: weekday.format(new Date(`${d.day}T00:00:00Z`)), n: minutes(d.seconds) })).join(', ')}>
          <span className="wr-chart-goal" style={{ bottom: `${(goal / chartMax) * 100}%` }} aria-hidden="true"><b>{fmt(t.goal, { n: minutes(goal) })}</b></span>
          {summary.week.map((d) => (
            <div key={d.day} className="wr-chart-col" aria-hidden="true">
              <span className={`wr-chart-bar${d.seconds >= goal ? ' is-goal' : ''}`} style={{ height: `${Math.max(d.seconds > 0 ? 3 : 0, (d.seconds / chartMax) * 100)}%` }} />
              <small>{weekday.format(new Date(`${d.day}T00:00:00Z`))}</small>
              <em>{minuteLabel(d.seconds)}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="wr-me-card" aria-labelledby="reading-title">
        <h2 id="reading-title">{t.keepReading}</h2>
        {reading.length === 0 ? <p className="wr-me-note">{t.keepReadingEmpty}</p> : (
          <ul className="wr-me-books">
            {reading.map((p) => {
              const book = titles.get(p.bookId)!;
              const percent = p.totalPages ? Math.round((p.pagesViewed / p.totalPages) * 100) : 0;
              return (
                <li key={p.bookId}>
                  <Link href={path(`/library/books/${p.bookId}/read`)}>
                    <span><strong dir="auto">{book.title}</strong><small>{fmt(t.bookLine, { page: p.page, total: p.totalPages || '?', n: minutes(p.secondsRead) })}</small></span>
                    <span className="wla-progress-line" aria-label={fmt(m.library.percentRead, { n: percent })}><span style={{ width: `${percent}%` }} /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {finished.length > 0 && (
        <section className="wr-me-card" aria-labelledby="finished-title">
          <h2 id="finished-title">{t.finishedTitle}</h2>
          <ul className="wr-me-finished">
            {finished.map((p) => <li key={p.bookId}><CheckCircle2 size={18} aria-hidden="true" /><span><strong dir="auto">{titles.get(p.bookId)!.title}</strong><small>{fmt(t.finishedLine, { n: minutes(p.secondsRead), pages: p.totalPages })}</small></span></li>)}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return <div className="wr-stat"><span aria-hidden="true">{icon}</span><strong>{value}</strong><small>{label}</small></div>;
}

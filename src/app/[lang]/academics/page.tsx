import { ArrowUpRight, BookOpen, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { getI18n } from '@/i18n/page';
import { fmt } from '@/i18n/locales.mjs';
import { prisma } from '@/lib/prisma';
import { SchoolSite, SectionHeading } from '@/components/school-site';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

export default async function AcademicsPage() {
  const { m, path } = await getI18n();
  const t = m.academics;
  const [settings, grades] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 'main' } }),
    prisma.grade.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const supportedGradeNumbers = [...new Set(grades.flatMap(({ name }) => {
    const match = /^(?:grade\s*|g\s*)?(\d+)$/i.exec(name.trim());
    const number = match ? Number(match[1]) : 0;
    return number >= 1 && number <= 8 ? [number] : [];
  }))].sort((a, b) => a - b);
  const gradeNames = (supportedGradeNumbers.length ? supportedGradeNumbers : Array.from({ length: 8 }, (_, index) => index + 1)).map((number) => fmt(t.gradeN, { n: number }));
  return <SchoolSite settings={settings}>
    <section className="school-page-banner academics-banner"><span className="school-eyebrow">{t.eyebrow}</span><h1>{t.titleLine1}<br /><em>{t.titleLine2}</em></h1><p>{t.intro}</p><Link className="school-button school-button-gold" href={path('/library')}>{t.browse} <ArrowUpRight size={16} className="flip-rtl" /></Link></section>
    <section className="academics-section"><div className="school-section-wrap"><SectionHeading eyebrow={t.levelsEyebrow} title={t.levelsTitle} description={t.levelsText} /><div className="grade-level-grid">{gradeNames.map((name, index) => <article key={`${name}-${index}`} className="grade-level-card"><span><GraduationCap size={19} /></span><div><small>{t.level}</small><h3>{name}</h3></div><BookOpen size={17} aria-hidden="true" /></article>)}</div></div></section>
  </SchoolSite>;
}

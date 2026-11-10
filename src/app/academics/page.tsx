import { ArrowUpRight, BookOpen, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { SchoolSite, SectionHeading } from '@/components/school-site';

export const instant = false;

export default async function AcademicsPage() {
  const [settings, grades] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 'main' } }),
    prisma.grade.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const supportedGradeNumbers = [...new Set(grades.flatMap(({ name }) => {
    const match = /^(?:grade\s*|g\s*)?(\d+)$/i.exec(name.trim());
    const number = match ? Number(match[1]) : 0;
    return number >= 1 && number <= 8 ? [number] : [];
  }))].sort((a, b) => a - b);
  const gradeNames = (supportedGradeNumbers.length ? supportedGradeNumbers : Array.from({ length: 8 }, (_, index) => index + 1)).map((number) => `Grade ${number}`);
  return <SchoolSite settings={settings}>
    <section className="school-page-banner academics-banner"><span className="school-eyebrow">ACADEMICS · GRADES 1–8</span><h1>Learning at every<br /><em>stage of the journey.</em></h1><p>Explore the school’s published learning resources, organized for WLA learners.</p><Link className="school-button school-button-gold" href="/library">Browse the Digital Library <ArrowUpRight size={16} /></Link></section>
    <section className="academics-section"><div className="school-section-wrap"><SectionHeading eyebrow="GRADE LEVELS" title="A foundation for lifelong learning" description="Wisdom Land Academy serves students from Grade 1 through Grade 8." /><div className="grade-level-grid">{gradeNames.map((name, index) => <article key={`${name}-${index}`} className="grade-level-card"><span><GraduationCap size={19} /></span><div><small>LEARNING LEVEL</small><h3>{name}</h3></div><BookOpen size={17} aria-hidden="true" /></article>)}</div></div></section>
  </SchoolSite>;
}

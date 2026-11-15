import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  ChevronRight,
  FlaskConical,
  GraduationCap,
} from 'lucide-react';
import { getI18n } from '@/i18n/page';
import { NewsCard } from '@/components/news/news-card';
import { publishedNews } from '@/lib/news';
import { prisma } from '@/lib/prisma';
import '@/components/news/news.css';
import {
  PublicContact,
  SchoolContentGrid,
  SchoolHeroPhoto,
  SchoolSite,
  SectionHeading,
} from '@/components/school-site';
import { SchoolExperienceGallery, SchoolReveal } from '@/components/school-home-interactions';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

const exploreLinks = [
  { href: '/about', eyebrow: 'exploreAboutEyebrow', title: 'exploreAboutTitle', description: 'exploreAboutText', icon: Building2, className: 'school-explore-about' },
  { href: '/academics', eyebrow: null, title: 'exploreAcademicsTitle', description: 'exploreAcademicsText', icon: GraduationCap, className: 'school-explore-academics' },
  { href: '/activities', eyebrow: 'exploreActivitiesEyebrow', title: 'exploreActivitiesTitle', description: 'exploreActivitiesText', icon: FlaskConical, className: 'school-explore-activities' },
] as const;

export default async function HomePage() {
  const { m, path, intl } = await getI18n();
  const h = m.home;
  const [settings, activities, projects, staff, news, books] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 'main' } }),
    prisma.schoolContent.findMany({ where: { kind: 'ACTIVITY', isPublished: true }, orderBy: [{ eventDate: 'desc' }, { updatedAt: 'desc' }], take: 4 }),
    prisma.schoolContent.findMany({ where: { kind: 'STUDENT_PROJECT', isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 4 }),
    prisma.schoolContent.findMany({ where: { kind: 'STAFF_PROFILE', isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 3 }),
    publishedNews(3),
    prisma.book.findMany({ where: { isPublished: true, bookType: 'GRADE_BASED' }, orderBy: { title: 'asc' }, take: 4, select: { id: true, title: true, description: true, subject: { select: { name: true, grade: { select: { name: true } } } } } }),
  ]);

  const galleryItems = [
    ...activities.map((item) => ({ ...item, category: m.gallery.categoryActivity, href: path('/activities') })),
    ...projects.map((item) => ({ ...item, category: m.gallery.categoryStudentWork, href: path('/students') })),
    ...staff.map((item) => ({ ...item, category: m.gallery.categoryStaff, href: path('/staff') })),
  ]
    .filter((item) => item.imagePath)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      category: item.category,
      title: item.title,
      summary: item.summary,
      imageUrl: `/api/site-media/content-${encodeURIComponent(item.id)}`,
      imageAlt: item.imageAlt || item.title,
      href: item.href,
    }));
  // News photos open their own story.
  for (const story of news) {
    if (story.imageUrl && galleryItems.length < 8) galleryItems.push({ id: story.id, category: m.gallery.categoryNews, title: story.title, summary: story.excerpt, imageUrl: story.imageUrl, imageAlt: story.imageAlt, href: path(`/news/${story.id}`) });
  }

  return <SchoolSite settings={settings}>
    <section className="school-home-hero">
      <div className="school-home-hero-media">
        <SchoolHeroPhoto settings={settings} />
      </div>
      <div className="school-home-hero-inner">
        <div className="school-home-copy">
          <span className="school-eyebrow">{m.common.schoolNameUpper} <i aria-hidden="true" /> {m.common.gradesUpper}</span>
          <h1>{h.welcome}<br /><em>{h.welcomeName}</em></h1>
          <p>{h.intro}</p>
          <div className="school-home-actions">
            <Link className="school-button school-button-primary" href={path('/about')}>{h.discover} <ChevronRight size={18} className="flip-rtl" /></Link>
            <Link className="school-button school-button-outline" href={path('/library')}><BookOpen size={18} /> {m.site.exploreLibrary}</Link>
          </div>
          <span className="school-home-tagline">“{m.common.tagline}”</span>
        </div>
        <a className="school-hero-discover" href="#explore-wla" aria-label={h.scrollLabel}><span>{h.exploreWla}</span><span aria-hidden="true">↓</span></a>
      </div>
    </section>

    <div className="school-home-intro-strip">
      <span><GraduationCap size={19} /> {m.common.schoolNameUpper} · {m.common.gradesUpper}</span>
      <span>{h.strip}</span>
      <Link href={path('/academics')}>{h.stripLink} <ArrowUpRight size={15} className="flip-rtl" /></Link>
    </div>

    <SchoolReveal>
      <section className="school-home-section school-explore-section" id="explore-wla">
        <div className="school-section-wrap">
          <SectionHeading eyebrow={h.discoverEyebrow} title={h.discoverTitle} description={h.discoverText} />
          <div className="school-explore-grid">
            {exploreLinks.map(({ href, eyebrow, title, description, icon: Icon, className }, index) => <Link className={`school-explore-card ${className}`} href={path(href)} key={href}>
              <span className="school-explore-index">0{index + 1}</span>
              <span className="school-explore-icon"><Icon size={24} strokeWidth={1.6} /></span>
              <span className="school-explore-eyebrow">{eyebrow ? h[eyebrow] : m.common.gradesUpper}</span>
              <strong>{h[title]}</strong>
              <span className="school-explore-description">{h[description]}</span>
              <span className="school-explore-arrow" aria-hidden="true"><ArrowUpRight size={20} className="flip-rtl" /></span>
            </Link>)}
          </div>
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-gallery-section">
        <div className="school-section-wrap">
          <SectionHeading eyebrow={h.galleryEyebrow} title={h.galleryTitle} description={h.galleryText} href={path('/activities')} action={h.galleryAction} />
          <SchoolExperienceGallery items={galleryItems} />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section">
        <div className="school-section-wrap">
          <SectionHeading eyebrow={h.activitiesEyebrow} title={h.activitiesTitle} description={h.activitiesText} href={path('/activities')} action={h.activitiesAction} />
          <SchoolContentGrid items={activities} emptyTitle={h.activitiesEmptyTitle} emptyText={h.activitiesEmptyText} />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section school-home-tinted">
        <div className="school-section-wrap">
          <SectionHeading eyebrow={h.studentsEyebrow} title={h.studentsTitle} description={h.studentsText} href={path('/students')} action={h.studentsAction} />
          <SchoolContentGrid items={projects} emptyTitle={h.studentsEmptyTitle} emptyText={h.studentsEmptyText} />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section school-home-staff">
        <div className="school-section-wrap">
          <SectionHeading eyebrow={h.staffEyebrow} title={h.staffTitle} description={h.staffText} href={path('/staff')} action={h.staffAction} />
          <SchoolContentGrid items={staff} emptyTitle={h.staffEmptyTitle} emptyText={h.staffEmptyText} />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-academics-band">
        <div><span className="school-eyebrow">{h.academicsEyebrow}</span><h2>{h.academicsTitle}</h2><p>{h.academicsText}</p></div>
        <Link className="school-button school-button-light" href={path('/academics')}>{h.academicsAction} <ChevronRight size={17} className="flip-rtl" /></Link>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section school-home-tinted">
        <div className="school-section-wrap">
          <SectionHeading eyebrow={h.newsEyebrow} title={h.newsTitle} description={h.newsText} href={path('/news')} action={h.newsAction} />
          {news.length
            ? <div className="news-grid news-home-grid">{news.map((story) => <NewsCard key={story.id} story={story} href={path(`/news/${story.id}`)} m={m} intl={intl} />)}</div>
            : <div className="school-empty-card"><span className="school-empty-mark" aria-hidden="true">W</span><h3>{h.newsEmptyTitle}</h3><p>{h.newsEmptyText}</p></div>}
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-library">
        <div className="school-library-banner">
          <span className="school-library-icon"><BookOpen size={25} /></span>
          <div><span className="school-eyebrow">{h.libraryEyebrow}</span><h2>{h.libraryTitle}</h2><p>{h.libraryText}</p></div>
          <Link className="school-button school-button-primary" href={path('/library')}>{h.libraryAction} <ChevronRight size={17} className="flip-rtl" /></Link>
        </div>
        <div className="school-home-book-row">{books.length ? books.map((book) => <Link className="school-home-book" href={path('/library')} key={book.id}><span dir="auto">{book.subject!.grade.name} · {book.subject!.name}</span><strong dir="auto">{book.title}</strong>{book.description && <small dir="auto">{book.description}</small>}</Link>) : <p className="school-home-book-empty">{h.libraryEmpty}</p>}</div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-contact-band"><div><span className="school-eyebrow">{m.common.schoolNameUpper}</span><h2>{h.connectTitle}</h2></div><PublicContact settings={settings} /></section>
    </SchoolReveal>
  </SchoolSite>;
}

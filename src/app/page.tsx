import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  ChevronRight,
  FlaskConical,
  GraduationCap,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import {
  PublicContact,
  SchoolContentGrid,
  SchoolHeroPhoto,
  SchoolSite,
  SectionHeading,
} from '@/components/school-site';
import { SchoolExperienceGallery, SchoolReveal } from '@/components/school-home-interactions';

export const instant = false;

const exploreLinks = [
  {
    href: '/about',
    eyebrow: 'OUR SCHOOL',
    title: 'Get to know WLA',
    description: 'Read the school’s story and verified information shared by the administration.',
    icon: Building2,
    className: 'school-explore-about',
  },
  {
    href: '/academics',
    eyebrow: 'GRADES 1–8',
    title: 'Explore academics',
    description: 'Find grade levels and browse learning resources available in the library.',
    icon: GraduationCap,
    className: 'school-explore-academics',
  },
  {
    href: '/activities',
    eyebrow: 'SCHOOL LIFE',
    title: 'See what we do',
    description: 'Browse activities and events published by Wisdom Land Academy.',
    icon: FlaskConical,
    className: 'school-explore-activities',
  },
];

export default async function HomePage() {
  const [settings, activities, projects, staff, news, books] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 'main' } }),
    prisma.schoolContent.findMany({ where: { kind: 'ACTIVITY', isPublished: true }, orderBy: [{ eventDate: 'desc' }, { updatedAt: 'desc' }], take: 4 }),
    prisma.schoolContent.findMany({ where: { kind: 'STUDENT_PROJECT', isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 4 }),
    prisma.schoolContent.findMany({ where: { kind: 'STAFF_PROFILE', isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 3 }),
    prisma.schoolContent.findMany({ where: { kind: 'ANNOUNCEMENT', isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 3 }),
    prisma.book.findMany({ where: { isPublished: true, bookType: 'GRADE_BASED' }, orderBy: { title: 'asc' }, take: 4, select: { id: true, title: true, description: true, subject: { select: { name: true, grade: { select: { name: true } } } } } }),
  ]);

  const galleryItems = [
    ...activities.map((item) => ({ ...item, category: 'School activity', href: '/activities' })),
    ...projects.map((item) => ({ ...item, category: 'Student work', href: '/students' })),
    ...staff.map((item) => ({ ...item, category: 'Our staff', href: '/staff' })),
    ...news.map((item) => ({ ...item, category: 'School news', href: '/news' })),
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

  return <SchoolSite settings={settings}>
    <section className="school-home-hero">
      <div className="school-home-hero-media">
        <SchoolHeroPhoto settings={settings} />
      </div>
      <div className="school-home-hero-inner">
        <div className="school-home-copy">
          <span className="school-eyebrow">WISDOM LAND ACADEMY <i aria-hidden="true" /> GRADES 1–8</span>
          <h1>Welcome to<br /><em>Wisdom Land Academy.</em></h1>
          <p>A place for learners to ask questions, explore ideas, and build a strong foundation for the future.</p>
          <div className="school-home-actions">
            <Link className="school-button school-button-primary" href="/about">Discover our school <ChevronRight size={18} /></Link>
            <Link className="school-button school-button-outline" href="/library"><BookOpen size={18} /> Explore the Digital Library</Link>
          </div>
          <span className="school-home-tagline">“Where Passion Becomes a Profession.”</span>
        </div>
        <a className="school-hero-discover" href="#explore-wla" aria-label="Scroll to explore Wisdom Land Academy"><span>EXPLORE WLA</span><span aria-hidden="true">↓</span></a>
      </div>
    </section>

    <div className="school-home-intro-strip">
      <span><GraduationCap size={19} /> WISDOM LAND ACADEMY · GRADES 1–8</span>
      <span>Learning, school life, and published resources</span>
      <Link href="/academics">About our learning <ArrowUpRight size={15} /></Link>
    </div>

    <SchoolReveal>
      <section className="school-home-section school-explore-section" id="explore-wla">
        <div className="school-section-wrap">
          <SectionHeading eyebrow="DISCOVER WISDOM LAND ACADEMY" title="A place to learn, grow, and discover." description="Start with the school’s story, explore Grades 1–8, or see activities shared by the WLA community." />
          <div className="school-explore-grid">
            {exploreLinks.map(({ href, eyebrow, title, description, icon: Icon, className }, index) => <Link className={`school-explore-card ${className}`} href={href} key={href}>
              <span className="school-explore-index">0{index + 1}</span>
              <span className="school-explore-icon"><Icon size={24} strokeWidth={1.6} /></span>
              <span className="school-explore-eyebrow">{eyebrow}</span>
              <strong>{title}</strong>
              <span className="school-explore-description">{description}</span>
              <span className="school-explore-arrow" aria-hidden="true"><ArrowUpRight size={20} /></span>
            </Link>)}
          </div>
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-gallery-section">
        <div className="school-section-wrap">
          <SectionHeading eyebrow="SCHOOL LIFE GALLERY" title="Moments from the WLA community" description="Photos appear here when administrators publish approved school content." href="/activities" action="Browse school life" />
          <SchoolExperienceGallery items={galleryItems} />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section">
        <div className="school-section-wrap">
          <SectionHeading eyebrow="LIFE AT WLA" title="Recent school activities" description="Activities and events shared by the school community." href="/activities" action="All activities" />
          <SchoolContentGrid items={activities} emptyTitle="School activities will appear here" emptyText="Approved science exhibitions, STEM activities, sports, celebrations, classroom projects, and events will be shared here by the school." />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section school-home-tinted">
        <div className="school-section-wrap">
          <SectionHeading eyebrow="STUDENT WORK" title="Our students" description="Approved projects and learning experiences from WLA students." href="/students" action="View student work" />
          <SchoolContentGrid items={projects} emptyTitle="Student work is being prepared" emptyText="The school will share approved projects and achievements after the required student or guardian authorization is confirmed." />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section school-home-staff">
        <div className="school-section-wrap">
          <SectionHeading eyebrow="OUR SCHOOL COMMUNITY" title="Our staff" description="Meet teachers and staff through profiles approved for the school website." href="/staff" action="Meet our staff" />
          <SchoolContentGrid items={staff} emptyTitle="Staff introductions are being prepared" emptyText="Approved staff profiles will appear here when the school adds them." />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-academics-band">
        <div><span className="school-eyebrow">ACADEMICS · GRADES 1–8</span><h2>A strong foundation for every learner.</h2><p>Explore grade levels and the published learning resources available in the digital library.</p></div>
        <Link className="school-button school-button-light" href="/academics">Explore academics <ChevronRight size={17} /></Link>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-section school-home-tinted">
        <div className="school-section-wrap">
          <SectionHeading eyebrow="NEWS & ANNOUNCEMENTS" title="Latest from WLA" description="Updates published by the school administration." href="/news" action="All announcements" />
          <SchoolContentGrid items={news} emptyTitle="News and announcements will appear here" emptyText="Verified updates from the school will be posted here when available." />
        </div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-home-library">
        <div className="school-library-banner">
          <span className="school-library-icon"><BookOpen size={25} /></span>
          <div><span className="school-eyebrow">READ · LEARN · GROW</span><h2>Explore the Digital Library</h2><p>Browse published textbooks by grade and subject. Available on the school network without signing in.</p></div>
          <Link className="school-button school-button-primary" href="/library">Browse books <ChevronRight size={17} /></Link>
        </div>
        <div className="school-home-book-row">{books.length ? books.map((book) => <Link className="school-home-book" href="/library" key={book.id}><span>{book.subject!.grade.name} · {book.subject!.name}</span><strong>{book.title}</strong>{book.description && <small>{book.description}</small>}</Link>) : <p className="school-home-book-empty">Published textbooks will appear here as the school library grows.</p>}</div>
      </section>
    </SchoolReveal>

    <SchoolReveal>
      <section className="school-contact-band"><div><span className="school-eyebrow">WISDOM LAND ACADEMY</span><h2>Connect with our school.</h2></div><PublicContact settings={settings} /></section>
    </SchoolReveal>
  </SchoolSite>;
}

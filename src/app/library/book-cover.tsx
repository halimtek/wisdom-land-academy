import Image from 'next/image';

/** Book cover with a clean WLA placeholder. Lazy-loaded unless `priority`. */
export function BookCover({ id, title, hasCover, priority = false, sizes }: { id: string; title: string; hasCover: boolean; priority?: boolean; sizes: string }) {
  if (!hasCover) {
    return (
      <div className="wla-cover-placeholder" role="img" aria-label={`${title} (no cover image)`}>
        <span>WLA</span>
        <strong>{title}</strong>
      </div>
    );
  }
  return <Image src={`/api/site-media/book-cover-${id}`} alt={`Cover of ${title}`} fill sizes={sizes} priority={priority} className="wla-cover-image" />;
}
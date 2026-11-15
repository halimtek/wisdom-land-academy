import Image from 'next/image';

/** Book cover with a clean WLA placeholder. Lazy-loaded unless `priority`. */
/** `noCoverLabel` / `coverAlt` are the translated accessible names (e.g. "Cover of {title}"). */
export function BookCover({ id, title, hasCover, priority = false, sizes, noCoverLabel, coverAlt }: { id: string; title: string; hasCover: boolean; priority?: boolean; sizes: string; noCoverLabel: string; coverAlt: string }) {
  if (!hasCover) {
    return (
      <div className="wla-cover-placeholder" role="img" aria-label={noCoverLabel}>
        <span>WLA</span>
        <strong>{title}</strong>
      </div>
    );
  }
  return <Image src={`/api/site-media/book-cover-${id}`} alt={coverAlt} fill sizes={sizes} priority={priority} className="wla-cover-image" />;
}
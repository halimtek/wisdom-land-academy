import LibraryPageContent from './library-page';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

export default function LibraryPage() {
  return <LibraryPageContent />;
}

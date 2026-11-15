import { notFound } from 'next/navigation';

// Any address under /en, /am, /om or /ar that is not a page shows the translated 404.
export default function UnknownPage() {
  notFound();
}

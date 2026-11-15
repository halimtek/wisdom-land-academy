import Image from 'next/image';
import Link from 'next/link';
import { getI18n } from '@/i18n/page';

export default async function NotFound() {
  const { m, path } = await getI18n();
  return (
    <main className="wla-not-found">
      <Image src="/images/wla-emblem.png" alt={m.common.emblemAlt} width={88} height={88} />
      <p className="wla-not-found-code">404</p>
      <h1>{m.notFound.title}</h1>
      <p>{m.notFound.text}</p>
      <div className="wla-not-found-actions">
        <Link className="school-button school-button-primary" href={path('/')}>{m.notFound.home}</Link>
        <Link className="school-button school-button-outline" href={path('/library')}>{m.notFound.library}</Link>
      </div>
    </main>
  );
}

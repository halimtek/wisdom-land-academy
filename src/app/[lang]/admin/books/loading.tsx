// Shown while the books page loads on first navigation (filters and paging after
// that keep the current list visible with a loading indicator instead).
import { getI18n } from '@/i18n/page';

export default async function LoadingBooks() {
  const { m } = await getI18n();
  return (
    <div className="al-page" aria-busy="true">
      <p className="al-sr" role="status">{m.admin.books.loading}</p>
      <div className="al-heading"><div><div className="al-skeleton" style={{ width: 150, height: 12 }} /><div className="al-skeleton" style={{ width: 260, height: 38, marginTop: 12 }} /></div></div>
      <div className="al-stats">{[0, 1, 2].map((i) => <div key={i} className="al-skeleton" style={{ height: 84 }} />)}</div>
      <div className="al-panel" style={{ padding: 14 }}>
        <div className="al-skeleton" style={{ height: 40, marginBottom: 14 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="al-skeleton" style={{ height: 56, marginBottom: 8 }} />)}
      </div>
    </div>
  );
}

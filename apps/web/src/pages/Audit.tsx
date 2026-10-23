import { EmptyState } from '../components/State';
import { PageHeader } from '../components/PageHeader';

/** /audit: who did what, live (placeholder until the campaign tools land). */
export function AuditPage() {
  return (
    <main className="page">
      <PageHeader title="Audit log" />
      <div className="card pad">
        <EmptyState title="Coming in this build" />
      </div>
    </main>
  );
}

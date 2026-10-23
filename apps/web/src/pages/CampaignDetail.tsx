import { EmptyState } from '../components/State';
import { PageHeader } from '../components/PageHeader';

/** /campaigns/:id: campaign KPIs, per-variant funnel, timeline and audit (placeholder until the campaign tools land). */
export function CampaignDetailPage() {
  return (
    <main className="page">
      <PageHeader title="Campaign details" />
      <div className="card pad">
        <EmptyState title="Coming in this build" action={{ label: 'Back to Campaign 360', to: '/campaigns' }} />
      </div>
    </main>
  );
}

import { useLocation } from 'react-router-dom';
import { EmptyState } from '../components/State';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <main className="page">
      <PageHeader title="Page not found" icon="alert" />
      <div className="card pad">
        <EmptyState
          title="There’s nothing at this address"
          body={
            <>
              <code className="mono">{pathname}</code> isn’t a page in this demo.
            </>
          }
          action={{ label: 'Go to the Dashboard', to: '/feeders' }}
        />
      </div>
    </main>
  );
}

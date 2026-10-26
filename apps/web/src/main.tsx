import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { ClientProvider } from './lib/ClientProvider';
import { Shell } from './components/Shell';
import { FeedersPage } from './pages/Feeders';
import { CampaignsPage } from './pages/Campaigns';
import { EventsPage } from './pages/Events';
import { DemoPage } from './pages/Demo';
import { CampaignKeyed } from './pages/CampaignKeyed';
import { CampaignDetailPage } from './pages/CampaignDetail';
import { AuditPage } from './pages/Audit';
import { AssistantPage } from './pages/Assistant';
import { NotFoundPage } from './pages/NotFound';
import { ReportsPage } from './pages/ReportsLazy';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ClientProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Navigate to="/feeders" replace />} />
            <Route path="/feeders" element={<FeedersPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/new" element={<CampaignKeyed />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route
              path="/reports"
              element={
                <Suspense fallback={<main className="page"><p className="sub" role="status">Loading reports…</p></main>}>
                  <ReportsPage />
                </Suspense>
              }
            />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/login" element={<Navigate to="/feeders" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ClientProvider>
  </StrictMode>,
);


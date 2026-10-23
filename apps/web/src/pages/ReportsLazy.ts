import { lazy } from 'react';

/** Reports pulls in Recharts; load it only when the route is visited. */
export const ReportsPage = lazy(() => import('./Reports').then((m) => ({ default: m.ReportsPage })));

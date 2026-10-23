import { useLocation } from 'react-router-dom';
import { CampaignNewPage } from './CampaignNew';

/** Remount the campaign form whenever the prefill query string changes (e.g. clicking another "Target" button). */
export function CampaignKeyed() {
  const { search } = useLocation();
  return <CampaignNewPage key={search} />;
}

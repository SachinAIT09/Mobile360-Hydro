import { BRAND } from '@demo/shared';
import { useLoad } from '../lib/client';
import { CardHeader } from './CardHeader';
import { ErrorNotice, LoadingBlock } from './State';
import './addons.css';

/** QR code and URL for opening the customer app on a phone on the same network. */
export function PhonePairingCard() {
  const phone = useLoad((api) => api.demoPhone());
  return (
    <div className="card pad stack gap10">
      <CardHeader icon="phone" tone="accent" title="Phone pairing" sub={`Scan to open the ${BRAND.appName} app on a phone on the same network.`} />
      {phone.error && <ErrorNotice message={phone.error} onRetry={() => void phone.reload()} />}
      {phone.loading && !phone.data && <LoadingBlock rows={2} rowHeight={60} label="Loading QR code" />}
      {phone.data && (
        <div className="row gap16 center">
          {/* The SVG comes from our own API (qrcode library output), not from user input. */}
          <div className="qr" role="img" aria-label={`QR code for ${phone.data.url}`} dangerouslySetInnerHTML={{ __html: phone.data.qrSvg }} />
          <div className="stack gap6" style={{ minWidth: 0 }}>
            <a className="mono small" href={phone.data.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
              {phone.data.url}
            </a>
            <span className="small muted">Sign in with manny@demo.test (unenrolled) or priya@demo.test (enrolled), any password.</span>
          </div>
        </div>
      )}
    </div>
  );
}

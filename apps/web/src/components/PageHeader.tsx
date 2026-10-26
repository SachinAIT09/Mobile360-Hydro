import { useEffect, type ReactNode } from 'react';
import { BRAND } from '@demo/shared';
import { Icon, type IconName } from './icons';

/**
 * Page header: a 42px icon tile, the page H1 and a one-line subtitle, with optional actions on the right.
 * Also sets the document title.
 */
export function PageHeader({ title, icon, sub, actions }: { title: string; icon: IconName; sub?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${BRAND.staffProductName}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
  return (
    <div className="page-head">
      <span className="head-tile" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <div className="head-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row gap8 center">{actions}</div>}
    </div>
  );
}

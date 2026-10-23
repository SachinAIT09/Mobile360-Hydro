import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export interface CardHeaderProps {
  title: ReactNode;
  /** One-line description under the title. */
  sub?: ReactNode;
  /** Buttons (e.g. Export CSV, a toggle) aligned to the right. */
  actions?: ReactNode;
  icon?: IconName;
  /** Tint of the icon tile; matches .ic-tile modifiers in styles.css. */
  tone?: 'accent' | 'solar' | 'ok' | 'warn' | 'danger';
  id?: string;
}

/** Card heading in the dashboard idiom: icon tile + h2 + sub-line, optional actions on the right. */
export function CardHeader({ title, sub, actions, icon, tone, id }: CardHeaderProps) {
  return (
    <div className="card-head" style={{ alignItems: 'flex-start' }}>
      {icon && (
        <span className={`ic-tile ${tone ?? ''}`.trim()}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <div className="stack gap4" style={{ flex: 1, minWidth: 0 }}>
        <h2 id={id} className="h2">
          {title}
        </h2>
        {sub ? <p className="small muted" style={{ fontSize: 13 }}>{sub}</p> : null}
      </div>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}

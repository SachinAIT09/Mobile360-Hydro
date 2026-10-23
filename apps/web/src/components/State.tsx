import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared loading / error / empty states for staff pages.
 * Styles live in styles.css (.skeleton, .state-*). Not yet applied to pages: that happens with the redesign.
 */

export interface LoadingBlockProps {
  /** Number of shimmer rows. */
  rows?: number;
  /** Row height in px. */
  rowHeight?: number;
  /** Screen-reader text; the shimmer itself is decorative. */
  label?: string;
  className?: string;
}

/** Skeleton rows with a CSS shimmer; `aria-busy` so assistive tech knows the region is still loading. */
export function LoadingBlock({ rows = 3, rowHeight = 16, label = 'Loading', className }: LoadingBlockProps) {
  return (
    <div className={`stack gap10 ${className ?? ''}`.trim()} aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className="skeleton"
          aria-hidden="true"
          // Vary the width a little so it reads as placeholder text rather than bars.
          style={{ height: rowHeight, width: i === rows - 1 && rows > 1 ? '62%' : '100%' }}
        />
      ))}
    </div>
  );
}

export interface ErrorNoticeProps {
  message: string;
  /** Optional retry; renders a "Try again" link-button. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorNotice({ message, onRetry, retryLabel = 'Try again', className }: ErrorNoticeProps) {
  return (
    <div className={`notice err ${className ?? ''}`.trim()} role="alert">
      {message}
      {onRetry ? (
        <>
          {' '}
          <button type="button" className="linkbtn" onClick={onRetry}>
            {retryLabel}
          </button>
        </>
      ) : null}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  /** Optional call to action rendered as a router link. */
  action?: { label: string; to: string };
  className?: string;
}

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div className={`state-empty ${className ?? ''}`.trim()}>
      <p className="h2">{title}</p>
      {body ? <p className="sub">{body}</p> : null}
      {action ? (
        <Link className="btn sec sm" to={action.to}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

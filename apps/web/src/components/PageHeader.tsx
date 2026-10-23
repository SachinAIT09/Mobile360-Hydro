import { useContext, useEffect, useState, type ReactNode } from 'react';
import { PageTitleContext } from '../lib/pageTitle';

/** Holds the current page title so the Shell's top bar can render it. */
export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('');
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

/**
 * Declares the page title for the Shell's top bar and the document title.
 * Renders nothing: the top bar owns the visible h1.
 */
export function PageHeader({ title }: { title: string }) {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
    const prev = document.title;
    document.title = `${title} · Grid Edge Insights`;
    return () => {
      document.title = prev;
    };
  }, [title, setTitle]);
  return null;
}

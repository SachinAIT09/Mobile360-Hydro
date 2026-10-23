import { createContext, useContext } from 'react';

export interface PageTitleCtx {
  title: string;
  setTitle: (t: string) => void;
}

/** Current page title, rendered by the Shell's top bar (Figma: big navy title left of the search). */
export const PageTitleContext = createContext<PageTitleCtx>({ title: '', setTitle: () => undefined });

export function usePageTitle(): string {
  return useContext(PageTitleContext).title;
}

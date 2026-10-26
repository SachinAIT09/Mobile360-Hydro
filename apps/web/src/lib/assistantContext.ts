import { useOutletContext } from 'react-router-dom';
import type { Turn } from './assistant';

/** The staff assistant conversation, owned by the Shell so it survives page changes. */
export interface AssistantCtx {
  turns: Turn[];
  busy: boolean;
  /** Ask a question; answers use the last non-assistant page as context. */
  ask: (q: string) => void;
  /** Start a new conversation (history is kept). */
  clear: () => void;
  /** Questions asked this session, newest first. */
  history: string[];
}

export function useAssistant(): AssistantCtx {
  return useOutletContext<AssistantCtx>();
}

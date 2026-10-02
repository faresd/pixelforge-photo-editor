import { useEffect, useState } from 'react';
import type { Draft } from './drafts';

const API = 'https://marketplace.cheaply.fr/marketplace/api/photoeditor';
export const SIGN_IN = 'https://marketplace.cheaply.fr/marketplace/photoeditor';
export type Member = { id: string; name: string };
export type CloudLink = { id: string; generation: string; owner: string };
export type CloudProject = { id: string; name: string; updatedAt: string; generation: string; bytes: number };

async function request<T>(query = '', payload?: unknown): Promise<T> {
  const response = await fetch(API + query, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(30000), ...(payload ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) } : {}) });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Cloud projects are unavailable');
  return body as T;
}
export function useMember() {
  const [member, setMember] = useState<Member | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = () => {
      const latest = ++sequence;
      void request<{ authenticated: boolean; user?: Member }>('?action=session').then(value => { if (active && latest === sequence) setMember(value.authenticated && value.user ? value.user : null); }).catch(() => { /* Editing remains available when sign-in is unavailable. */ }).finally(() => { if (active) setChecking(false); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  return { member, checking };
}
export const listCloudProjects = () => request<{ projects: CloudProject[] }>();
export const openCloudProject = (id: string) => request<{ id: string; generation: string; document: Draft }>('?id=' + encodeURIComponent(id));
export const saveCloudProject = (id: string, generation: string, document: Draft) => request<{ id: string; generation: string }>('', { action: 'save', id, generation, document });
export const removeCloudProject = (id: string, generation: string) => request<{ deleted: boolean }>('', { action: 'delete', id, generation });

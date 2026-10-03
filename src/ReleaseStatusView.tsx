'use client';

import { useEffect, useState } from 'react';

import {
  healthLabel,
  parseReadyPayload,
  parseReleasePayload,
  releaseHealth,
  releaseLabel,
  type ReadyInfo,
  type ReleaseHealth,
  type ReleaseInfo,
} from './releaseStatus';

export const RELEASE_STATUS_POLL_MS = 30_000;

type Snapshot = {
  health: ReleaseHealth | 'checking';
  release: ReleaseInfo | null;
  ready: ReadyInfo | null;
};

const initialSnapshot: Snapshot = { health: 'checking', release: null, ready: null };

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${path}?status=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

export type ReleaseStatusProps = {
  pollIntervalMs?: number;
};

/** Compact, accessible release identity and server health indicator for the editor chrome. */
export default function ReleaseStatus({
  pollIntervalMs = RELEASE_STATUS_POLL_MS,
}: ReleaseStatusProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);

  useEffect(() => {
    let alive = true;
    let controller: AbortController | undefined;

    const check = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 5_000);
      try {
        const [releasePayload, readyPayload] = await Promise.all([
          fetchJson('/release.json', requestController.signal),
          fetchJson('/api/readyz.json', requestController.signal),
        ]);
        if (!alive || controller !== requestController) return;
        const release = parseReleasePayload(releasePayload);
        const ready = parseReadyPayload(readyPayload);
        setSnapshot({ health: releaseHealth(release, ready), release, ready });
      } catch {
        if (alive && controller === requestController)
          setSnapshot({ health: 'offline', release: null, ready: null });
      } finally {
        window.clearTimeout(timeout);
        if (controller === requestController) controller = undefined;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), pollIntervalMs);
    return () => {
      alive = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [pollIntervalMs]);

  const version = releaseLabel(snapshot.release);
  const state =
    snapshot.health === 'checking' ? 'Checking server…' : healthLabel(snapshot.health);
  const label = `${version}. ${state}`;

  return (
    <output
      className={`release-status release-status--${snapshot.health}`}
      data-testid="release-status"
      aria-live="polite"
      aria-label={label}
      title={snapshot.release ? `${label} · ${snapshot.release.commit}` : label}
    >
      <span aria-hidden="true" className="release-status-dot" />
      <span className="release-status-version">{version}</span>
      <span aria-hidden="true">·</span>
      <span className="release-status-state">{state}</span>
    </output>
  );
}

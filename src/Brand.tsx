import type { ReactNode } from 'react';

/** First-party lockup: a Cheaply-inspired mark beside PixelForge's pixel mark. */
export function BrandLockup({ home = false }: { home?: boolean }) {
  return (
    <a href="/" className="brand-lockup" aria-label="Pixel by Cheaply">
      <span className="cheaply-lockup"><img src="/cheaply-logo-source.png" alt="Cheaply" /></span>
      <span className="brand-plus" aria-hidden="true">×</span>
      <span className="pixel-lockup"><span className="pixel-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>Pixel</span></span>
      {!home && <em>FREE</em>}
    </a>
  );
}

export function BrandFooter({ children }: { children?: ReactNode }) {
  return <span className="brand-footer-lockup">{children || 'PixelForge by Cheaply'}</span>;
}

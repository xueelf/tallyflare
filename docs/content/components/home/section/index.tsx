import type { ReactNode } from 'react';

import './style.css';

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="site-section">
      <h2 className="site-section-title">{title}</h2>
      <div className="site-section-body">{children}</div>
    </section>
  );
}

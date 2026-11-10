import type { ReactNode } from 'react';

import './style.css';

export function Example({
  title,
  description,
  href,
  label,
  source,
  reverse = false,
  children,
}: {
  title: string;
  description: ReactNode;
  href: string;
  label: string;
  source: string;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={reverse ? 'example is-reverse' : 'example'}>
      <div className="example-copy">
        <h3 className="example-title">{title}</h3>
        <p className="example-description">{description}</p>
        <a className="example-link" href={href}>
          {label}
          <span className="icon icon-arrow" aria-hidden="true" />
        </a>
      </div>
      <div className="example-demo">
        <div className="example-pane">
          <pre className="example-code">
            <code>{source}</code>
          </pre>
        </div>
        <div className="example-pane example-effect">{children}</div>
      </div>
    </div>
  );
}

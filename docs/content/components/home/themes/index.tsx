import type { ReactNode } from 'react';

import './style.css';

const THEMES = [
  'asoul',
  'booru-koe',
  'booru-touhoulat',
  'capoo-2',
  'miku',
  'minecraft',
];

export function Themes({
  description,
  children,
}: {
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {description ? <p className="themes-description">{description}</p> : null}
      <div className="themes-grid">
        {THEMES.map(theme => (
          <div className="theme-card" key={theme}>
            <div className="theme-preview">
              <img
                src={`/badges/123456789?padding=10&theme=${theme}`}
                alt={`${theme} theme`}
              />
            </div>
            <span className="theme-name">{theme}</span>
          </div>
        ))}
      </div>
      <div className="themes-note">{children}</div>
    </>
  );
}

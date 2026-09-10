'use client';

import { useEffect, useRef, useState } from 'react';
import { copy } from '../copy';

export function AppFooter() {
  const footerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.2 },
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return (
    <footer
      ref={footerRef}
      className={isVisible ? 'app-footer is-visible' : 'app-footer'}
      aria-label={copy.chrome.footerAria}
    >
      <div className="app-footer__lockup">
        <picture>
          <source srcSet="/padel-mate-mark.webp" type="image/webp" />
          <img
            className="app-footer__mark"
            src="/padel-mate-mark.png"
            alt=""
            width={256}
            height={256}
          />
        </picture>
        <p className="app-footer__wordmark">
          <span className="app-footer__wordmark-padel">{copy.chrome.wordmarkPadel}</span>
          {' '}
          <span className="app-footer__wordmark-mate">{copy.chrome.wordmarkMate}</span>
        </p>
      </div>
    </footer>
  );
}

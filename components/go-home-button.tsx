'use client';

import { copy } from '../copy';

const HOME_PATH = '/';

export function GoHomeButton({
  href = HOME_PATH,
  children = copy.chrome.goHome,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <a className="primary-button" href={href}>
      {children}
    </a>
  );
}

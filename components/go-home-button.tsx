'use client';

const HOME_PATH = '/';

export function GoHomeButton({
  href = HOME_PATH,
  children = 'Go to Padel Mate',
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

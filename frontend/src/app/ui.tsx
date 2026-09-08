import type { ReactNode } from 'react';
import { Link } from './navigation';

export type IconName = 'dashboard' | 'learn' | 'lab' | 'algorithms' | 'challenges' | 'progress' | 'arrow' | 'menu' | 'close' | 'panel' | 'sphere' | 'check';
const paths: Record<IconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  learn: <><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></>,
  lab: <><path d="M2 7h20M2 17h20M16 7v10" /><rect x="5" y="3" width="7" height="8" rx="1" /><circle cx="16" cy="7" r="2" /><circle cx="16" cy="17" r="4" /></>,
  algorithms: <><rect x="8" y="2" width="8" height="5" rx="1" /><path d="M12 7v5M5 16v-4h14v4" /><rect x="2" y="16" width="6" height="5" rx="1" /><rect x="16" y="16" width="6" height="5" rx="1" /></>,
  challenges: <><path d="M8 3h8v6c0 5-8 5-8 0ZM8 5H4v3c0 3 3 4 5 4M16 5h4v3c0 3-3 4-5 4M12 14v5M7 21h10" /></>,
  progress: <><path d="M4 3v18h17M8 16v-5M13 16V7M18 16V3" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m6-11-3 3 3 3" /></>,
  sphere: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><ellipse cx="12" cy="12" rx="9" ry="4" /><path d="m12 12 6-6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'success' }) {
  return <span className={`q-badge q-badge-${tone}`}>{children}</span>;
}
export function ActionLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`q-button ${secondary ? 'q-button-secondary' : 'q-button-primary'}`} href={href}>{children}<Icon name="arrow" size={17} /></Link>;
}
export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <header className="q-page-heading"><p className="q-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{children}</p></header>;
}
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="q-empty"><span className="q-icon-tile"><Icon name={icon} size={26} /></span><h2>{title}</h2><p>{children}</p>{action}</section>;
}

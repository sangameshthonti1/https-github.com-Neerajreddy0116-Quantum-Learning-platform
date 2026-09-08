import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from './navigation';
import { Icon, type IconName } from './ui';
import { foundations, isFoundationId } from '../lesson/foundations/content';
import { TutorLauncher } from '../tutor/TutorProvider';

const items: { href: string; label: string; icon: IconName; upcoming?: boolean }[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard' },
  { href: '/learn', label: 'Learn', icon: 'learn' },
  { href: '/lab', label: 'Circuit Lab', icon: 'lab' },
  { href: '/algorithms', label: 'Algorithms', icon: 'algorithms' },
  { href: '/challenges', label: 'Challenges', icon: 'challenges' },
  { href: '/progress', label: 'Progress', icon: 'progress' },
];
function Navigation({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return <nav className="q-navigation" aria-label="Main navigation">{items.map((item) => <Link key={item.href} href={item.href}
    title={item.upcoming ? `${item.label} · Upcoming` : item.label} aria-label={item.label} aria-description={item.upcoming ? 'Upcoming module' : undefined} onClick={onNavigate}
    aria-current={(item.href === '/' ? path === '/' || path === '/dashboard' : path === item.href || path.startsWith(item.href + '/')) ? 'page' : undefined}>
    <Icon name={item.icon} /><span className="q-nav-label">{item.label}</span>{item.upcoming && <small className="q-nav-upcoming">Soon</small>}
  </Link>)}</nav>;
}
function Brand() {
  return <Link href="/" className="q-brand" aria-label="Quantum Learning dashboard"><span className="q-brand-symbol">q<span>·</span></span><span className="q-brand-word">quantum<small>LEARNING PLATFORM</small></span></Link>;
}
function initialCollapsed() {
  try { return localStorage.getItem('qlp-navigation-collapsed') === 'true'; } catch { return false; }
}
export default function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const focused = path.startsWith('/lab') || path.startsWith('/learn/') || path.startsWith('/challenges/') || path.startsWith('/algorithms/');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [expanded, setExpanded] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const lessonId = path.slice('/learn/'.length);
  const title = path === '/algorithms/deutsch-jozsa' ? 'Deutsch–Jozsa' : path === '/algorithms/grover' ? 'Grover’s search' : path.startsWith('/challenges/') ? 'Challenge workspace' : path.startsWith('/learn/') && isFoundationId(lessonId) ? foundations[lessonId].title : path === '/learn/superposition' ? 'Superposition & the Hadamard gate' : path === '/lab/states' ? 'State Explorer' : items.find((item) => item.href === path)?.label ?? (path === '/dashboard' ? 'Dashboard' : 'Page not found');
  useEffect(() => {
    document.title = `${title} · Quantum Learning`;
    setExpanded(false);
    drawer.current?.close();
    content.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [path, title]);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => { if (query.matches) drawer.current?.close(); };
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
  }, []);
  const compact = focused || collapsed;
  function toggleNavigation() {
    if (focused) setExpanded((previous) => !previous);
    else setCollapsed((previous) => {
      try { localStorage.setItem('qlp-navigation-collapsed', String(!previous)); } catch { /* In-memory preference is sufficient. */ }
      return !previous;
    });
  }
  return <div className="q-app" data-compact={compact} data-focused={focused}>
    <a href="#page-content" className="q-skip">Skip to content</a>
    {expanded && <button className="q-desktop-backdrop" aria-label="Close expanded navigation" onClick={() => setExpanded(false)} />}
    <aside className="q-sidebar" data-expanded={expanded} aria-label="Application sidebar" onKeyDown={(event) => {
      if (event.key === 'Escape' && expanded) { setExpanded(false); event.currentTarget.querySelector<HTMLButtonElement>('.q-collapse')?.focus(); }
    }}>
      <Brand /><p className="q-nav-caption">YOUR WORKSPACE</p><Navigation path={path} onNavigate={() => setExpanded(false)} />
      <div className="q-sidebar-bottom"><div className="q-sidebar-note"><span className="q-note-symbol">|ψ⟩</span><p>Small steps.<br />Extraordinary ideas.</p></div>
        <button className="q-collapse" onClick={toggleNavigation} aria-expanded={expanded || !compact} aria-label={expanded || !compact ? 'Collapse navigation' : 'Expand navigation'}><Icon name="panel" /><span className="q-nav-label">Collapse sidebar</span></button>
        <span className="q-local-label">SIH 2026 · LOCAL PREBUILD</span>
      </div>
    </aside>
    <div className="q-app-body">
      <header className="q-topbar"><button className="q-menu q-icon-button" ref={menuButton} aria-label="Open navigation" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><Icon name="menu" /></button>
        <div className="q-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{title}</strong></div>
        <span className="q-session-label"><span /> This tab’s session</span>
        {focused && <span className="q-focus-label">Focus workspace</span>}
        {focused && !path.startsWith('/challenges/') && <TutorLauncher />}
      </header>
      <div id="page-content" className="q-page-content" tabIndex={-1} ref={content}>{children}</div>
    </div>
    <dialog ref={drawer} className="q-mobile-drawer" aria-label="Application navigation" onClick={(event) => { if (event.target === drawer.current) drawer.current.close(); }} onClose={() => menuButton.current?.focus()} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="q-drawer-inner"><div className="q-drawer-heading"><Brand /><button className="q-icon-button" aria-label="Close navigation" onClick={() => drawer.current?.close()}><Icon name="close" /></button></div>
        <p className="q-nav-caption">YOUR WORKSPACE</p><Navigation path={path} onNavigate={() => drawer.current?.close()} />
        <p className="q-drawer-note">Learn, build, and observe.<br />Progress stays in this tab’s session.</p>
      </div>
    </dialog>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, ApiError, post } from './api';
import Auth from './Auth';
import Dashboard from './Dashboard';
import IncidentView from './IncidentView';
import { ActivityPage, Evaluations, Knowledge, SettingsPage } from './Pages';
import { IncidentForm } from './forms';
import { Logo, Modal, Spinner } from './ui';
import type { Health, Profile } from './types';

type Page = 'overview' | 'incidents' | 'knowledge' | 'evaluations' | 'activity' | 'settings';
const navigation = [
  { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { id: 'incidents' as const, label: 'Incidents', icon: Radio },
  { id: 'knowledge' as const, label: 'Knowledge base', icon: BookOpen },
  { id: 'evaluations' as const, label: 'Quality lab', icon: FlaskConical },
  { id: 'activity' as const, label: 'Activity log', icon: Activity },
];

function readLocation(): { page: Page; incidentId: string | null } {
  const [page, id] = window.location.hash.slice(1).split('/');
  const valid = [...navigation.map((n) => n.id), 'settings'].includes(page);
  return {
    page: valid ? (page as Page) : 'overview',
    incidentId: page === 'incidents' && id ? id : null,
  };
}

export default function App() {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Profile>('/auth/me'),
    retry: false,
  });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health') });
  const [location, setLocation] = useState(readLocation);
  const [query, setQuery] = useState('');
  const [newIncident, setNewIncident] = useState(false);
  const [help, setHelp] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { page, incidentId } = location;
  function navigate(next: Page, id?: string) {
    window.location.hash = id ? `${next}/${id}` : next;
    setQuery('');
    setMobileNav(false);
  }
  useEffect(() => {
    const update = () => {
      setLocation(readLocation());
      setQuery('');
    };
    const expired = () => {
      client.clear();
      void client.invalidateQueries();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('hashchange', update);
    window.addEventListener('keydown', keyboard);
    window.addEventListener('relay:session-expired', expired);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('relay:session-expired', expired);
    };
  }, [client]);
  useEffect(() => {
    if (notice) {
      const timer = window.setTimeout(() => setNotice(''), 7000);
      return () => window.clearTimeout(timer);
    }
  }, [notice]);
  async function logout() {
    try {
      await post('/auth/logout');
      client.clear();
      client.setQueryData(['me'], null);
      navigate('overview');
    } catch (err) {
      setNotice((err as Error).message);
    }
  }
  if (profile.isPending)
    return (
      <div className="boot-screen">
        <Logo />
        <Spinner />
      </div>
    );
  if (profile.error && !(profile.error instanceof ApiError && profile.error.status === 401))
    return (
      <div className="boot-screen">
        <Logo />
        <h1>We couldn’t reach Relay</h1>
        <p>Check that the local API is running, then try again.</p>
        <button className="button primary" onClick={() => void profile.refetch()}>
          Retry connection
        </button>
      </div>
    );
  if (!profile.data) return <Auth health={health.data} />;
  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Logo />
          <span className="brand-tag">WORKSPACE</span>
        </div>
        <button className="workspace-switch" onClick={() => navigate('settings')}>
          <span className="workspace-avatar">{profile.data.workspace.slice(0, 1)}</span>
          <span>
            <strong>{profile.data.workspace}</strong>
            <small>Engineering workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === 'evaluations' && <span className="nav-lab">LAB</span>}
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-principle">
            <span className="principle-icon">
              <ShieldCheck size={19} />
            </span>
            <strong>Built on evidence.</strong>
            <p>
              Every source visible.
              <br />
              Every decision yours.
            </p>
            <button onClick={() => setHelp(true)}>
              How Relay works <ArrowUpRight size={13} />
            </button>
          </div>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={17} />
            Workspace details
          </button>
          <div className="profile-row">
            <span className="user-avatar">
              {profile.data.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{profile.data.name}</strong>
              <small>{profile.data.role}</small>
            </span>
            <button onClick={() => void logout()} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {incidentId
                ? 'Incident detail'
                : (navigation.find((n) => n.id === page)?.label ?? 'Settings')}
            </strong>
          </div>
          <div className="topbar-tools">
            <div className="search-box">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Search workspace"
                placeholder={
                  page === 'knowledge'
                    ? 'Search sources…'
                    : page === 'activity'
                      ? 'Search activity…'
                      : 'Search incidents…'
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (
                    !['knowledge', 'activity', 'overview', 'incidents'].includes(page) ||
                    incidentId
                  ) {
                    window.location.hash = 'incidents';
                  }
                }}
              />
              <kbd>/</kbd>
            </div>
            <span className="environment-label">
              <span className="live-dot" />
              {health.data?.provider === 'openai' ? 'Live AI' : 'Offline mode'}
            </span>
            <button
              className="icon-button help-button"
              aria-label="Help"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {incidentId && page === 'incidents' ? (
            <IncidentView
              key={incidentId}
              id={incidentId}
              onBack={() => navigate('incidents')}
              notify={setNotice}
            />
          ) : page === 'overview' || page === 'incidents' ? (
            <Dashboard
              profile={profile.data}
              query={query}
              listOnly={page === 'incidents'}
              onSelect={(id) => navigate('incidents', id)}
              onCreate={() => setNewIncident(true)}
              onKnowledge={() => navigate('knowledge')}
            />
          ) : page === 'knowledge' ? (
            <Knowledge query={query} notify={setNotice} />
          ) : page === 'evaluations' ? (
            <Evaluations notify={setNotice} />
          ) : page === 'activity' ? (
            <ActivityPage query={query} />
          ) : (
            <SettingsPage profile={profile.data} health={health.data} />
          )}
          <footer className="workspace-footer">
            <span>
              RELAY <span className="footer-dot">/</span> INCIDENT INTELLIGENCE
            </span>
            <span>Context. Evidence. Human judgment.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="alert">
          <InfoIcon />
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </div>
      )}
      {newIncident && (
        <IncidentForm
          onClose={() => setNewIncident(false)}
          onCreated={(incident) => navigate('incidents', incident.id)}
        />
      )}
      {help && (
        <Modal title="A clear path through an incident" onClose={() => setHelp(false)}>
          <div className="help-steps">
            <p>
              <strong>01 · Bring the context.</strong> Open an incident with observed symptoms. Add
              runbooks or postmortems in the knowledge base.
            </p>
            <p>
              <strong>02 · Follow the evidence.</strong> Run an investigation, then open the source
              references next to each hypothesis and action.
            </p>
            <p>
              <strong>03 · Make the call.</strong> Record an approval or rejection with your
              rationale. Proposals never execute commands.
            </p>
            <p>
              <strong>04 · Close the loop.</strong> Move the incident through monitoring to
              resolved. Export the brief for a handoff.
            </p>
          </div>
          <div className="inline-note">
            <Command size={15} />
            Press / to focus search. Use Quality lab to inspect the retrieval baseline.
          </div>
        </Modal>
      )}
    </div>
  );
}

function InfoIcon() {
  return <ShieldCheck size={18} />;
}

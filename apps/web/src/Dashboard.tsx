import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  Clock3,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from './api';
import { Badge, Empty, PageHeading, Spinner, Step, timeAgo } from './ui';
import type { AuditEvent, Document, Incident, Profile } from './types';

export default function Dashboard({
  profile,
  query,
  onSelect,
  onCreate,
  onKnowledge,
  listOnly = false,
}: {
  profile: Profile;
  query: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onKnowledge: () => void;
  listOnly?: boolean;
}) {
  const incidents = useQuery({
    queryKey: ['incidents'],
    queryFn: () => api<Incident[]>('/incidents'),
  });
  const docs = useQuery({ queryKey: ['documents'], queryFn: () => api<Document[]>('/documents') });
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditEvent[]>('/audit') });
  const [filter, setFilter] = useState('all');
  if (incidents.isPending) return <Spinner />;
  if (incidents.error)
    return (
      <div className="form-error" role="alert">
        {incidents.error.message}
      </div>
    );
  const items = incidents.data;
  const active = items.filter((i) => i.status !== 'resolved');
  const critical = active.filter((i) => i.severity === 'SEV1');
  const monitoring = items.filter((i) => i.status === 'monitoring');
  const filtered = items.filter(
    (i) =>
      (filter === 'all' || (filter === 'active' ? i.status !== 'resolved' : i.status === filter)) &&
      `${i.title} ${i.service} RLY-${i.number}`.toLowerCase().includes(query.toLowerCase()),
  );
  const services = [...new Set(items.map((i) => i.service))];
  return (
    <>
      <PageHeading
        eyebrow={listOnly ? 'INCIDENT OPERATIONS' : `YOUR WORKSPACE, IN FOCUS`}
        title={listOnly ? 'Incident queue' : 'Incident overview'}
        description={
          listOnly
            ? 'A shared picture of what needs attention.'
            : `Welcome back, ${profile.name.split(' ')[0]}. Here’s where things stand.`
        }
        action={
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} />
            New incident
          </button>
        }
      />
      {!listOnly && (
        <>
          <section className="overview-banner">
            <div>
              <div className="banner-kicker">
                <Sparkles size={14} /> CONTEXT BEFORE ACTION
              </div>
              <h2>Clarity when every minute counts.</h2>
              <p>Your incidents, knowledge, and next steps. Connected.</p>
              <button onClick={() => (active[0] ? onSelect(active[0].id) : onCreate())}>
                Start an investigation <ArrowRight size={16} />
              </button>
            </div>
            <div className="signal-art" aria-hidden="true">
              <span className="signal-ring one" />
              <span className="signal-ring two" />
              <span className="signal-ring three" />
              <span className="signal-core">
                <Activity size={32} />
              </span>
              <span className="signal-chip chip-one">
                <BookOpen size={13} /> Evidence
              </span>
              <span className="signal-chip chip-two">
                <ShieldCheck size={13} /> Human review
              </span>
              <span className="signal-point p1" />
              <span className="signal-point p2" />
            </div>
          </section>
          <div className="metrics-grid">
            <Metric
              title="Active incidents"
              value={active.length}
              icon={<Activity size={18} />}
              detail="Across your workspace"
              tone="teal"
            />
            <Metric
              title="Critical priority"
              value={critical.length}
              icon={<CircleDot size={18} />}
              detail={critical.length ? 'Needs immediate attention' : 'No critical incidents'}
              tone="red"
            />
            <Metric
              title="In monitoring"
              value={monitoring.length}
              icon={<Clock3 size={18} />}
              detail="Watching for stable recovery"
              tone="amber"
            />
            <Metric
              title="Knowledge sources"
              value={docs.data?.length ?? 0}
              icon={<BookOpen size={18} />}
              detail="Indexed and ready to reference"
              tone="blue"
            />
          </div>
        </>
      )}
      <div className={listOnly ? '' : 'dashboard-columns'}>
        <section className="panel incident-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {listOnly ? 'All incidents' : 'Your incident queue'}{' '}
                <span className="count">{items.length}</span>
              </h2>
              <p>Keep the signal. Find the next step.</p>
            </div>
            <span className="live-label">
              <span className="live-dot" /> WORKSPACE DATA
            </span>
          </div>
          <div className="tabs filter-tabs" role="group" aria-label="Filter incidents">
            {[
              ['all', 'All incidents'],
              ['active', 'Active'],
              ['monitoring', 'Monitoring'],
              ['resolved', 'Resolved'],
            ].map(([value, label]) => (
              <button
                className={filter === value ? 'selected' : ''}
                key={value}
                onClick={() => setFilter(value)}
              >
                {label}
                {value === 'active' && <span>{active.length}</span>}
              </button>
            ))}
          </div>
          {filtered.length ? (
            <div className="incident-list">
              <div className="incident-list-labels">
                <span>INCIDENT / SERVICE</span>
                <span>STATUS</span>
              </div>
              {filtered.map((incident) => (
                <button
                  className="incident-row"
                  onClick={() => onSelect(incident.id)}
                  key={incident.id}
                >
                  <span className={`severity-rail ${incident.severity.toLowerCase()}`} />
                  <span className="incident-row-main">
                    <span className="incident-row-meta">
                      <span className={`severity ${incident.severity.toLowerCase()}`}>
                        {incident.severity}
                      </span>
                      <span>RLY-{incident.number}</span>
                      <span className="meta-dot">·</span>
                      <span>{timeAgo(incident.created_at)}</span>
                    </span>
                    <strong>{incident.title}</strong>
                    <span className="service-name">
                      <span className="service-square" />
                      {incident.service}
                    </span>
                  </span>
                  <span className="incident-row-end">
                    <Badge tone={incident.status}>{incident.status}</Badge>
                    <ArrowRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty title={query ? 'No matching incidents' : 'A clear queue'}>
              {query
                ? 'Try another title, service, or incident number.'
                : 'Open an incident to start building a shared picture.'}
            </Empty>
          )}
          <div className="panel-bottom">
            <ShieldCheck size={14} />
            <span>AI proposes. Your team decides.</span>
            <span className="table-count">
              {filtered.length} incident{filtered.length === 1 ? '' : 's'}
            </span>
          </div>
        </section>
        {!listOnly && (
          <aside className="dashboard-aside">
            <section className="panel guide-panel">
              <span className="section-icon">
                <Sparkles size={18} />
              </span>
              <h2>From signal to decision</h2>
              <p className="subtle">A little structure. A lot more clarity.</p>
              <Step number="01" title="Bring the context" done={!!docs.data?.length}>
                Add runbooks and past incidents.
              </Step>
              <Step number="02" title="Follow the evidence">
                Generate a brief with cited sources.
              </Step>
              <Step number="03" title="Make the call">
                Review each proposed next step.
              </Step>
              <button className="text-button" onClick={onKnowledge}>
                Explore knowledge base <ArrowRight size={14} />
              </button>
            </section>
            <section className="panel service-panel">
              <h2>
                Service landscape <span className="count">{services.length}</span>
              </h2>
              {services.length ? (
                services.slice(0, 4).map((service) => {
                  const count = active.filter((i) => i.service === service).length;
                  return (
                    <div className="service-row" key={service}>
                      <span>
                        <span className={`status-dot ${count ? 'warn' : ''}`} />
                        {service}
                      </span>
                      <span>{count ? `${count} active` : 'No active incidents'}</span>
                    </div>
                  );
                })
              ) : (
                <p className="subtle">Services appear when you create incidents.</p>
              )}
              <p className="tiny-note">Incident status, not live infrastructure health.</p>
            </section>
          </aside>
        )}
      </div>
      {!listOnly && (
        <section className="panel recent-panel">
          <div className="panel-heading">
            <h2>
              <Clock3 size={17} /> Recent activity
            </h2>
            <span className="subtle">A trace of every decision</span>
          </div>
          <div className="recent-events">
            {audit.data?.slice(0, 3).map((event) => (
              <div key={event.id}>
                <span className="event-icon">
                  {event.action.includes('completed') ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <ArrowDownRight size={16} />
                  )}
                </span>
                <div>
                  <strong>{event.detail}</strong>
                  <span>
                    {event.actor} <span className="meta-dot">·</span> {timeAgo(event.created_at)}
                  </span>
                </div>
              </div>
            ))}
            {!audit.data?.length && (
              <p className="subtle">
                <Search size={15} /> Your workspace activity will appear here.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function Metric({
  title,
  value,
  icon,
  detail,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  detail: string;
  tone: string;
}) {
  return (
    <section className={`metric-card ${tone}`}>
      <div>
        <span>{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{String(value).padStart(2, '0')}</strong>
      <p>{detail}</p>
    </section>
  );
}

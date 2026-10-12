import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Beaker,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  Layers,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api, post } from './api';
import { Badge, Empty, formatTime, Modal, PageHeading, Spinner, timeAgo } from './ui';
import { DocumentForm } from './forms';
import type { AuditEvent, Document, Evaluation, Health, Profile } from './types';

export function Knowledge({ query, notify }: { query: string; notify: (message: string) => void }) {
  const client = useQueryClient();
  const docs = useQuery({ queryKey: ['documents'], queryFn: () => api<Document[]>('/documents') });
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [kind, setKind] = useState('all');
  const remove = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSelected(null);
      setDeleting(false);
      void client.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => notify(error.message),
  });
  const filtered =
    docs.data?.filter(
      (doc) =>
        (kind === 'all' || doc.kind === kind) &&
        `${doc.title} ${doc.service}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="THE TEAM’S SHARED CONTEXT"
        title="Knowledge base"
        description="The runbooks and lessons behind better investigations."
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add document
          </button>
        }
      />
      <div className="knowledge-banner">
        <span className="section-icon">
          <Layers size={22} />
        </span>
        <div>
          <h3>Your experience, ready to reference.</h3>
          <p>
            Documents are indexed into passages with source lines. Every analysis saves its own
            evidence snapshot.
          </p>
        </div>
        <Badge tone="monitoring">{docs.data?.length ?? 0} / 100 sources</Badge>
      </div>
      <div className="tabs standalone-tabs">
        {[
          ['all', 'All sources'],
          ['runbook', 'Runbooks'],
          ['postmortem', 'Postmortems'],
          ['architecture', 'Architecture'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={kind === value ? 'selected' : ''}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {docs.isPending ? (
        <Spinner />
      ) : docs.error ? (
        <div className="form-error" role="alert">
          {docs.error.message}
        </div>
      ) : filtered.length ? (
        <div className="document-grid">
          {filtered.map((doc) => (
            <button
              className="document-card panel"
              key={doc.id}
              onClick={() => {
                setSelected(doc);
                setDeleting(false);
              }}
            >
              <div className="document-card-top">
                <span className={`document-icon ${doc.kind}`}>
                  <FileText size={22} />
                </span>
                <span className="document-kind">{doc.kind}</span>
                <ChevronRight size={17} />
              </div>
              <h3>{doc.title}</h3>
              <p>
                {doc.content
                  .replace(/#+ /g, '')
                  .split('\n')
                  .filter(Boolean)
                  .slice(1)
                  .join(' ')
                  .slice(0, 155)}
                …
              </p>
              <div className="document-meta">
                <span>{doc.service}</span>
                <span>
                  {doc.chunks} passage{doc.chunks !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="document-footer">
                <span>
                  <span className="status-dot" />
                  Indexed
                </span>
                <span>{timeAgo(doc.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={query ? 'No matching sources' : 'Bring your team’s knowledge'}
            action={
              <button className="button primary" onClick={() => setAdding(true)}>
                <Plus size={15} />
                Add a document
              </button>
            }
          >
            Import a Markdown runbook or paste a postmortem to give investigations useful context.
          </Empty>
        </section>
      )}
      {adding && <DocumentForm onClose={() => setAdding(false)} />}
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)} wide>
          <div className="source-meta">
            <Badge tone="neutral">{selected.kind}</Badge>
            <span>{selected.service}</span>
            <span>{selected.chunks} passages</span>
          </div>
          <pre className="source-content">{selected.content}</pre>
          {deleting ? (
            <div className="delete-confirm">
              <p>Delete this source? Previous analysis snapshots will remain available.</p>
              <button className="button" onClick={() => setDeleting(false)}>
                Keep document
              </button>
              <button
                className="button danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(selected.id)}
              >
                Confirm deletion
              </button>
            </div>
          ) : (
            <button className="text-button danger-text" onClick={() => setDeleting(true)}>
              <Trash2 size={14} />
              Delete document
            </button>
          )}
        </Modal>
      )}
    </>
  );
}

export function Evaluations({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const evaluations = useQuery({
    queryKey: ['evaluations'],
    queryFn: () => api<Evaluation[]>('/evaluations'),
  });
  const [selectedId, setSelectedId] = useState('');
  const run = useMutation({
    mutationFn: () => post<Evaluation>('/evaluations'),
    onSuccess: () => {
      setSelectedId('');
      void client.invalidateQueries({ queryKey: ['evaluations'] });
    },
    onError: (error) => notify(error.message),
  });
  const selected = evaluations.data?.find((e) => e.id === selectedId) ?? evaluations.data?.[0];
  const metrics = selected?.results.metrics;
  return (
    <>
      <PageHeading
        eyebrow="MEASURE, THEN TRUST"
        title="Quality lab"
        description="Inspect the evidence pipeline with repeatable regression checks."
        action={
          <button className="button primary" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <LoaderCircle className="spin" size={16} /> : <PlayIcon />}Run
            evaluation
          </button>
        }
      />
      <div className="evaluation-intro">
        <span className="evaluation-symbol">
          <FlaskConical size={30} />
        </span>
        <div>
          <h2>Good answers start with relevant evidence.</h2>
          <p>
            Eight versioned scenarios test retrieval, citation references, and abstention on a fixed
            reference corpus. Run them any time, without an API key.
          </p>
        </div>
        <span className="mono">DATASET / V1</span>
      </div>
      {evaluations.isPending ? (
        <Spinner />
      ) : evaluations.error ? (
        <div className="form-error">{evaluations.error.message}</div>
      ) : selected && metrics ? (
        <>
          <div className="eval-meta">
            <Badge tone="resolved">
              {selected.results.cases.filter((c) => c.passed).length} /{' '}
              {selected.results.cases.length} cases passed
            </Badge>
            <span>Last run {formatTime(selected.created_at)}</span>
            <select
              aria-label="Evaluation history"
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {evaluations.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatTime(e.created_at)}
                </option>
              ))}
            </select>
          </div>
          <div className="metrics-grid eval-metrics">
            {[
              [
                'Retrieval recall @3',
                metrics.recall_at_3,
                'Expected source in the first 3 results',
              ],
              ['Mean reciprocal rank', metrics.mrr, 'How early the expected source appears'],
              [
                'Abstention accuracy',
                metrics.abstention_accuracy,
                'Unanswerable cases correctly withheld',
              ],
              [
                'Citation validity',
                metrics.citation_validity,
                'References resolve to supplied evidence',
              ],
            ].map(([title, value, description]) => (
              <section className="metric-card" key={String(title)}>
                <div>
                  <span>{title}</span>
                  <CheckCircle2 size={17} />
                </div>
                <strong>
                  {title === 'Mean reciprocal rank'
                    ? Number(value).toFixed(2)
                    : `${Math.round(Number(value) * 100)}%`}
                </strong>
                <p>{description}</p>
              </section>
            ))}
          </div>
          <section className="panel eval-table">
            <div className="panel-heading">
              <h2>Scenario results</h2>
              <span className="mono">{selected.results.dataset_version}</span>
            </div>
            {selected.results.cases.map((test) => (
              <div className="eval-case" key={test.id}>
                <span className={test.passed ? 'test-passed' : 'test-failed'}>
                  {test.passed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                </span>
                <div>
                  <strong>{test.id}</strong>
                  <p>{test.query}</p>
                  <span>Expected: {test.expected}</span>
                </div>
                <div className="eval-case-result">
                  <Badge tone={test.passed ? 'resolved' : 'investigating'}>
                    {test.passed ? 'Passed' : 'Failed'}
                  </Badge>
                  <span>{test.retrieved.length} sources retrieved</span>
                </div>
              </div>
            ))}
          </section>
          <div className="eval-limitations">
            <ShieldCheck size={20} />
            <div>
              <strong>Read the result in context</strong>
              <p>{selected.results.limitations}</p>
            </div>
          </div>
        </>
      ) : (
        <section className="panel">
          <Empty
            title="Make quality visible"
            action={
              <button className="button" disabled={run.isPending} onClick={() => run.mutate()}>
                <Beaker size={16} />
                Run your first evaluation
              </button>
            }
          >
            Your first run will create a measurable baseline and a case-by-case report. Results are
            saved in this workspace.
          </Empty>
        </section>
      )}
    </>
  );
}

function PlayIcon() {
  return <Beaker size={16} />;
}

export function ActivityPage({ query }: { query: string }) {
  const events = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditEvent[]>('/audit') });
  const filtered =
    events.data?.filter((e) =>
      `${e.actor} ${e.action} ${e.detail}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="EVERY DECISION HAS A STORY"
        title="Activity log"
        description="A chronological record of your workspace’s investigations and decisions."
      />
      <section className="panel audit-panel">
        <div className="panel-heading">
          <h2>
            <ShieldCheck size={18} />
            Workspace audit trail
          </h2>
          <span className="subtle">Latest 200 events</span>
        </div>
        {events.isPending ? (
          <Spinner />
        ) : events.error ? (
          <div className="form-error">{events.error.message}</div>
        ) : filtered.length ? (
          filtered.map((event) => (
            <div className="audit-row" key={event.id}>
              <span className={`audit-icon ${event.action.includes('approved') ? 'positive' : ''}`}>
                {event.action.includes('analysis') ? (
                  <Search size={17} />
                ) : event.action.includes('document') ? (
                  <BookOpen size={17} />
                ) : (
                  <Clock3 size={17} />
                )}
              </span>
              <div>
                <strong>{event.detail}</strong>
                <span>
                  {event.actor} <span className="meta-dot">·</span> <code>{event.action}</code>
                </span>
              </div>
              <time dateTime={event.created_at}>{formatTime(event.created_at)}</time>
            </div>
          ))
        ) : (
          <Empty title="The story starts here">
            Create an incident or add a source to record your first event.
          </Empty>
        )}
      </section>
    </>
  );
}

export function SettingsPage({ profile, health }: { profile: Profile; health?: Health }) {
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE DETAILS"
        title="Your workspace"
        description="A clear view of your account and how Relay is running."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <span className="section-icon">
            <ShieldCheck size={22} />
          </span>
          <h2>{profile.workspace}</h2>
          <dl>
            <dt>Your name</dt>
            <dd>{profile.name}</dd>
            <dt>Email</dt>
            <dd>{profile.email}</dd>
            <dt>Role</dt>
            <dd>
              <Badge tone="neutral">{profile.role}</Badge>
            </dd>
            <dt>Session</dt>
            <dd>8-hour, HTTP-only cookie</dd>
          </dl>
        </section>
        <section className="panel settings-panel">
          <span className="section-icon">
            <Beaker size={22} />
          </span>
          <h2>Intelligence mode</h2>
          <Badge tone="resolved">
            {health?.provider === 'openai' ? 'Live AI connected' : 'Offline extraction'}
          </Badge>
          <p>
            {health?.provider === 'openai'
              ? 'Relevant evidence and incident context are sent to the configured OpenAI model. The server validates output shape and citation references before publishing a brief.'
              : 'Relay retrieves relevant passages and extracts investigation guidance. This mode runs locally, needs no API key, and does not use a language model.'}
          </p>
          <div className="inline-note">
            <ShieldCheck size={17} />
            All proposed actions require human review.
          </div>
        </section>
      </div>
      <a className="api-docs-link panel" href="/docs" target="_blank" rel="noreferrer">
        <div>
          <strong>Explore the API</strong>
          <p>Interactive documentation for the workspace endpoints.</p>
        </div>
        <ArrowRight size={20} />
      </a>
    </>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  GitBranch,
  Info,
  LoaderCircle,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { api, post } from './api';
import { Badge, Empty, formatTime, Modal, Spinner, timeAgo } from './ui';
import type { Analysis, IncidentDetail } from './types';

export default function IncidentView({
  id,
  onBack,
  notify,
}: {
  id: string;
  onBack: () => void;
  notify: (message: string) => void;
}) {
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api<IncidentDetail>(`/incidents/${id}`),
    refetchInterval: (query) =>
      query.state.data?.analyses.some((a) => ['queued', 'running'].includes(a.status))
        ? 800
        : false,
  });
  const [tab, setTab] = useState('investigation');
  const [source, setSource] = useState<string | null>(null);
  const [review, setReview] = useState<{ index: number; verdict: 'approved' | 'rejected' } | null>(
    null,
  );
  const [historyId, setHistoryId] = useState('');
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['incident', id] });
    void client.invalidateQueries({ queryKey: ['incidents'] });
    void client.invalidateQueries({ queryKey: ['audit'] });
  };
  const analyze = useMutation({
    mutationFn: () =>
      post<Analysis>(`/incidents/${id}/analyses`, { idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      setHistoryId('');
      setTab('investigation');
      invalidate();
    },
    onError: (error) => notify(error.message),
  });
  const status = useMutation({
    mutationFn: (next: string) =>
      api(`/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, version: detail.data!.version }),
      }),
    onSuccess: invalidate,
    onError: (error) => {
      notify(error.message);
      invalidate();
    },
  });
  const decision = useMutation({
    mutationFn: (body: {
      analysisId: string;
      action_index: number;
      verdict: string;
      note: string;
    }) =>
      post(`/analyses/${body.analysisId}/decisions`, {
        action_index: body.action_index,
        verdict: body.verdict,
        note: body.note,
      }),
    onSuccess: () => {
      setReview(null);
      invalidate();
    },
    onError: (error) => notify(error.message),
  });
  if (detail.isPending) return <Spinner label="Loading incident context…" />;
  if (detail.error)
    return (
      <div className="form-error" role="alert">
        {detail.error.message}
      </div>
    );
  const data = detail.data;
  const current = data.analyses.find((a) => a.id === historyId) ?? data.analyses[0];
  const busy =
    analyze.isPending || data.analyses.some((a) => a.status === 'queued' || a.status === 'running');
  const brief = current?.result;
  const selectedSource = current?.evidence.find((e) => e.id === source);
  const cite = (ids: string[]) => (
    <span className="citations">
      {ids.map((citation) => (
        <button
          key={citation}
          onClick={() => setSource(citation)}
          aria-label={`View evidence ${citation}`}
        >
          <BookOpen size={10} />
          {citation}
        </button>
      ))}
    </span>
  );
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={15} />
        All incidents
      </button>
      <div className="incident-titlebar">
        <div>
          <div className="incident-title-meta">
            <span className="mono">RLY-{data.number}</span>
            <span className={`severity ${data.severity.toLowerCase()}`}>{data.severity}</span>
            <Badge tone={data.status}>{data.status}</Badge>
          </div>
          <h1>{data.title}</h1>
          <div className="incident-byline">
            <span>
              <GitBranch size={14} />
              {data.service}
            </span>
            <span>
              <Clock3 size={14} />
              Opened {timeAgo(data.created_at)}
            </span>
          </div>
        </div>
        <a className="button" href={`/api/incidents/${id}/export`} download>
          <Download size={15} />
          Export brief
        </a>
      </div>
      <div className="incident-toolbar">
        <div className="tabs">
          <button
            className={tab === 'investigation' ? 'selected' : ''}
            onClick={() => setTab('investigation')}
          >
            <Sparkles size={15} />
            Investigation
          </button>
          <button
            className={tab === 'timeline' ? 'selected' : ''}
            onClick={() => setTab('timeline')}
          >
            <Clock3 size={15} />
            Timeline <span>{data.events.length}</span>
          </button>
        </div>
        <div className="status-control">
          <span>Move to</span>
          <select
            aria-label="Change incident status"
            value=""
            disabled={status.isPending}
            onChange={(event) => {
              if (event.target.value) status.mutate(event.target.value);
            }}
          >
            <option value="">Update status</option>
            {data.status === 'investigating' && <option value="monitoring">Monitoring</option>}
            {data.status === 'monitoring' && (
              <>
                <option value="resolved">Resolved</option>
                <option value="investigating">Investigating</option>
              </>
            )}
            {data.status === 'resolved' && (
              <option value="investigating">Reopen investigation</option>
            )}
          </select>
        </div>
      </div>
      {tab === 'timeline' ? (
        <section className="panel timeline-panel">
          <h2>Incident timeline</h2>
          {data.events.map((event) => (
            <div className="timeline-event" key={event.id}>
              <span className="timeline-dot">
                <Check size={12} />
              </span>
              <div>
                <strong>{event.detail}</strong>
                <span>
                  {event.actor} · {formatTime(event.created_at)}
                </span>
                <code>{event.action}</code>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <div className="investigation-columns">
          <div className="investigation-main">
            <section className="panel context-panel">
              <div className="panel-heading">
                <h2>
                  <FileText size={17} />
                  Reported observations
                </h2>
                <Badge tone="neutral">Incident context</Badge>
              </div>
              <p>{data.summary}</p>
            </section>
            <section className="panel brief-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <Sparkles size={18} />
                    Investigation brief
                  </h2>
                  <p>Grounded in your knowledge. Ready for your judgment.</p>
                </div>
                <button className="button primary" disabled={busy} onClick={() => analyze.mutate()}>
                  {busy ? <LoaderCircle size={15} className="spin" /> : <Play size={14} />}
                  {busy ? 'Investigating…' : current ? 'Run again' : 'Run investigation'}
                </button>
              </div>
              {data.analyses.length > 1 && (
                <label className="history-select">
                  Analysis history
                  <select
                    value={current?.id}
                    onChange={(e) => {
                      setHistoryId(e.target.value);
                      setSource(null);
                    }}
                  >
                    {data.analyses.map((a, i) => (
                      <option value={a.id} key={a.id}>
                        {i === 0 ? 'Latest · ' : ''}
                        {formatTime(a.created_at)} · {a.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!current && (
                <Empty
                  title="A clearer next step starts here"
                  action={
                    <div className="mini-pipeline">
                      <span>Retrieve</span>
                      <ArrowRight size={12} />
                      <span>Compose</span>
                      <ArrowRight size={12} />
                      <span>Validate</span>
                      <ArrowRight size={12} />
                      <span>Review</span>
                    </div>
                  }
                >
                  Relay searches your runbooks, brings the relevant evidence together, and proposes
                  investigation steps for you to review.
                </Empty>
              )}
              {current && ['queued', 'running'].includes(current.status) && (
                <div className="analysis-progress">
                  <span className="ai-orb">
                    <Sparkles size={23} />
                  </span>
                  <h3>Connecting the evidence</h3>
                  <p>Retrieving sources and preparing a structured brief…</p>
                  <div className="progress-line" />
                </div>
              )}
              {current?.status === 'failed' && (
                <div className="form-error" role="alert">
                  {current.error}
                </div>
              )}
              {brief && (
                <div className="brief-body">
                  <div className="brief-mode">
                    <span>
                      <span className="live-dot" />
                      {current.provider === 'extractive'
                        ? 'OFFLINE · EXTRACTIVE BRIEF'
                        : 'LIVE AI · CITATION REFERENCES VALIDATED'}
                    </span>
                    <span>{current.latency_ms} ms</span>
                  </div>
                  <p className="brief-summary">{brief.summary}</p>
                  {brief.hypotheses.length > 0 && (
                    <>
                      <h3 className="section-label">HYPOTHESES TO VERIFY</h3>
                      {brief.hypotheses.map((hypothesis, i) => (
                        <div className="hypothesis" key={i}>
                          <span>{String(i + 1).padStart(2, '0')}</span>
                          <p>
                            {hypothesis.claim} {cite(hypothesis.evidence_ids)}
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="unknowns">
                    <Info size={17} />
                    <div>
                      <strong>What we don’t know yet</strong>
                      <ul>
                        {brief.unknowns.map((unknown) => (
                          <li key={unknown}>{unknown}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </section>
            {!!brief?.actions.length && (
              <section className="panel actions-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <ShieldCheck size={18} />
                      Proposed next steps <span className="count">{brief.actions.length}</span>
                    </h2>
                    <p>Your approval records a decision. It does not execute an operation.</p>
                  </div>
                </div>
                {brief.actions.map((action, index) => {
                  const reviewed = data.decisions.find(
                    (d) => d.analysis_id === current.id && d.action_index === index,
                  );
                  return (
                    <div className="action-card" key={index}>
                      <div className="action-number">{index + 1}</div>
                      <div className="action-content">
                        <div className="action-heading">
                          <h3>{action.title}</h3>
                          <Badge tone={action.risk === 'low' ? 'neutral' : 'monitoring'}>
                            {action.risk} risk
                          </Badge>
                        </div>
                        <p>
                          {action.rationale} {cite(action.evidence_ids)}
                        </p>
                        {reviewed ? (
                          <div className={`reviewed ${reviewed.verdict}`}>
                            {reviewed.verdict === 'approved' ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <X size={16} />
                            )}
                            <div>
                              <strong>
                                {reviewed.verdict} by {reviewed.actor}
                              </strong>
                              <span>{reviewed.note}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="action-buttons">
                            <button
                              className="button approve"
                              onClick={() => setReview({ index, verdict: 'approved' })}
                            >
                              <Check size={14} />
                              Approve proposal
                            </button>
                            <button
                              className="button quiet"
                              onClick={() => setReview({ index, verdict: 'rejected' })}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </div>
          <aside className="evidence-column">
            <section className="panel evidence-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">THE WHY BEHIND THE BRIEF</span>
                  <h2>
                    Evidence <span className="count">{current?.evidence.length ?? 0}</span>
                  </h2>
                </div>
                <BookOpen size={19} />
              </div>
              {current?.evidence.length ? (
                current.evidence.map((evidence) => (
                  <button
                    key={evidence.id}
                    className={`evidence-card ${source === evidence.id ? 'chosen' : ''}`}
                    onClick={() => setSource(evidence.id)}
                  >
                    <span className="evidence-card-top">
                      <span className="evidence-id">{evidence.id}</span>
                      <span>
                        Lines {evidence.start_line}–{evidence.end_line}
                      </span>
                      <ArrowRight size={13} />
                    </span>
                    <strong>{evidence.title}</strong>
                    <p>{evidence.content.replace(/#+ /g, '').slice(0, 145)}…</p>
                    <span className="evidence-service">{evidence.service}</span>
                  </button>
                ))
              ) : (
                <div className="evidence-empty">
                  <BookOpen size={26} />
                  <p>Source passages appear here after an investigation.</p>
                  <span>Every reference links to an evidence snapshot.</span>
                </div>
              )}
              <div className="evidence-footer">
                <ShieldCheck size={14} /> Sources are saved with each brief.
              </div>
            </section>
            {!!current?.trace.length && (
              <section className="panel trace-panel">
                <h2>
                  Under the hood <ChevronDown size={15} />
                </h2>
                {current.trace.map((step, i) => (
                  <div className="trace-step" key={step.step}>
                    <span>{i + 1}</span>
                    <div>
                      <strong>{step.step}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </aside>
        </div>
      )}
      {selectedSource && (
        <Modal title={selectedSource.title} onClose={() => setSource(null)} wide>
          <div className="source-meta">
            <Badge tone="neutral">{selectedSource.id}</Badge>
            <span>
              Lines {selectedSource.start_line}–{selectedSource.end_line}
            </span>
            <span>BM25 relevance {selectedSource.score}</span>
          </div>
          <pre className="source-content">{selectedSource.content}</pre>
          <p className="tiny-note">
            Immutable snapshot from this analysis. Relevance is not a confidence score.
          </p>
        </Modal>
      )}
      {review && current && (
        <Modal
          title={review.verdict === 'approved' ? 'Approve this proposal' : 'Reject this proposal'}
          onClose={() => setReview(null)}
        >
          <div className="review-summary">
            <ShieldCheck size={20} />
            <p>{brief?.actions[review.index].title}</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const note = new FormData(event.currentTarget).get('note') as string;
              decision.mutate({
                analysisId: current.id,
                action_index: review.index,
                verdict: review.verdict,
                note,
              });
            }}
          >
            <label>
              Decision rationale
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={1000}
                rows={4}
                autoFocus
                placeholder="Explain your decision so the next engineer has context."
              />
            </label>
            <p className="inline-note">
              This review is permanent. No infrastructure commands are executed.
            </p>
            <footer>
              <button type="button" className="button" onClick={() => setReview(null)}>
                Cancel
              </button>
              <button className="button primary" disabled={decision.isPending}>
                {decision.isPending ? 'Recording…' : 'Record decision'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}

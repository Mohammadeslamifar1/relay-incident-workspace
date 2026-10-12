export type Profile = { id: string; name: string; email: string; role: string; workspace: string };
export type Health = { status: string; provider: string; demo_enabled: boolean };
export type Incident = {
  id: string;
  number: number;
  title: string;
  summary: string;
  service: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  status: 'investigating' | 'monitoring' | 'resolved';
  version: number;
  created_at: string;
  updated_at: string;
};
export type Evidence = {
  id: string;
  chunk_id: string;
  document_id: string;
  title: string;
  service: string;
  content: string;
  start_line: number;
  end_line: number;
  score: number;
};
export type Brief = {
  summary: string;
  hypotheses: { claim: string; evidence_ids: string[] }[];
  actions: { title: string; rationale: string; risk: string; evidence_ids: string[] }[];
  unknowns: string[];
  abstained: boolean;
};
export type Analysis = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  provider: string;
  result: Brief | null;
  evidence: Evidence[];
  trace: { step: string; detail: string }[];
  error: string | null;
  latency_ms: number | null;
  created_at: string;
};
export type Decision = {
  id: string;
  analysis_id: string;
  action_index: number;
  verdict: 'approved' | 'rejected';
  note: string;
  actor: string;
};
export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  detail: string;
  created_at: string;
};
export type IncidentDetail = Incident & {
  analyses: Analysis[];
  decisions: Decision[];
  events: AuditEvent[];
};
export type Document = {
  id: string;
  title: string;
  service: string;
  kind: string;
  content: string;
  chunks: number;
  created_at: string;
};
export type Evaluation = {
  id: string;
  created_at: string;
  results: {
    dataset_version: string;
    limitations: string;
    metrics: {
      recall_at_3: number;
      mrr: number;
      abstention_accuracy: number;
      citation_validity: number;
    };
    cases: { id: string; query: string; expected: string; retrieved: string[]; passed: boolean }[];
  };
};

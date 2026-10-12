import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, FileUp, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { post } from './api';
import { Modal } from './ui';
import type { Incident } from './types';

export function IncidentForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (incident: Incident) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await post<Incident>(
        '/incidents',
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      await client.invalidateQueries({ queryKey: ['incidents'] });
      onCreated(result);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Open an incident" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Incident title
          <input
            name="title"
            required
            minLength={5}
            maxLength={160}
            placeholder="e.g. Checkout latency after release"
            autoFocus
          />
        </label>
        <div className="form-grid">
          <label>
            Affected service
            <input
              name="service"
              required
              minLength={2}
              maxLength={60}
              placeholder="checkout-api"
            />
          </label>
          <label>
            Severity
            <select name="severity" defaultValue="SEV2">
              <option value="SEV1">SEV1 · Critical</option>
              <option value="SEV2">SEV2 · Major</option>
              <option value="SEV3">SEV3 · Minor</option>
            </select>
          </label>
        </div>
        <label>
          What are you observing?
          <textarea
            name="summary"
            rows={6}
            required
            minLength={20}
            maxLength={10000}
            placeholder="Describe symptoms, affected users, recent changes, and any metrics you have. Keep observations separate from assumptions."
          />
        </label>
        <div className="inline-note">
          <ShieldCheck size={17} /> Known secret patterns are redacted before storage.
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <footer>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create incident'}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function DocumentForm({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/documents', {
        ...Object.fromEntries(new FormData(event.currentTarget)),
        content,
      });
      await client.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add to your knowledge base" onClose={onClose} wide>
      <form onSubmit={submit}>
        <label>
          Document title
          <input
            name="title"
            required
            minLength={3}
            maxLength={140}
            placeholder="e.g. Checkout connection pool runbook"
            autoFocus
          />
        </label>
        <div className="form-grid">
          <label>
            Service
            <input
              name="service"
              required
              minLength={2}
              maxLength={60}
              placeholder="checkout-api"
            />
          </label>
          <label>
            Document type
            <select name="kind">
              <option value="runbook">Runbook</option>
              <option value="postmortem">Postmortem</option>
              <option value="architecture">Architecture</option>
            </select>
          </label>
        </div>
        <label className="file-upload">
          <FileUp size={18} /> Import a Markdown or text file
          <input
            type="file"
            accept=".md,.txt,text/plain,text/markdown"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 80000) {
                setError('Choose a text file smaller than 80 KB.');
                return;
              }
              setContent(await file.text());
              setError('');
            }}
          />
        </label>
        <label>
          Content
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            minLength={30}
            maxLength={80000}
            rows={9}
            placeholder="Paste a runbook or postmortem. Include symptoms, investigation steps, and verification criteria."
          />
        </label>
        <div className="inline-note">
          <ShieldCheck size={17} /> Indexed locally with line references. Duplicate content is
          detected.
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <footer>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Indexing…' : 'Index document'}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}

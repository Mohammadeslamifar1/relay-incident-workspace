import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, GitBranch, ShieldCheck, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { post } from './api';
import { Logo } from './ui';
import type { Health, Profile } from './types';

export default function Auth({ health }: { health?: Health }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  async function authenticate(path: string, body = {}) {
    setBusy(true);
    setError('');
    try {
      const user = await post<Profile>(path, body);
      client.setQueryData(['me'], user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void authenticate(`/auth/${mode}`, data);
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <div className="auth-kicker">
            <span className="live-dot" /> THE INCIDENT INTELLIGENCE WORKSPACE
          </div>
          <h1>
            Less noise.
            <br />
            More <em>context.</em>
            <br />
            Better decisions.
          </h1>
          <p>
            Connect the signal to the source. Turn scattered runbooks into a clear, reviewable path
            through your next incident.
          </p>
          <div className="auth-flow">
            <div>
              <GitBranch size={20} />
              <span>Incident</span>
            </div>
            <span className="flow-line" />
            <div className="active">
              <Sparkles size={20} />
              <span>Evidence</span>
            </div>
            <span className="flow-line" />
            <div>
              <ShieldCheck size={20} />
              <span>Review</span>
            </div>
          </div>
          <div className="auth-principles">
            <span>
              <Check size={15} /> Every brief has sources
            </span>
            <span>
              <Check size={15} /> Every action stays in your hands
            </span>
          </div>
        </div>
        <div className="auth-footer">
          BUILT FOR ENGINEERS WHO ASK WHY.<span>RELAY / 01</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow">A CALMER WAY TO RESPOND</span>
          <h2>{mode === 'login' ? 'Welcome to Relay' : 'Make room for clarity'}</h2>
          <p>
            {mode === 'login'
              ? 'Your next investigation starts with the right context.'
              : 'Create your own workspace. Your incidents and knowledge stay together.'}
          </p>
          {health?.demo_enabled && (
            <>
              <button
                className="button primary full demo-button"
                disabled={busy}
                onClick={() => void authenticate('/auth/demo')}
              >
                Explore the demo workspace <ArrowRight size={17} />
              </button>
              <p className="demo-caption">
                Sample incidents · Your own isolated workspace · No API key
              </p>
              <div className="divider">
                <span>or {mode === 'login' ? 'sign in' : 'create an account'}</span>
              </div>
            </>
          )}
          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="form-grid">
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Alex Morgan"
                  />
                </label>
                <label>
                  Workspace
                  <input
                    name="workspace"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Platform team"
                  />
                </label>
              </div>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 12 : 1}
                maxLength={128}
                placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'}
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button dark full" disabled={busy}>
              {busy ? 'Opening workspace…' : mode === 'login' ? 'Sign in' : 'Create workspace'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === 'login' ? 'Starting a new team?' : 'Already have a workspace?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Create a workspace' : 'Sign in'}
            </button>
          </p>
          <div className="local-note">
            <ShieldCheck size={17} />
            <span>Runs locally. Live AI is an optional connection.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

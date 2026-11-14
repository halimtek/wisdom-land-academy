'use client';

import { ArrowLeft, BookOpenCheck, Delete, Flame, LogOut, Plus, Trash2, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { minutes, readerAction, refreshReading, useReading, type ReaderProfileInfo } from '@/lib/reading-client';

export const READER_IDLE_MS = 15 * 60 * 1000;

/** Signs the reader out after 15 minutes without any activity (shared family iPads). */
export function useIdleSignOut(signedIn: boolean, onSignedOut?: () => void) {
  // Keep the latest callback without restarting the idle clock on every render.
  const callback = useRef(onSignedOut);
  useEffect(() => { callback.current = onSignedOut; });
  useEffect(() => {
    if (!signedIn) return;
    let last = Date.now();
    const mark = () => { last = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true, capture: true });
    const timer = window.setInterval(async () => {
      if (Date.now() - last < READER_IDLE_MS) return;
      window.clearInterval(timer);
      await readerAction('sign-out');
      callback.current?.();
    }, 30_000);
    return () => { window.clearInterval(timer); for (const e of events) window.removeEventListener(e, mark, { capture: true }); };
  }, [signedIn]);
}

export function GoalRing({ seconds, goalSeconds, size = 56 }: { seconds: number; goalSeconds: number; size?: number }) {
  const ratio = Math.min(1, seconds / goalSeconds);
  const r = (size - 8) / 2; const c = 2 * Math.PI * r;
  return (
    <svg className="wr-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${minutes(seconds)} of ${minutes(goalSeconds)} minutes today`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="wr-ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className={`wr-ring-fill${ratio >= 1 ? ' is-done' : ''}`} strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="wr-ring-text">{ratio >= 1 ? '★' : minutes(seconds)}</text>
    </svg>
  );
}

/** Welcome bar for the library pages. */
export function ReaderBar() {
  const { status, loaded } = useReading();
  const [open, setOpen] = useState(false);
  useIdleSignOut(Boolean(status?.reader), () => setOpen(true));
  if (!loaded) return <div className="wr-bar is-loading" aria-hidden="true" />;
  const reader = status?.reader;
  return (
    <>
      {reader && status?.today ? (
        <section className="wr-bar" aria-label="Your reading today">
          <GoalRing seconds={status.today.seconds} goalSeconds={status.today.goalSeconds} />
          <div className="wr-bar-text">
            <strong>Hi {reader.firstName}! {status.today.seconds >= status.today.goalSeconds ? 'You reached today’s goal 🎉' : `${minutes(status.today.seconds)} of ${minutes(status.today.goalSeconds)} minutes today`}</strong>
            <span>{reader.gradeName ?? 'Wisdom Land Academy'}{status.streak > 0 && <> · <Flame size={14} aria-hidden="true" /> {status.streak} {status.streak === 1 ? 'day' : 'days'} in a row</>}</span>
          </div>
          <div className="wr-bar-actions">
            <Link href="/library/me" className="wr-button wr-button-gold"><BookOpenCheck size={18} aria-hidden="true" />My reading</Link>
            <button type="button" className="wr-button" onClick={() => setOpen(true)}>Switch reader</button>
          </div>
        </section>
      ) : (
        <section className="wr-bar is-guest" aria-label="Who's reading?">
          <span className="wr-guest-icon" aria-hidden="true"><UserRound size={26} /></span>
          <div className="wr-bar-text">
            <strong>Who’s reading?</strong>
            <span>Tap your name to count your reading minutes and keep your streak.</span>
          </div>
          <div className="wr-bar-actions"><button type="button" className="wr-button wr-button-gold" onClick={() => setOpen(true)}>Who’s reading?</button></div>
        </section>
      )}
      <WhosReadingDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Compact reader identity for the book reader's top bar. */
export function ReaderChip({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const { status } = useReading();
  const [open, setOpen] = useState(false);
  const set = (value: boolean) => { setOpen(value); onOpenChange?.(value); };
  const reader = status?.reader;
  return (
    <>
      <button type="button" className="wr-chip" onClick={() => set(true)} aria-label={reader ? `Reading as ${reader.firstName}. Switch reader` : 'Who’s reading? Sign in to count your reading'}>
        <UserRound size={18} aria-hidden="true" /><span>{reader ? reader.firstName : 'Who’s reading?'}</span>
      </button>
      <WhosReadingDialog open={open} onClose={() => set(false)} />
    </>
  );
}

type View = { kind: 'list' } | { kind: 'pin'; profile: ReaderProfileInfo } | { kind: 'password'; profile: ReaderProfileInfo } | { kind: 'add' };

export function WhosReadingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status } = useReading();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const profiles = status?.profiles ?? [];
  const reader = status?.reader;

  // Reset to the start screen whenever the dialog opens (state adjusted during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setView(profiles.length ? { kind: 'list' } : { kind: 'add' }); setError(''); setManage(false); }
  }
  useEffect(() => { if (open) void refreshReading(); }, [open]);

  async function run(task: () => Promise<{ ok: boolean; error?: string }>, closeOnSuccess = true) {
    if (busy) return false;
    setBusy(true); setError('');
    const result = await task();
    setBusy(false);
    if (!result.ok) { setError(result.error ?? 'Something went wrong. Try again.'); return false; }
    if (closeOnSuccess) onClose();
    return true;
  }

  const choose = (profile: ReaderProfileInfo) => { setError(''); setView(profile.hasPin ? { kind: 'pin', profile } : { kind: 'password', profile }); };

  return (
    <ReadingModal open={open} onClose={onClose} title={view.kind === 'add' ? 'Add a reader' : view.kind === 'list' ? 'Who’s reading?' : `Hi ${view.profile.firstName}!`} preventClose={busy}>
      {view.kind !== 'list' && profiles.length > 0 && <button type="button" className="wr-back" onClick={() => { setView({ kind: 'list' }); setError(''); }}><ArrowLeft size={18} aria-hidden="true" />All readers</button>}

      {view.kind === 'list' && (
        <>
          <ul className="wr-profiles">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button type="button" className={`wr-profile${profile.active ? ' is-active' : ''}`} disabled={busy} onClick={() => (manage ? undefined : choose(profile))} aria-label={`${profile.firstName}${profile.gradeName ? `, ${profile.gradeName}` : ''}${profile.active ? ', reading now' : ''}`}>
                  <span className="wr-avatar" aria-hidden="true">{profile.firstName.charAt(0).toUpperCase()}</span>
                  <strong>{profile.firstName}</strong>
                  <small>{profile.active ? 'Reading now' : profile.gradeName ?? ''}</small>
                </button>
                {manage && <button type="button" className="wr-remove" disabled={busy} aria-label={`Remove ${profile.firstName} from this iPad`} onClick={() => void run(() => readerAction('forget', { profileId: profile.id }), false)}><Trash2 size={16} aria-hidden="true" /></button>}
              </li>
            ))}
            <li><button type="button" className="wr-profile is-add" disabled={busy} onClick={() => { setView({ kind: 'add' }); setError(''); }}><span className="wr-avatar" aria-hidden="true"><Plus size={22} /></span><strong>Add a reader</strong><small>First time on this iPad</small></button></li>
          </ul>
          <div className="wr-dialog-footer">
            {reader && <button type="button" className="wr-button" disabled={busy} onClick={() => void run(() => readerAction('sign-out'))}><LogOut size={16} aria-hidden="true" />Sign out {reader.firstName}</button>}
            {profiles.length > 0 && <button type="button" className="wr-link" onClick={() => setManage((v) => !v)}>{manage ? 'Done' : 'Remove a reader'}</button>}
            <button type="button" className="wr-link" onClick={onClose}>Read without signing in</button>
          </div>
        </>
      )}

      {view.kind === 'pin' && (
        <PinPad key={view.profile.id} busy={busy} onSubmit={(pin) => run(() => readerAction('switch', { profileId: view.profile.id, pin }))} onPassword={() => { setView({ kind: 'password', profile: view.profile }); setError(''); }} />
      )}

      {view.kind === 'password' && (
        <SecretForm
          busy={busy}
          intro={view.profile.hasPin ? 'Enter your password instead of your PIN.' : 'You don’t have a reading PIN yet, so enter your password. Ask your teacher for a PIN to make this quicker.'}
          fields={[{ name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' }]}
          submitLabel="Start reading"
          onSubmit={(values) => run(() => readerAction('switch', { profileId: view.profile.id, password: values.password }))}
        />
      )}

      {view.kind === 'add' && (
        <SecretForm
          busy={busy}
          intro="Sign in once with your school username and password. Next time, just tap your name and enter your PIN."
          fields={[{ name: 'username', label: 'Username', type: 'text', autoComplete: 'username' }, { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' }]}
          submitLabel="Sign in and start reading"
          onSubmit={(values) => run(() => readerAction('sign-in', values))}
        />
      )}

      <p className="wr-error" role="alert" aria-live="assertive">{error}</p>
    </ReadingModal>
  );
}

function PinPad({ busy, onSubmit, onPassword }: { busy: boolean; onSubmit: (pin: string) => Promise<boolean>; onPassword: () => void }) {
  const [pin, setPin] = useState('');
  const add = (digit: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) void onSubmit(next).then((ok) => { if (!ok) setPin(''); });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) add(event.key);
      else if (event.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="wr-pin">
      <p>Enter your 4-digit reading PIN</p>
      <div className="wr-pin-dots" aria-label={`${pin.length} of 4 digits entered`}>{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'is-filled' : ''} />)}</div>
      <div className="wr-pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" disabled={busy} onClick={() => add(d)}>{d}</button>)}
        <span />
        <button type="button" disabled={busy} onClick={() => add('0')}>0</button>
        <button type="button" disabled={busy || !pin} aria-label="Delete last digit" onClick={() => setPin((p) => p.slice(0, -1))}><Delete size={22} aria-hidden="true" /></button>
      </div>
      <button type="button" className="wr-link" onClick={onPassword}>Forgot your PIN? Use your password</button>
    </div>
  );
}

function SecretForm({ intro, fields, submitLabel, busy, onSubmit }: {
  intro: string; fields: { name: string; label: string; type: string; autoComplete: string }[]; submitLabel: string; busy: boolean;
  onSubmit: (values: Record<string, string>) => Promise<boolean>;
}) {
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSubmit(Object.fromEntries(fields.map((f) => [f.name, String(data.get(f.name) ?? '')])));
  }
  return (
    <form className="wr-form" onSubmit={submit}>
      <p>{intro}</p>
      {fields.map((field, index) => (
        <label key={field.name}>{field.label}
          <input ref={index === 0 ? first : undefined} name={field.name} type={field.type} autoComplete={field.autoComplete} autoCapitalize="none" spellCheck={false} required maxLength={256} />
        </label>
      ))}
      <button type="submit" className="wr-button wr-button-gold wr-button-wide" disabled={busy}>{busy ? 'Please wait…' : submitLabel}</button>
    </form>
  );
}

/** Small accessible modal (native <dialog>) for the library pages. */
function ReadingModal({ open, onClose, title, preventClose, children }: { open: boolean; onClose: () => void; title: string; preventClose?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="wr-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!preventClose) onClose(); }}
      onClose={() => { if (open) onClose(); }}
      onClick={(event) => { if (event.target === ref.current && !preventClose) onClose(); }}>
      {open && (
        <div className="wr-dialog-body">
          <div className="wr-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="wr-icon" aria-label="Close" disabled={preventClose} onClick={onClose}><X size={20} /></button></div>
          {children}
        </div>
      )}
    </dialog>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { login } from "@/app/actions/auth";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const [showPassword, setShowPassword] = useState(false);
  const loginMode = 'ADMIN';
  const heading = 'Admin Login';
  return (
    <main className="login-shell">
      <section className="login-art" aria-label="Wisdom Land Academy"><div className="art-glow" />
        <div className="brand-lockup"><Image className="login-brand-logo" src="/images/wla-emblem.png" alt="Wisdom Land Academy book-and-stars emblem" width={76} height={76} /><span>WISDOM LAND <b>ACADEMY</b></span></div>
        <div className="art-copy"><span className="eyebrow">A WORLD OF KNOWLEDGE</span><h1>Every page<br />opens a <em>possibility.</em></h1><p>Your learning journey starts here. Explore, discover, and grow with the Wisdom Land Academy library.</p></div>
        <div className="art-footer"><span>LEARN WITH PURPOSE</span><span>01 / 03</span></div>
      </section>
      <section className="login-panel">
        <div className="mobile-brand"><Image className="login-brand-logo" src="/images/wla-emblem.png" alt="Wisdom Land Academy book-and-stars emblem" width={56} height={56} /><b>WISDOM LAND ACADEMY</b></div>
        <div className="login-card"><div className="welcome-label">WISDOM LAND ACADEMY</div><h2>{heading}</h2><p className="login-intro">Use the school account provided by your administrator.</p>
          <form action={action} className="login-form">
            <input type="hidden" name="loginMode" value={loginMode} />
            <label htmlFor="username">Username</label><div className="input-wrap"><UserRound size={18} aria-hidden="true" /><input id="username" name="username" autoComplete="username" placeholder="Enter your username" required maxLength={80} /></div>
            <label htmlFor="password">Password</label><div className="input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required maxLength={256} /><button className="reveal-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <button className="submit-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>
          <div className="login-help"><span className="help-dot" />Need access? Contact your school administrator.</div>
        </div>
        <Link className="login-library-link" href="/library">Browse the public Digital Library</Link>
        <footer className="panel-footer"><span>Wisdom Land Academy</span><span>Secure school access</span></footer>
      </section>
    </main>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { login } from "@/app/actions/auth";
import { LanguageSwitcher, useI18n } from "@/i18n/client";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const [showPassword, setShowPassword] = useState(false);
  const { m, path } = useI18n();
  const t = m.login;
  const loginMode = 'ADMIN';
  const heading = t.title;
  return (
    <main className="login-shell">
      <section className="login-art" aria-label={m.common.schoolName}><div className="art-glow" />
        <div className="brand-lockup"><Image className="login-brand-logo" src="/images/wla-emblem.png" alt={m.common.emblemAlt} width={76} height={76} /><span>{m.common.brandFirst} <b>{m.common.brandSecond}</b></span></div>
        <div className="art-copy"><span className="eyebrow">{t.artEyebrow}</span><h1>{t.artLine1}<br />{t.artLine2} <em>{t.artEm}</em></h1><p>{t.artText}</p></div>
        <div className="art-footer"><span>{t.artFooter}</span><span>01 / 03</span></div>
      </section>
      <section className="login-panel">
        <div className="mobile-brand"><Image className="login-brand-logo" src="/images/wla-emblem.png" alt={m.common.emblemAlt} width={56} height={56} /><b>{m.common.schoolNameUpper}</b></div>
        <LanguageSwitcher className="login-lang-switch" />
        <div className="login-card"><div className="welcome-label">{m.common.schoolNameUpper}</div><h2>{heading}</h2><p className="login-intro">{t.intro}</p>
          <form action={action} className="login-form">
            <input type="hidden" name="loginMode" value={loginMode} />
            <label htmlFor="username">{t.username}</label><div className="input-wrap"><UserRound size={18} aria-hidden="true" /><input id="username" name="username" autoComplete="username" placeholder={t.usernamePlaceholder} required maxLength={80} /></div>
            <label htmlFor="password">{t.password}</label><div className="input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={t.passwordPlaceholder} required maxLength={256} /><button className="reveal-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t.hidePassword : t.showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <button className="submit-button" type="submit" disabled={pending}>{pending ? t.signingIn : t.signIn}<span aria-hidden="true" className="flip-rtl">→</span></button>
          </form>
          <div className="login-help"><span className="help-dot" />{t.help}</div>
        </div>
        <Link className="login-library-link" href={path('/library')}>{t.browseLibrary}</Link>
        <footer className="panel-footer"><span>{m.common.schoolName}</span><span>{t.secure}</span></footer>
      </section>
    </main>
  );
}

'use client';

import { Check, Link2, MessageCircle, Send, Share2, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/locales.mjs';

const noopSubscribe = () => () => {};
const NETWORKS: { name: string; Icon: LucideIcon; url: (u: string, t: string) => string }[] = [
  { name: 'Telegram', Icon: Send, url: (u: string, t: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { name: 'Facebook', Icon: ThumbsUp, url: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { name: 'WhatsApp', Icon: MessageCircle, url: (u: string, t: string) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
];

/** Share buttons. Nothing is sent anywhere until the visitor taps one. */
export function ShareBar({ title }: { title: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noopSubscribe, () => typeof navigator.share === 'function', () => false);
  const here = () => window.location.href.split('#')[0];

  async function copy() {
    try { await navigator.clipboard.writeText(here()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked: nothing to do */ }
  }

  return (
    <div className="news-share" role="group" aria-label={m.news.share}>
      <span className="news-share-label">{m.news.share}</span>
      {canShare && <button type="button" className="news-share-button" onClick={() => void navigator.share({ title, url: here() }).catch(() => undefined)}><Share2 size={16} aria-hidden="true" />{m.news.shareNative}</button>}
      {NETWORKS.map((network) => (
        <button key={network.name} type="button" className="news-share-button" aria-label={fmt(m.news.shareOn, { network: network.name })}
          onClick={() => window.open(network.url(here(), title), '_blank', 'noopener,noreferrer')}>
          <network.Icon size={15} aria-hidden="true" />{network.name}
        </button>
      ))}
      <button type="button" className="news-share-button" onClick={() => void copy()}>
        {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
        <span aria-live="polite">{copied ? m.news.copied : m.news.copyLink}</span>
      </button>
    </div>
  );
}

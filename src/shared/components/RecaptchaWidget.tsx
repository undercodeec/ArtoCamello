import { useEffect, useRef, useState } from 'react';

type Grecaptcha = { ready: (callback: () => void) => void; render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => number; reset: (id: number) => void };
declare global { interface Window { grecaptcha?: Grecaptcha } }

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  if (window.grecaptcha?.ready) return new Promise<void>(resolve => window.grecaptcha!.ready(() => resolve()));
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (window.grecaptcha?.ready) window.grecaptcha.ready(() => resolve());
      else reject(new Error('No se pudo cargar la verificación de seguridad.'));
    };
    script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar la verificación de seguridad.')); };
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}

export function RecaptchaWidget({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!siteKey) return;
    let active = true;
    loadScript().then(() => {
      if (active && host.current && window.grecaptcha && widget.current === null) {
        widget.current = window.grecaptcha.render(host.current, {
          sitekey: siteKey, callback: onToken,
          'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
        });
      }
    }).catch(() => { if (active) { onToken(''); setError('No se pudo cargar la verificación. Recarga la página para intentarlo de nuevo.'); } });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (resetKey && widget.current !== null) { window.grecaptcha?.reset(widget.current); onToken(''); } }, [resetKey]);
  return siteKey ? <div><div ref={host} aria-label="Verificación de seguridad" />{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div> : null;
}

export const recaptchaConfigured = Boolean(siteKey);

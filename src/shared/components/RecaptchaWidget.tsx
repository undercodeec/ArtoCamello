import { useEffect, useRef, useState } from 'react';

type Grecaptcha = { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => number; reset: (id: number) => void };
declare global { interface Window { grecaptcha?: Grecaptcha } }

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar la verificación de seguridad.'));
    document.head.appendChild(script);
  });
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
    }).catch(() => { onToken(''); setError('No se pudo cargar la verificación. Recarga la página para intentarlo de nuevo.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (resetKey && widget.current !== null) { window.grecaptcha?.reset(widget.current); onToken(''); } }, [resetKey]);
  return siteKey ? <div><div ref={host} aria-label="Verificación de seguridad" />{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div> : null;
}

export const recaptchaConfigured = Boolean(siteKey);

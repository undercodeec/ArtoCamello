type MetaPixelParameters = Record<string, string | number | boolean | string[] | undefined>;
const META_PIXEL_ID = '2605715483198140';

type MetaPixelFunction = {
  (action: 'init', pixelId: string): void;
  (action: 'track', eventName: string, parameters?: MetaPixelParameters): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: MetaPixelFunction;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
  }
}

/** Initializes the browser pixel only from the commercial application. */
export function initializeMetaPixel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof window.fbq === 'function') return true;

  const fbq = ((...args: unknown[]) => {
    if (typeof fbq.callMethod === 'function') fbq.callMethod.apply(fbq, args);
    else fbq.queue?.push(args);
  }) as MetaPixelFunction;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  fbq('init', META_PIXEL_ID);
  return true;
}

/** Sends an event only when the Meta Pixel is available in the browser. */
export function trackMetaEvent(eventName: string, parameters?: MetaPixelParameters) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;

  window.fbq('track', eventName, parameters);
}

export function trackMetaPageView() {
  trackMetaEvent('PageView');
}

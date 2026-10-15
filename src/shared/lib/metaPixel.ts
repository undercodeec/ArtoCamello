type MetaPixelParameters = Record<string, string | number | boolean | string[] | undefined>;

type MetaPixelFunction = {
  (action: 'track', eventName: string, parameters?: MetaPixelParameters): void;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
  }
}

/** Sends an event only when the Meta Pixel is available in the browser. */
export function trackMetaEvent(eventName: string, parameters?: MetaPixelParameters) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;

  window.fbq('track', eventName, parameters);
}

export function trackMetaPageView() {
  trackMetaEvent('PageView');
}

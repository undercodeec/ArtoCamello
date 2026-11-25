type MetaPixelParameters = Record<string, string | number | boolean | string[] | undefined>;

type MetaPixelFunction = {
  (action: 'track', eventName: string, parameters?: MetaPixelParameters): void;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
  }
}

/** Disabled until optional analytics and advertising preferences are implemented. */
export function trackMetaEvent(_eventName: string, _parameters?: MetaPixelParameters) {
  return;
}

export function trackMetaPageView() {
  trackMetaEvent('PageView');
}

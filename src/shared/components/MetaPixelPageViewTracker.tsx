import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { trackMetaPageView } from '@/shared/lib/metaPixel';

/** Tracks SPA navigations while the HTML pixel handles the first page load. */
export function MetaPixelPageViewTracker() {
  const location = useLocation();
  const initialLocation = useRef(`${location.pathname}${location.search}`);

  useEffect(() => {
    const currentLocation = `${location.pathname}${location.search}`;

    if (currentLocation !== initialLocation.current) {
      trackMetaPageView();
    }
  }, [location.pathname, location.search]);

  return null;
}

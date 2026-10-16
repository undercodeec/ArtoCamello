import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { initializeMetaPixel, trackMetaPageView } from '@/shared/lib/metaPixel';

/** Initializes and tracks Meta Pixel events only in the commercial application. */
export function MetaPixelPageViewTracker() {
  const location = useLocation();
  const initialLocation = useRef(`${location.pathname}${location.search}`);

  useEffect(() => {
    if (initializeMetaPixel()) trackMetaPageView();
  }, []);

  useEffect(() => {
    const currentLocation = `${location.pathname}${location.search}`;

    if (currentLocation !== initialLocation.current) {
      trackMetaPageView();
    }
  }, [location.pathname, location.search]);

  return null;
}

/// <reference types="vite/client" />
// Type declarations for custom imports
// This file helps TypeScript understand non-standard module imports

// Figma asset imports (resolved by the figmaAssetResolver Vite plugin)
declare module 'figma:asset/*.png' {
  const src: string;
  export default src;
}

declare module 'figma:asset/*.jpg' {
  const src: string;
  export default src;
}

declare module 'figma:asset/*.svg' {
  const src: string;
  export default src;
}

// Image file imports
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

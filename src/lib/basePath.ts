// Keep in sync with `basePath` in next.config.ts. Client-side `fetch` calls
// (unlike next/link and the router) do not get the basePath prepended
// automatically, so every API call must use this constant explicitly.
export const BASE_PATH = "/workflow";

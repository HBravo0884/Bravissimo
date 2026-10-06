import { useEffect, useState } from "react";

/**
 * Hash routes ("#/teacher/abc") so the app runs from any static host,
 * including a sub-folder, with no server rewrites.
 */
function parse(): string[] {
  return window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(path: string, replace = false) {
  const url = `#${path}`;
  if (replace) window.history.replaceState(null, "", url);
  else window.location.hash = path;
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export const href = (path: string) => `#${path}`;

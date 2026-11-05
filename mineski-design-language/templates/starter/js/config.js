/* Relay - configuration. Everything a maintainer may need to change lives here.
   Never put secrets here: the site is public. Secrets live on the proxy (Render env). */

export const APP = {
  name: "Relay",
  key: "relay",                 // localStorage / sessionStorage prefix
  version: "1.0.0",             // shown beside the name; bump it with every release and log it in CHANGELOG.md
  envLabel: "",                 // e.g. "Test copy": shows a badge in the top bar while not live
};

export const SERVICE = {
  hosted: "https://relay-proxy.onrender.com",   // the proxy that holds the secrets
};

/* Option labels exactly as the backend (Lark) spells them. */
export const PRIORITIES = ["Low", "Normal", "Urgent"];

/* Stages of the long task, in order, with honest typical durations (ms). */
export const STAGES = [
  { id: "read", label: "Reading the request", ms: 1200 },
  { id: "extract", label: "Pulling out the details", ms: 1600 },
  { id: "format", label: "Formatting the summary", ms: 800 },
];

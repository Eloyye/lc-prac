/**
 * Shared Scoreboard class strings for dialogs, forms, and secondary pages, so
 * every modal and button speaks the same visual language (tokens: index.css).
 */

/** Full-screen scrim behind a modal. Pair with a `fixed` or `absolute` inset. */
export const overlay =
  "inset-0 flex items-center justify-center bg-cobalt-950/80 p-4 backdrop-blur-sm";

/** The modal panel itself. */
export const dialogPanel =
  "w-full rounded-2xl border-2 border-cobalt-600 bg-cobalt-800 p-6 text-paper shadow-2xl shadow-cobalt-950 outline-none";

export const dialogTitle = "font-display text-3xl leading-none font-extrabold";

/** Text-only close control in a dialog header. */
export const closeButton = "text-sm font-medium text-cobalt-300 hover:text-paper";

export const input =
  "w-full rounded-lg border-2 border-cobalt-600 bg-cobalt-950 px-3 py-2 text-sm text-paper outline-none placeholder:text-cobalt-400 focus:border-pink";

export const fieldLabel = "text-xs font-semibold text-cobalt-300";

export const primaryButton =
  "rounded-full bg-pink px-4 py-2 text-sm font-bold text-pink-ink hover:bg-pink-light disabled:cursor-wait disabled:opacity-60";

export const secondaryButton =
  "rounded-full border-2 border-cobalt-600 px-3.5 py-1.5 text-sm font-semibold text-cobalt-200 hover:border-cobalt-300 hover:text-paper disabled:opacity-50";

export const dangerButton =
  "rounded-full border-2 border-cobalt-600 px-3.5 py-1.5 text-sm font-semibold text-cobalt-200 hover:border-tomato hover:text-tomato";

/** Small inline text action (Refresh, Remove, Reset). */
export const textButton = "text-xs font-semibold text-cobalt-300 hover:text-paper";

/** Page shell for the non-session routes (Library, Problem detail, Stats). */
export const page = "relative min-h-screen bg-cobalt-900 text-paper";

/** Breadcrumb back to the Library, matching the session header. */
export const backLink = "text-sm font-medium text-cobalt-300 hover:text-paper";

export const sectionHeading = "font-display text-2xl leading-none font-extrabold";

export const errorText = "text-sm text-tomato";

export const mutedText = "text-sm text-cobalt-300";

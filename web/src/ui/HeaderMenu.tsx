import { useEffect, useRef, useState } from "react";

export type HeaderMenuItem = {
  label: string;
  onClick: () => void;
  /** Optional keyboard hint shown trailing the label (e.g. "⌘K"). */
  kbd?: string;
  /** Tints the item: a primary call-to-action or a destructive action. */
  variant?: "primary" | "danger";
};

const ITEM_VARIANT: Record<"default" | "primary" | "danger", string> = {
  default: "text-neutral-300 hover:bg-neutral-800 hover:text-white",
  primary: "text-emerald-300 hover:bg-neutral-800 hover:text-emerald-200",
  danger: "text-rose-300 hover:bg-neutral-800 hover:text-rose-200",
};

/**
 * Collapsed action menu for narrow viewports: a hamburger trigger that opens a
 * right-aligned dropdown of the same actions the header shows inline at `md` and
 * up. Dismiss mechanics mirror {@link AccountControl} — outside pointerdown,
 * Escape, and close-on-select. Intentionally self-contained; it owns no app
 * state beyond its own open/closed flag, so each header just hands it an
 * `items` array. `className` carries the responsive gate (`md:hidden`).
 */
export function HeaderMenu({ items, className }: { items: HeaderMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss the menu on outside pointerdown or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-neutral-700 bg-neutral-900 p-1.5 text-sm shadow-2xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-left ${
                ITEM_VARIANT[item.variant ?? "default"]
              }`}
            >
              <span>{item.label}</span>
              {item.kbd !== undefined && (
                <kbd className="font-mono text-xs text-neutral-500">{item.kbd}</kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { aboveQuery, maxWidthQuery } from "../../lib/breakpoints";

// Keep the desktop toolbar, but disclose secondary actions on phones.
export function JournalActions({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia(aboveQuery("md"));
    const sync = () => { if (ref.current) ref.current.open = desktop.matches; };
    const closeOutside = (event: PointerEvent) => {
      if (!desktop.matches && ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    sync();
    desktop.addEventListener("change", sync);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      desktop.removeEventListener("change", sync);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, []);
  return (
    <details ref={ref} className="journal-actions-disclosure"
      onClick={(event) => {
        if (window.matchMedia(maxWidthQuery("md")).matches && (event.target as Element).closest("button")) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && window.matchMedia(maxWidthQuery("md")).matches) {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
      <summary aria-label={label}>···</summary>
      <div className="journal-card-actions">{children}</div>
    </details>
  );
}

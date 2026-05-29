import { cn } from "@/lib/utils";

// Shared micro-label style for the small uppercase section headings used
// throughout the edit-album panes.
export const microLabel =
  "text-[0.62rem] font-semibold tracking-[0.1em] uppercase text-muted-foreground";

// A labelled form field wrapper, shared by the Details tab and the per-track
// expanded editor.
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={cn(microLabel, "mb-1.5 block")}>{label}</span>
      {children}
      {hint && (
        <span className="block text-[0.7rem] text-muted-foreground mt-1">
          {hint}
        </span>
      )}
    </label>
  );
}

export function SectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-baseline gap-2 mb-3 mt-8 first:mt-0">
      <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-[0.75rem] text-muted-foreground/60">{count}</span>
    </div>
  );
}

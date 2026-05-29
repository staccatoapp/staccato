import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DraftCredit, JOIN_PHRASES } from "../edit-album-utils";

export function ArtistCreditsEditor({
  artists,
  onChange,
  onDone,
}: {
  artists: DraftCredit[];
  onChange: (artists: DraftCredit[]) => void;
  onDone: () => void;
}) {
  const list = artists.length ? artists : [{ name: "", joinPhrase: null }];

  const setRow = (i: number, patch: Partial<DraftCredit>) =>
    onChange(list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const addArtist = () => {
    const next = list.map((a, idx) =>
      idx === list.length - 1
        ? { ...a, joinPhrase: a.joinPhrase || "feat." }
        : a,
    );
    next.push({ name: "", joinPhrase: null });
    onChange(next);
  };

  const removeArtist = (i: number) => {
    let next = list.filter((_, idx) => idx !== i);
    if (!next.length) next = [{ name: "", joinPhrase: null }];
    const last = next[next.length - 1];
    if (last) next[next.length - 1] = { ...last, joinPhrase: null };
    onChange(next);
  };

  const grid = "grid grid-cols-[1fr_132px_28px] gap-2.5";

  return (
    <div>
      <div
        className={cn(
          grid,
          "pb-1.5 text-[0.62rem] font-semibold tracking-[0.1em] uppercase text-muted-foreground",
        )}
      >
        <span>Track artist</span>
        <span>Join phrase</span>
        <span />
      </div>
      <datalist id="edit-join-phrases">
        {JOIN_PHRASES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="flex flex-col gap-2">
        {list.map((a, i) => {
          const isLast = i === list.length - 1;
          return (
            <div key={i} className={cn(grid, "items-center")}>
              <CreditInput
                value={a.name}
                placeholder={i === 0 ? "Primary artist" : "Featured artist"}
                onChange={(v) => setRow(i, { name: v })}
              />
              <CreditInput
                value={a.joinPhrase ?? ""}
                placeholder={isLast ? "—" : "feat."}
                disabled={isLast}
                list="edit-join-phrases"
                title={
                  isLast
                    ? "Add another artist to set a join phrase"
                    : "Phrase linking to the next artist"
                }
                onChange={(v) => setRow(i, { joinPhrase: v })}
              />
              {list.length > 1 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Remove artist"
                  onClick={() => removeArtist(i)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
      <div className={cn(grid, "items-center mt-2.5")}>
        <div className="flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={addArtist}
            className="gap-1.5"
          >
            <Plus className="size-3" />
            Add track artist
          </Button>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onDone}
            className="gap-1.5"
          >
            <Check className="size-3" />
            Done editing
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreditInput({
  value,
  onChange,
  placeholder,
  disabled,
  list,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  list?: string;
  title?: string;
}) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      list={list}
      title={title}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

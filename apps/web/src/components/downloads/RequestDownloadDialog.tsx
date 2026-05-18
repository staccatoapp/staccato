import { ArrowUpRight, ChevronDown, Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type RequestDownloadSubject = "track" | "release" | "playlist";

interface CopyConfig {
  title: string;
  confirmLabel: string;
  warning: string | null;
}

const COPY: Record<RequestDownloadSubject, CopyConfig> = {
  track: {
    title: "Request Track",
    confirmLabel: "Request Track",
    warning: "Additional tracks will be downloaded along with your request.",
  },
  release: {
    title: "Request Release",
    confirmLabel: "Request Release",
    warning: null,
  },
  playlist: {
    title: "Request Playlist",
    confirmLabel: "Request Playlist",
    warning: "Several releases will be downloaded as a part of this request.",
  },
};

export interface RequestDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: RequestDownloadSubject;
  subjectName: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
}

export function RequestDownloadDialog({
  open,
  onOpenChange,
  subject,
  subjectName,
  isSubmitting,
  errorMessage,
  onConfirm,
}: RequestDownloadDialogProps) {
  const copy = COPY[subject];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{copy.title}</DialogTitle>
          <DialogDescription className="truncate">
            {subjectName}
          </DialogDescription>
        </DialogHeader>

        {copy.warning && (
          <div className="flex items-start gap-3 rounded-lg bg-primary/10 ring-1 ring-primary/25 px-3 py-2.5">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-foreground/90">
              {copy.warning}{" "}
              <a
                href="https://example.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary font-medium hover:underline underline-offset-2"
              >
                Learn more
                <ArrowUpRight className="w-3 h-3" />
              </a>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Quality Profile
          </span>
          <button
            type="button"
            disabled
            aria-disabled
            className="flex items-center justify-between w-full h-9 px-3 rounded-lg border border-input bg-input/30 text-sm text-foreground/80 disabled:cursor-not-allowed disabled:opacity-70"
            title="Quality profile selection coming soon"
          >
            <span>Ultra-HD (Default)</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {errorMessage && (
          <p className="text-xs text-destructive -mt-1">{errorMessage}</p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

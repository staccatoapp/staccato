import { useCallback, useMemo, useState } from "react";
import type { CreateDownloadRequest } from "@staccato/shared";
import { useRequestDownload } from "./useRequestDownload";
import type {
  RequestDownloadDialogProps,
  RequestDownloadSubject,
} from "@/components/downloads/RequestDownloadDialog";

type Pending =
  | {
      mode: "single";
      subject: RequestDownloadSubject;
      subjectName: string;
      payload: CreateDownloadRequest;
    }
  | {
      mode: "bulk";
      subject: RequestDownloadSubject;
      subjectName: string;
      run: () => Promise<void> | void;
    };

interface OpenSingleArgs {
  subject: RequestDownloadSubject;
  subjectName: string;
  payload: CreateDownloadRequest;
}

interface OpenBulkArgs {
  subject: RequestDownloadSubject;
  subjectName: string;
  run: () => Promise<void> | void;
}

export function useRequestDownloadDialog() {
  const mutation = useRequestDownload();
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const openSingle = useCallback((args: OpenSingleArgs) => {
    setPending({ mode: "single", ...args });
    setError(null);
    setOpen(true);
  }, []);

  const openBulk = useCallback((args: OpenBulkArgs) => {
    setPending({ mode: "bulk", ...args });
    setError(null);
    setOpen(true);
  }, []);

  const onConfirm = useCallback(async () => {
    if (!pending) return;
    setError(null);
    if (pending.mode === "single") {
      mutation.mutate(pending.payload, {
        onSuccess: () => {
          close();
        },
        onError: (err) => {
          setError(err.message || "Request failed.");
        },
      });
      return;
    }
    setBulkSubmitting(true);
    try {
      await pending.run();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBulkSubmitting(false);
    }
  }, [pending, mutation, close]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        close();
      } else {
        setOpen(true);
      }
    },
    [close],
  );

  const isSubmitting =
    pending?.mode === "bulk" ? bulkSubmitting : mutation.isPending;

  const dialogProps = useMemo<RequestDownloadDialogProps>(
    () => ({
      open,
      onOpenChange,
      subject: pending?.subject ?? "track",
      subjectName: pending?.subjectName ?? "",
      isSubmitting,
      errorMessage: error,
      onConfirm,
    }),
    [open, onOpenChange, pending, isSubmitting, error, onConfirm],
  );

  return {
    openSingle,
    openBulk,
    dialogProps,
  };
}

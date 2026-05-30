import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LidarrOptionsSchema, LidarrSettingsSchema } from "@staccato/shared";
import type {
  CreateDownloadRequest,
  LidarrOptions,
  LidarrSettings,
} from "@staccato/shared";
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
      run: (args: { qualityProfileId: number | null }) => Promise<void> | void;
    };

interface OpenSingleArgs {
  subject: RequestDownloadSubject;
  subjectName: string;
  payload: CreateDownloadRequest;
}

interface OpenBulkArgs {
  subject: RequestDownloadSubject;
  subjectName: string;
  run: (args: { qualityProfileId: number | null }) => Promise<void> | void;
}

export function useRequestDownloadDialog() {
  const mutation = useRequestDownload();
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<
    number | null
  >(null);

  const settingsQuery = useQuery({
    queryKey: ["lidarr-settings"],
    queryFn: async (): Promise<LidarrSettings> => {
      const res = await fetch("/api/admin/lidarr");
      if (!res.ok) throw new Error("Failed to fetch Lidarr settings");
      return LidarrSettingsSchema.parse(await res.json());
    },
    staleTime: 5 * 60_000,
  });

  const optionsQuery = useQuery({
    queryKey: ["lidarr-options"],
    queryFn: async (): Promise<LidarrOptions> => {
      const res = await fetch("/api/admin/lidarr/options");
      if (!res.ok) throw new Error("Failed to fetch Lidarr options");
      return LidarrOptionsSchema.parse(await res.json());
    },
    enabled: !!settingsQuery.data?.apiKeySet,
    staleTime: 5 * 60_000,
  });

  const qualityProfiles = optionsQuery.data?.qualityProfiles ?? null;
  const defaultQualityProfileId =
    settingsQuery.data?.qualityProfileId ?? qualityProfiles?.[0]?.id ?? null;

  useEffect(() => {
    if (!open) return;
    if (selectedQualityProfileId !== null) return;
    if (defaultQualityProfileId !== null) {
      setSelectedQualityProfileId(defaultQualityProfileId);
    }
  }, [open, selectedQualityProfileId, defaultQualityProfileId]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSelectedQualityProfileId(null);
  }, []);

  const openSingle = useCallback(
    (args: OpenSingleArgs) => {
      setPending({ mode: "single", ...args });
      setError(null);
      setSelectedQualityProfileId(defaultQualityProfileId);
      setOpen(true);
    },
    [defaultQualityProfileId],
  );

  const openBulk = useCallback(
    (args: OpenBulkArgs) => {
      setPending({ mode: "bulk", ...args });
      setError(null);
      setSelectedQualityProfileId(defaultQualityProfileId);
      setOpen(true);
    },
    [defaultQualityProfileId],
  );

  const onConfirm = useCallback(async () => {
    if (!pending) return;
    setError(null);
    if (pending.mode === "single") {
      const payload: CreateDownloadRequest = {
        ...pending.payload,
        ...(selectedQualityProfileId !== null && {
          qualityProfileId: selectedQualityProfileId,
        }),
      };
      mutation.mutate(payload, {
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
      await pending.run({ qualityProfileId: selectedQualityProfileId });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBulkSubmitting(false);
    }
  }, [pending, mutation, close, selectedQualityProfileId]);

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
      qualityProfiles,
      selectedQualityProfileId,
      onSelectedQualityProfileIdChange: setSelectedQualityProfileId,
      isLoadingProfiles: optionsQuery.isLoading,
    }),
    [
      open,
      onOpenChange,
      pending,
      isSubmitting,
      error,
      onConfirm,
      qualityProfiles,
      selectedQualityProfileId,
      optionsQuery.isLoading,
    ],
  );

  return {
    openSingle,
    openBulk,
    dialogProps,
  };
}

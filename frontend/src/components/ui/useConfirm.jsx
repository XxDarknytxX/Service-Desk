/**
 * useConfirm — lightweight confirmation-dialog hook.
 *
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   confirm({
 *     title: "Delete user?",
 *     message: <>This will permanently remove <strong>{name}</strong>.</>,
 *     confirmText: "Delete",
 *     onConfirm: async () => { await api(...); toast.success("Deleted"); },
 *   });
 *   ...
 *   return (<> ...page... {confirmDialog} </>);
 *
 * The dialog shows a loading state while onConfirm runs and closes when it
 * settles. onConfirm should handle its own error toasts.
 */

import { useState, useCallback } from "react";
import { ConfirmModal } from "./Modal";

export default function useConfirm() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((options) => {
    setLoading(false);
    setState(options);
  }, []);

  const close = useCallback(() => {
    setState(null);
    setLoading(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!state?.onConfirm) {
      close();
      return;
    }
    setLoading(true);
    try {
      await state.onConfirm();
    } finally {
      close();
    }
  }, [state, close]);

  const confirmDialog = (
    <ConfirmModal
      open={!!state}
      onClose={close}
      onConfirm={handleConfirm}
      title={state?.title || "Are you sure?"}
      message={state?.message}
      confirmText={state?.confirmText || "Confirm"}
      cancelText={state?.cancelText || "Cancel"}
      variant={state?.variant || "danger"}
      icon={state?.icon}
      loading={loading}
    />
  );

  return { confirm, confirmDialog };
}

'use client';

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useClearFaultCodes, useDtcClearStatus } from '../../services/dtc-clear-api';
import { ClearConfirmationModal } from './ClearConfirmationModal';
import { ClearResultBanner } from './ClearResultBanner';

type ClearStatus = 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';

interface ClearFaultCodesButtonProps {
  sessionId: string;
  faultCodeCount: number;
  isSessionOpen?: boolean;
  onRescan?: () => void;
}

/**
 * ClearFaultCodesButton — Feature 009 Phase B.
 *
 * Button that only appears when a session has fault codes and is open.
 * On click, shows the confirmation modal. On confirm, calls the
 * DTC clear API and shows progress/result banners.
 */
export function ClearFaultCodesButton({
  sessionId,
  faultCodeCount,
  isSessionOpen = true,
  onRescan,
}: ClearFaultCodesButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [resultStatus, setResultStatus] = useState<ClearStatus>('NONE');
  const [failureReason, setFailureReason] = useState<string | undefined>();

  const clearMutation = useClearFaultCodes();
  const clearStatusQuery = useDtcClearStatus(
    resultStatus === 'PENDING' ? sessionId : null,
  );

  // When the clear mutation completes, start polling for status
  useEffect(() => {
    if (clearMutation.isSuccess) {
      setResultStatus('PENDING');
    }
  }, [clearMutation.isSuccess]);

  // Poll for status changes while PENDING
  useEffect(() => {
    if (clearStatusQuery.data?.clearStatus === 'SUCCESS') {
      setResultStatus('SUCCESS');
      setFailureReason(undefined);
    } else if (clearStatusQuery.data?.clearStatus === 'FAILED') {
      setResultStatus('FAILED');
      setFailureReason(undefined);
    }
  }, [clearStatusQuery.data?.clearStatus]);

  // Handle mutation error
  useEffect(() => {
    if (clearMutation.isError) {
      setResultStatus('FAILED');
      setFailureReason(
        clearMutation.error instanceof Error
          ? clearMutation.error.message
          : 'Failed to queue DTC clear command.',
      );
    }
  }, [clearMutation.isError, clearMutation.error]);

  // Don't render if no fault codes or session is closed
  if (faultCodeCount === 0 || !isSessionOpen) return null;

  const handleConfirm = async () => {
    setModalOpen(false);
    setResultStatus('NONE');
    setFailureReason(undefined);
    try {
      await clearMutation.mutateAsync(sessionId);
    } catch {
      // Error handled by useEffect above
    }
  };

  const handleDismiss = () => {
    setResultStatus('NONE');
    setFailureReason(undefined);
  };

  return (
    <div className="space-y-3">
      {/* Result banner */}
      {resultStatus !== 'NONE' && (
        <ClearResultBanner
          status={resultStatus}
          failureReason={failureReason}
          onRescan={onRescan}
          onDismiss={handleDismiss}
        />
      )}

      {/* Button — hidden while pending or showing result */}
      {resultStatus === 'NONE' && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={clearMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Clear Fault Codes
        </button>
      )}

      {/* Confirmation modal */}
      <ClearConfirmationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        faultCodeCount={faultCodeCount}
      />
    </div>
  );
}
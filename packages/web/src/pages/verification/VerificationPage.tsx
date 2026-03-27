import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '../../lib/api';

type VerificationState = 'loading' | 'verified' | 'pending' | 'rejected' | 'capture';

export default function VerificationPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<VerificationState>('loading');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    const res = await api.verification.status() as { success: boolean; data?: { status: string; rejectionReason?: string } };
    if (!res.success || !res.data) {
      setState('capture');
      return;
    }

    switch (res.data.status) {
      case 'APPROVED':
        setState('verified');
        break;
      case 'PENDING':
        setState('pending');
        break;
      case 'REJECTED':
        setState('rejected');
        setRejectionReason(res.data.rejectionReason ?? null);
        break;
      default:
        setState('capture');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function handleRetake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    fileInputRef.current?.click();
  }

  async function handleSubmit() {
    if (!selectedFile || submitting) return;
    setSubmitting(true);

    try {
      const res = await api.verification.submit(selectedFile) as { success: boolean; error?: string };

      if (res.success) {
        setState('pending');
        WebApp.showPopup({
          title: t('verification.submitSuccess'),
          message: ' ',
          buttons: [{ type: 'close' }],
        });
      } else {
        WebApp.showPopup({
          title: t('common.error'),
          message: typeof res.error === 'string' ? res.error : t('common.error'),
          buttons: [{ type: 'close' }],
        });
      }
    } catch {
      WebApp.showPopup({
        title: t('common.error'),
        message: t('common.retry'),
        buttons: [{ type: 'close' }],
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Verified ─────────────────────────────────────────────
  if (state === 'verified') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-tg-text mb-2">{t('verification.verified')}</h2>
        <p className="text-tg-hint text-sm">{t('verification.verifiedDescription')}</p>
      </div>
    );
  }

  // ─── Pending ──────────────────────────────────────────────
  if (state === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-tg-button/10 flex items-center justify-center mb-4">
          <div className="w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-tg-text mb-2">{t('verification.pending')}</h2>
        <p className="text-tg-hint text-sm">{t('verification.pendingDescription')}</p>
      </div>
    );
  }

  // ─── Rejected ─────────────────────────────────────────────
  if (state === 'rejected' && !preview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-tg-text mb-2">{t('verification.rejected')}</h2>
        {rejectionReason && (
          <p className="text-tg-hint text-sm mb-4">
            {t('verification.rejectedReason', { reason: rejectionReason })}
          </p>
        )}
        <button
          onClick={() => { setState('capture'); fileInputRef.current?.click(); }}
          className="px-6 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium"
        >
          {t('verification.tryAgain')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  // ─── Capture / Preview ────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      <h1 className="text-xl font-semibold text-tg-text mb-2">{t('verification.title')}</h1>
      <p className="text-tg-hint text-sm mb-6">{t('verification.instructions')}</p>

      {/* Guide overlay illustration */}
      {!preview && (
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="relative w-48 h-48 rounded-full border-2 border-dashed border-tg-hint/40 flex items-center justify-center">
            <svg className="w-24 h-24 text-tg-hint/30" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth={1.5}>
              {/* Face outline */}
              <ellipse cx="50" cy="42" rx="22" ry="28" />
              {/* Eyes */}
              <circle cx="42" cy="38" r="2" fill="currentColor" />
              <circle cx="58" cy="38" r="2" fill="currentColor" />
              {/* Smile */}
              <path d="M42 50 Q50 56 58 50" strokeLinecap="round" />
              {/* Hand */}
              <path d="M78 45 L85 35 M78 45 L88 42 M78 45 L86 50 M78 45 L82 55 M78 45 L70 60" strokeLinecap="round" strokeWidth={2} />
            </svg>
          </div>
          <p className="text-tg-hint text-xs text-center">{t('verification.instructionsTip')}</p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="flex flex-col items-center gap-4 mb-6">
          <img
            src={preview}
            alt="Selfie preview"
            className="w-48 h-48 rounded-full object-cover border-2 border-tg-button"
          />
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-3 pb-4">
        {!preview ? (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-tg-button text-tg-button-text rounded-xl font-medium"
            >
              {t('verification.takePhoto')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileChange}
              className="hidden"
            />
          </>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-tg-button text-tg-button-text rounded-xl font-medium disabled:opacity-50"
            >
              {submitting ? t('verification.submitting') : t('verification.submit')}
            </button>
            <button
              onClick={handleRetake}
              disabled={submitting}
              className="w-full py-3 bg-tg-secondary-bg text-tg-text rounded-xl font-medium"
            >
              {t('verification.retake')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

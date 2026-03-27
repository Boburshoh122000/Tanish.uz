import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';
import { LIMITS } from '@tanish/shared';
import BottomSheet from './BottomSheet';

const FALLBACK_QUESTIONS = [
  'What project are you most excited about right now?',
  'What skill are you currently learning?',
  "What's something interesting you discovered recently?",
];

interface IntroSheetProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  receiverName: string;
  receiverPhoto?: string;
  receiverRole?: string | null;
  onSuccess: () => void;
}

export default function IntroSheet({
  isOpen,
  onClose,
  receiverId,
  receiverName,
  receiverPhoto,
  receiverRole,
  onSuccess,
}: IntroSheetProps) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setAnswer('');
    setError(null);
    setQuestion(null);
    setLoadingQuestion(true);
    fetchQuestion();
  }, [isOpen, receiverId]);

  async function fetchQuestion() {
    const res = await api.discovery.getQuestion(receiverId);
    if (res.success && res.data) {
      setQuestion(res.data.question);
    } else {
      // Fallback to a random client-side question
      setQuestion(FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)]);
    }
    setLoadingQuestion(false);
  }

  const handleSubmit = async () => {
    if (answer.length < LIMITS.INTRO_MIN_LENGTH || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await api.intros.create(receiverId, answer);
    if (res.success) {
      WebApp.HapticFeedback.notificationOccurred('success');
      onSuccess();
    } else {
      setError(res.error ?? t('common.error'));
    }
    setSubmitting(false);
  };

  const tooShort = answer.length > 0 && answer.length < LIMITS.INTRO_MIN_LENGTH;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('intros.question')}>
      {/* Profile mini */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-tg-secondary-bg overflow-hidden flex-shrink-0">
          {receiverPhoto ? (
            <img src={receiverPhoto} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
          )}
        </div>
        <div>
          <p className="font-semibold text-tg-text">{receiverName}</p>
          {receiverRole && <p className="text-xs text-tg-hint">{receiverRole}</p>}
        </div>
      </div>

      {/* Question */}
      <div className="bg-tg-secondary-bg rounded-xl p-4 text-center">
        <p className="text-xs text-tg-hint mb-1 uppercase">{t('intros.question')}</p>
        {loadingQuestion ? (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <p className="text-tg-text font-medium">💬 {question}</p>
        )}
      </div>

      {/* Answer input */}
      <div className="space-y-2">
        <textarea
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value.slice(0, LIMITS.INTRO_MAX_LENGTH));
            setError(null);
          }}
          placeholder={t('intros.answerPlaceholder')}
          className="input-field min-h-[100px] resize-none"
          maxLength={LIMITS.INTRO_MAX_LENGTH}
          rows={4}
          autoFocus
        />
        <div className="flex justify-between text-xs text-tg-hint">
          <span className={tooShort ? 'text-red-500' : ''}>
            {tooShort
              ? t('intro.answerTooShort', { count: LIMITS.INTRO_MIN_LENGTH - answer.length })
              : answer.length >= LIMITS.INTRO_MIN_LENGTH
                ? '✓'
                : ''}
          </span>
          <span>{answer.length}/{LIMITS.INTRO_MAX_LENGTH}</span>
        </div>
        {error && (
          <p className="text-red-500 text-xs">{error}</p>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={answer.length < LIMITS.INTRO_MIN_LENGTH || submitting || loadingQuestion}
        className="btn-primary flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {t('intro.sending')}
          </>
        ) : (
          <>👋 {t('intro.sendAnswer')}</>
        )}
      </button>

      <button onClick={onClose} className="w-full text-center text-tg-hint text-sm py-2">
        {t('common.cancel')}
      </button>
    </BottomSheet>
  );
}

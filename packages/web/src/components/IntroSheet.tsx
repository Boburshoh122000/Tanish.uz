import { useState } from 'react';
import { motion } from 'framer-motion';

interface IntroSheetProps {
  profile: any;
  onClose: () => void;
  onSubmit: (answer: string) => Promise<void>;
}

export default function IntroSheet({ profile, onClose, onSubmit }: IntroSheetProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (answer.length < 20) return;
    setSubmitting(true);
    try {
      await onSubmit(answer);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-40"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 bg-tg-bg rounded-t-3xl z-50 max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 20px)' }}
      >
        <div className="p-5 space-y-4">
          {/* Handle */}
          <div className="flex justify-center">
            <div className="w-10 h-1 bg-tg-hint/30 rounded-full" />
          </div>

          {/* Profile mini */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-tg-secondary-bg overflow-hidden">
              {profile.photos?.[0] ? (
                <img src={profile.photos[0].url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
              )}
            </div>
            <div>
              <p className="font-semibold text-tg-text">{profile.firstName}</p>
              <p className="text-xs text-tg-hint">{profile.currentRole}</p>
            </div>
          </div>

          {/* Question */}
          <div className="bg-tg-secondary-bg rounded-xl p-4 text-center">
            <p className="text-xs text-tg-hint mb-1">ICEBREAKER QUESTION</p>
            <p className="text-tg-text font-medium">
              💬 Tell {profile.firstName} something interesting about yourself
            </p>
          </div>

          {/* Answer input */}
          <div className="space-y-2">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
              placeholder="Write a thoughtful answer (min 20 characters)..."
              className="input-field min-h-[100px] resize-none"
              maxLength={500}
              rows={4}
              autoFocus
            />
            <div className="flex justify-between text-xs text-tg-hint">
              <span>{answer.length < 20 ? `${20 - answer.length} more characters needed` : '✓ Good to go'}</span>
              <span>{answer.length}/500</span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={answer.length < 20 || submitting}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>👋 Send intro</>
            )}
          </button>

          <button onClick={onClose} className="w-full text-center text-tg-hint text-sm py-2">
            Cancel
          </button>
        </div>
      </motion.div>
    </>
  );
}

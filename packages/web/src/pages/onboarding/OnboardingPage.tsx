import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import StepWho from '@/components/onboarding/StepWho';
import StepWhat from '@/components/onboarding/StepWhat';
import StepInterests from '@/components/onboarding/StepInterests';
import StepFinal from '@/components/onboarding/StepFinal';

const steps = [StepWho, StepWhat, StepInterests, StepFinal];

export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { onboardingStep, setOnboardingStep, onboardingData, setUser } = useAppStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Capture referral code from ?ref= query param (set by bot deep link)
  const refCode = useRef(searchParams.get('ref') ?? WebApp.initDataUnsafe?.start_param?.replace('ref_', '') ?? null);

  useEffect(() => {
    // Track onboarding start
    if (onboardingStep === 0) {
      // Event tracked on first render
    }
  }, []);

  useEffect(() => {
    if (onboardingStep > 0) {
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => {
        setOnboardingStep(Math.max(0, onboardingStep - 1));
      });
    } else {
      WebApp.BackButton.hide();
    }

    return () => {
      WebApp.BackButton.offClick(() => {});
    };
  }, [onboardingStep]);

  const handleNext = async () => {
    if (onboardingStep < steps.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      // Submit onboarding
      setIsSubmitting(true);
      try {
        const ref = refCode.current;
        const res = await api.onboarding.complete(onboardingData, ref) as any;
        if (res.success) {
          setUser(res.data);
          WebApp.HapticFeedback.impactOccurred('medium');
          navigate('/');
        } else {
          WebApp.showPopup({
            title: t('common.error'),
            message: res.error || t('common.error'),
            buttons: [{ type: 'ok' }],
          });
        }
      } catch {
        WebApp.showPopup({
          title: t('common.error'),
          message: t('common.retry'),
          buttons: [{ type: 'ok' }],
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const CurrentStep = steps[onboardingStep];

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 py-4">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === onboardingStep ? 'w-8 bg-tg-button' : i < onboardingStep ? 'w-2 bg-tg-button/60' : 'w-2 bg-tg-secondary-bg'
            }`}
          />
        ))}
      </div>

      {/* Step content with slide animation */}
      <div className="flex-1 px-5 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={onboardingStep}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <CurrentStep onNext={handleNext} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Continue button */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-tg-bg/95 backdrop-blur-sm"
           style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 20px)' }}>
        <button
          onClick={handleNext}
          disabled={isSubmitting}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : onboardingStep === steps.length - 1 ? (
            `🚀 ${t('onboarding.step4.getStarted')}`
          ) : (
            `${t('common.continue')} →`
          )}
        </button>
      </div>
    </div>
  );
}

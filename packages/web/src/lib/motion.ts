import type { Variants, Transition } from 'framer-motion';

// Shared easing — Apple-style ease-out
const ease = [0.25, 0.46, 0.45, 0.94] as const;

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 } as Transition,
};

export const slideUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.25, ease } as Transition,
};

export const slideInRight = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.25, ease } as Transition,
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.2, ease } as Transition,
};

export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease },
  },
};

export const tapScale = {
  whileTap: { scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
};

// Card swipe variants for discovery
export const swipeRight = {
  exit: { x: 400, rotate: 15, opacity: 0, transition: { duration: 0.35, ease } },
};

export const swipeLeft = {
  exit: { x: -400, rotate: -15, opacity: 0, transition: { duration: 0.35, ease } },
};

export const cardEntrance: Variants = {
  initial: { scale: 0.95, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.3, ease },
  },
};

// Bottom sheet / modal
export const bottomSheet = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring' as const, damping: 28, stiffness: 300 },
};

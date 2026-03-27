import { useState, useCallback, useEffect } from 'react';

interface Photo {
  id: string;
  url: string;
  position: number;
  verified?: boolean;
}

interface PhotoModalProps {
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
}

export default function PhotoModal({ photos, initialIndex = 0, onClose }: PhotoModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm text-white/70">
          {index + 1} / {photos.length}
          {photo.verified && <span className="ml-2 text-blue-400">✓ verified</span>}
        </span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white">
          ✕
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center px-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.url}
          alt={`Photo ${index + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>

      {/* Navigation */}
      {photos.length > 1 && (
        <div className="flex justify-center gap-6 py-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={prev}
            disabled={index === 0}
            className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-30"
          >
            ←
          </button>
          <button
            onClick={next}
            disabled={index === photos.length - 1}
            className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-30"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

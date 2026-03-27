import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '../../lib/api';

interface BlockedEntry {
  id: string;
  blockedUser: {
    id: string;
    firstName: string;
    photos: Array<{ url: string }>;
  };
}

export default function BlockedUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<BlockedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const goBack = () => navigate(-1);
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(goBack);
    return () => {
      WebApp.BackButton.hide();
      WebApp.BackButton.offClick(goBack);
    };
  }, [navigate]);

  useEffect(() => {
    loadBlocked();
  }, []);

  async function loadBlocked() {
    const res = (await api.blocks.list()) as { success: boolean; data?: BlockedEntry[] };
    if (res.success && res.data) {
      setBlocks(res.data);
    }
    setLoading(false);
  }

  const handleUnblock = async (blockId: string) => {
    await api.blocks.remove(blockId);
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('blocked.title')}</h1>
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
          <div className="w-16 h-16 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-tg-text mb-1">{t('blocked.empty')}</h2>
          <p className="text-sm text-tg-hint">{t('blocked.emptySubtitle')}</p>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {blocks.map((block) => (
            <div key={block.id} className="card p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-tg-secondary-bg overflow-hidden shrink-0">
                {block.blockedUser.photos?.[0] ? (
                  <img
                    src={block.blockedUser.photos[0].url}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-tg-hint">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
              </div>
              <span className="flex-1 text-sm font-medium text-tg-text truncate">
                {block.blockedUser.firstName}
              </span>
              <button
                onClick={() => handleUnblock(block.id)}
                className="text-sm text-tg-button font-medium px-3 py-1.5 rounded-lg bg-tg-secondary-bg"
              >
                {t('safety.unblock')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

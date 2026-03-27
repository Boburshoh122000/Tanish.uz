import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';
import AdminNav from './AdminNav';

export default function BroadcastPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [gender, setGender] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [result, setResult] = useState<{ delivered: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const goBack = () => navigate('/admin');
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(goBack);
    return () => { WebApp.BackButton.hide(); WebApp.BackButton.offClick(goBack); };
  }, [navigate]);

  const buildFilter = () => {
    const filter: { isPremium?: boolean; gender?: string } = {};
    if (premiumOnly) filter.isPremium = true;
    if (gender) filter.gender = gender;
    return Object.keys(filter).length > 0 ? filter : undefined;
  };

  const handlePreview = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    const res = await api.admin.broadcast({ text, confirm: false, filter: buildFilter() }) as any;
    setLoading(false);
    if (res.data?.recipientCount !== undefined) {
      setRecipientCount(res.data.recipientCount);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || recipientCount === null) return;

    WebApp.showPopup(
      {
        title: t('admin.confirmAction'),
        message: t('admin.broadcastConfirm', { count: recipientCount }),
        buttons: [
          { id: 'cancel', type: 'cancel' },
          { id: 'send', type: 'destructive', text: t('admin.send') },
        ],
      },
      async (btnId?: string) => {
        if (btnId !== 'send') return;
        setLoading(true);
        const res = await api.admin.broadcast({ text, confirm: true, filter: buildFilter() }) as any;
        setLoading(false);
        if (res.success && res.data) {
          setResult({ delivered: res.data.delivered, failed: res.data.failed });
          setRecipientCount(null);
        }
      }
    );
  };

  // Escape HTML for safe preview display
  const previewText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Re-allow only Telegram-supported tags
    .replace(/&lt;(\/?)b&gt;/g, '<$1b>')
    .replace(/&lt;(\/?)i&gt;/g, '<$1i>')
    .replace(/&lt;(\/?)u&gt;/g, '<$1u>')
    .replace(/&lt;(\/?)s&gt;/g, '<$1s>')
    .replace(/&lt;(\/?)code&gt;/g, '<$1code>')
    .replace(/&lt;a href=(['"])(.*?)\1&gt;/g, '<a href="$2" class="text-tg-button underline">')
    .replace(/&lt;\/a&gt;/g, '</a>');

  return (
    <div className="pb-24">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('admin.broadcast')}</h1>
      </div>

      <AdminNav />

      <div className="px-4 space-y-4">
        {/* Message input */}
        <div className="card p-4 space-y-3">
          <label className="text-xs font-semibold text-tg-section-header">{t('admin.broadcastMessage')}</label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setRecipientCount(null); setResult(null); }}
            rows={6}
            placeholder="<b>Bold</b>, <i>italic</i>, <a href='...'>links</a>"
            className="w-full px-3 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-sm resize-none placeholder:text-tg-hint outline-none"
          />
        </div>

        {/* Filters */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-tg-text">{t('admin.premiumOnly')}</span>
            <button
              onClick={() => { setPremiumOnly(!premiumOnly); setRecipientCount(null); }}
              className={`w-11 h-6 rounded-full transition-colors relative ${premiumOnly ? 'bg-tg-button' : 'bg-tg-hint/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${premiumOnly ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div>
            <label className="text-xs text-tg-hint">{t('admin.filterByStatus')}</label>
            <select
              value={gender}
              onChange={(e) => { setGender(e.target.value); setRecipientCount(null); }}
              className="w-full px-3 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-sm mt-1"
            >
              <option value="">{t('admin.allUsers')}</option>
              <option value="MALE">{t('admin.male')}</option>
              <option value="FEMALE">{t('admin.female')}</option>
            </select>
          </div>
        </div>

        {/* Preview */}
        {text.trim() && (
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-tg-section-header">{t('admin.broadcastPreview')}</h3>
            <div
              className="text-sm text-tg-text bg-tg-secondary-bg rounded-xl p-3"
              dangerouslySetInnerHTML={{ __html: previewText }}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {recipientCount === null ? (
            <button
              onClick={handlePreview}
              disabled={loading || !text.trim()}
              className="btn-secondary w-full py-2.5 text-sm"
            >
              {loading ? '...' : t('admin.broadcastPreview')}
            </button>
          ) : (
            <>
              <p className="text-center text-sm text-tg-text">
                {t('admin.broadcastSend', { count: recipientCount })}
              </p>
              <button
                onClick={handleSend}
                disabled={loading || recipientCount === 0}
                className="btn-primary w-full py-2.5 text-sm"
              >
                {loading ? '...' : t('admin.send')}
              </button>
            </>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="card p-4 text-center">
            <p className="text-sm text-tg-text">
              {t('admin.broadcastResult', { delivered: result.delivered, failed: result.failed })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

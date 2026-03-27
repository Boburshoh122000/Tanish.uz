import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';
import AdminNav from './AdminNav';

interface AdminUser {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  gender: string;
  status: string;
  isPremium: boolean;
  premiumUntil: string | null;
  verified: boolean;
  profileComplete: boolean;
  reportCount: number;
  createdAt: string;
  lastActiveAt: string;
  photoCount: number;
}

type ModalType = 'grant' | 'message' | null;

export default function UserManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [premiumFilter, setPremiumFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [grantDays, setGrantDays] = useState(30);
  const [grantReason, setGrantReason] = useState('');
  const [messageText, setMessageText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const goBack = () => navigate('/admin');
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(goBack);
    return () => { WebApp.BackButton.hide(); WebApp.BackButton.offClick(goBack); };
  }, [navigate]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.getUsers({
        page, limit: 20, search: search || undefined,
        status: statusFilter || undefined, isPremium: premiumFilter || undefined,
      }) as any;
      if (res.success && res.data) {
        setUsers(res.data.items);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, premiumFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleGrantPremium = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    const res = await api.admin.grantPremium(selectedUser.id, { durationDays: grantDays, reason: grantReason || undefined }) as any;
    setActionLoading(false);
    if (res.success) {
      WebApp.showPopup({ title: '✅', message: t('admin.premiumGranted', { days: grantDays }), buttons: [{ type: 'ok' }] });
      setModalType(null);
      loadUsers();
    }
  };

  const handleRevokePremium = async (user: AdminUser) => {
    setActionLoading(true);
    await api.admin.revokePremium(user.id);
    setActionLoading(false);
    WebApp.showPopup({ title: '✅', message: t('admin.premiumRevoked'), buttons: [{ type: 'ok' }] });
    loadUsers();
  };

  const handleSendMessage = async () => {
    if (!selectedUser || !messageText.trim()) return;
    setActionLoading(true);
    const res = await api.admin.sendMessage(selectedUser.id, messageText) as any;
    setActionLoading(false);
    if (res.success) {
      const msg = res.data?.delivered ? t('admin.messageSent') : t('admin.messageBlocked');
      WebApp.showPopup({ title: res.data?.delivered ? '✅' : '⚠️', message: msg, buttons: [{ type: 'ok' }] });
      setModalType(null);
      setMessageText('');
    }
  };

  const handleStatusChange = async (user: AdminUser, status: string) => {
    setActionLoading(true);
    await api.admin.updateUserStatus(user.id, status);
    setActionLoading(false);
    loadUsers();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="pb-24">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('admin.userManagement')}</h1>
      </div>

      <AdminNav />

      <div className="px-4 space-y-3">
        {/* Search */}
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('admin.searchUsers')}
          className="w-full px-3 py-2.5 rounded-xl bg-tg-secondary-bg text-tg-text text-sm placeholder:text-tg-hint outline-none"
        />

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="flex-1 px-2 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-xs"
          >
            <option value="">{t('admin.filterByStatus')}</option>
            <option value="ACTIVE">{t('admin.active')}</option>
            <option value="SUSPENDED">{t('admin.suspended')}</option>
            <option value="BANNED">{t('admin.banned')}</option>
          </select>
          <select
            value={premiumFilter}
            onChange={(e) => { setPremiumFilter(e.target.value); setPage(1); }}
            className="flex-1 px-2 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-xs"
          >
            <option value="">{t('admin.filterByPremium')}</option>
            <option value="true">{t('admin.premium')}</option>
            <option value="false">{t('admin.free')}</option>
          </select>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-tg-hint py-8">{t('admin.noUsersFound')}</p>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-tg-text">
                      {user.firstName} {user.lastName || ''}
                      {user.verified && <span className="ml-1 text-blue-500">✓</span>}
                    </p>
                    <p className="text-xs text-tg-hint">
                      {user.username ? `@${user.username}` : `ID: ${user.telegramId}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {user.isPremium && (
                      <span className="text-[10px] bg-yellow-400/20 text-yellow-600 px-1.5 py-0.5 rounded-full font-medium">⭐</span>
                    )}
                    <StatusBadge status={user.status} />
                  </div>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {!user.isPremium ? (
                    <ActionBtn label={t('admin.grantPremium')} onClick={() => { setSelectedUser(user); setModalType('grant'); }} />
                  ) : (
                    <ActionBtn label={t('admin.revokePremium')} variant="warn" onClick={() => handleRevokePremium(user)} disabled={actionLoading} />
                  )}
                  <ActionBtn label={t('admin.sendMessage')} onClick={() => { setSelectedUser(user); setModalType('message'); }} />
                  {user.status === 'ACTIVE' ? (
                    <ActionBtn label={t('admin.suspend')} variant="warn" onClick={() => handleStatusChange(user, 'SUSPENDED')} disabled={actionLoading} />
                  ) : user.status === 'SUSPENDED' ? (
                    <ActionBtn label={t('admin.unsuspend')} onClick={() => handleStatusChange(user, 'ACTIVE')} disabled={actionLoading} />
                  ) : null}
                  {user.status !== 'BANNED' && (
                    <ActionBtn label={t('admin.ban')} variant="danger" onClick={() => handleStatusChange(user, 'BANNED')} disabled={actionLoading} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-tg-button disabled:text-tg-hint">← Prev</button>
            <span className="text-xs text-tg-hint">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="text-sm text-tg-button disabled:text-tg-hint">Next →</button>
          </div>
        )}
      </div>

      {/* Grant Premium Modal */}
      {modalType === 'grant' && selectedUser && (
        <Modal onClose={() => setModalType(null)}>
          <h3 className="font-bold text-tg-text mb-3">{t('admin.grantPremium')}: {selectedUser.firstName}</h3>
          <label className="text-xs text-tg-hint">{t('admin.grantDuration')}</label>
          <select value={grantDays} onChange={(e) => setGrantDays(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-sm mb-2">
            <option value={7}>{t('admin.days', { count: 7 })}</option>
            <option value={30}>{t('admin.days', { count: 30 })}</option>
            <option value={90}>{t('admin.days', { count: 90 })}</option>
            <option value={365}>{t('admin.days', { count: 365 })}</option>
          </select>
          <label className="text-xs text-tg-hint">{t('admin.grantReason')}</label>
          <input value={grantReason} onChange={(e) => setGrantReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-sm mb-3" />
          <button onClick={handleGrantPremium} disabled={actionLoading} className="btn-primary w-full py-2.5 text-sm">
            {actionLoading ? '...' : t('admin.grantPremium')}
          </button>
        </Modal>
      )}

      {/* Send Message Modal */}
      {modalType === 'message' && selectedUser && (
        <Modal onClose={() => { setModalType(null); setMessageText(''); }}>
          <h3 className="font-bold text-tg-text mb-3">{t('admin.sendMessage')}: {selectedUser.firstName}</h3>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={t('admin.broadcastMessage')}
            rows={4}
            className="w-full px-3 py-2 rounded-xl bg-tg-secondary-bg text-tg-text text-sm mb-3 resize-none"
          />
          <button onClick={handleSendMessage} disabled={actionLoading || !messageText.trim()} className="btn-primary w-full py-2.5 text-sm">
            {actionLoading ? '...' : t('admin.send')}
          </button>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-700',
    SUSPENDED: 'bg-yellow-500/20 text-yellow-700',
    BANNED: 'bg-red-500/20 text-red-700',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[status] || 'bg-tg-secondary-bg text-tg-hint'}`}>
      {status}
    </span>
  );
}

function ActionBtn({ label, onClick, variant, disabled }: { label: string; onClick: () => void; variant?: 'warn' | 'danger'; disabled?: boolean }) {
  const base = 'text-[10px] px-2 py-1 rounded-lg font-medium transition-colors';
  const colors = variant === 'danger' ? 'bg-red-500/10 text-red-600' : variant === 'warn' ? 'bg-yellow-500/10 text-yellow-700' : 'bg-tg-button/10 text-tg-button';
  return <button onClick={onClick} disabled={disabled} className={`${base} ${colors} disabled:opacity-50`}>{label}</button>;
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-tg-bg rounded-t-2xl p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

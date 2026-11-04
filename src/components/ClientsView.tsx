import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useDocuments } from '../context/DocumentsContext';
import type { Client } from '../types';
import type { AppDocument } from '../types/documents';
import { formatHoursDecimal } from '../utils/dateUtils';
import { getCustomerFinancialOverview, formatCurrencyAmountGroups } from '../utils/customerBalanceUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CustomSelect } from './CustomSelect';
import { CustomerBalanceModal } from './clients/CustomerBalanceModal';
import { DocumentDetailsModal } from './documents/DocumentDetailsModal';
import { TimeBillingModal } from './documents/TimeBillingModal';
import { DocumentEditorModal } from './documents/DocumentEditorModal';
import { Users, Plus, Edit2, FolderKanban, Clock, X, Trash2, Coins } from 'lucide-react';

interface ClientsViewProps {
  initialAddOpen?: boolean;
  onAddModalClose?: () => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  initialAddOpen = false,
  onAddModalClose,
}) => {
  const { 
    clients, 
    projects, 
    entries, 
    activeTimer, 
    settings,
    addClient, 
    updateClient, 
    deleteClient, 
    getClientStats,
    routeParams,
    updateRouteParams,
  } = useApp();

  const { isClientReferencedInIssuedDocs, documents } = useDocuments();

  const isAddInUrl = routeParams.get('add') === '1' || routeParams.get('add') === 'true';
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddOpen || isAddInUrl);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [balanceModalClient, setBalanceModalClient] = useState<Client | null>(null);
  const [detailsDoc, setDetailsDoc] = useState<AppDocument | null>(null);
  const [billingClientId, setBillingClientId] = useState<string | null>(null);
  const [newDocClientId, setNewDocClientId] = useState<string | null>(null);

  // Client form fields:
  // 1. שם העסק / לקוח (Required)
  // 2. דוא״ל וכתובת (למשלוח מסמכים)
  // 3. מספר עוסק (Optional)
  // 4. תנאי תשלום (Optional) + פירוט תנאי התשלום כשאחר נבחר
  // 5. הסכמה למסמכים ממוחשבים (סעיף 18ב(ג))
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [paymentTermsCustom, setPaymentTermsCustom] = useState('');
  const [hasElectronicConsent, setHasElectronicConsent] = useState(false);
  const [consentReference, setConsentReference] = useState('');
  const [clientColor, setClientColor] = useState('#BC796F');
  const [error, setError] = useState('');

  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const PALETTE_COLORS = ['#C9877C', '#BC796F', '#A46A69', '#D49B90', '#E4AEA3', '#945853'];

  const openAdd = () => {
    setEditingClient(null);
    setClientName('');
    setClientEmail('');
    setClientAddress('');
    setBusinessNumber('');
    setPaymentTerms('');
    setPaymentTermsCustom('');
    setHasElectronicConsent(false);
    setConsentReference('');
    setClientColor('#BC796F');
    setError('');
    setIsAddModalOpen(true);
  };

  React.useEffect(() => {
    if (initialAddOpen || isAddInUrl) {
      openAdd();
    }
  }, [initialAddOpen, isAddInUrl]);

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setClientName(c.name);
    setClientEmail(c.email || '');
    setClientAddress(c.address || '');
    setBusinessNumber(c.businessNumber || '');
    setPaymentTerms(c.paymentTerms || '');
    setPaymentTermsCustom(c.paymentTermsCustom || '');
    setHasElectronicConsent(c.electronicConsent?.status === 'consented');
    setConsentReference(c.electronicConsent?.sourceReference || '');
    setClientColor(c.color || '#BC796F');
    setError('');
    setIsAddModalOpen(true);
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    updateRouteParams({ add: null }, true);
    onAddModalClose?.();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('יש להזין שם העסק / לקוח');
      return;
    }

    const electronicConsent = hasElectronicConsent ? {
      status: 'consented' as const,
      consentedAt: editingClient?.electronicConsent?.consentedAt || new Date().toISOString().split('T')[0],
      sourceReference: consentReference.trim() || 'הסכמת לקוח בכתב',
    } : editingClient?.electronicConsent?.status === 'consented' ? {
      status: 'withdrawn' as const,
      withdrawnAt: new Date().toISOString().split('T')[0],
      withdrawalReason: 'בוטלה הסכמה על ידי מנהל המערכת',
    } : undefined;

    if (editingClient) {
      updateClient({
        ...editingClient,
        name: clientName.trim(),
        email: clientEmail.trim() || undefined,
        address: clientAddress.trim() || undefined,
        color: clientColor,
        businessNumber: businessNumber.trim() || undefined,
        paymentTerms: paymentTerms || undefined,
        paymentTermsCustom: paymentTerms === 'אחר' ? paymentTermsCustom.trim() : undefined,
        electronicConsent,
      });
    } else {
      addClient(
        clientName.trim(), 
        clientColor,
        businessNumber.trim() || undefined,
        paymentTerms || undefined,
        paymentTerms === 'אחר' ? paymentTermsCustom.trim() : undefined,
        clientEmail.trim() || undefined,
        clientAddress.trim() || undefined,
        electronicConsent
      );
    }

    closeModal();
  };

  const isTimerRunningOnClient = clientToDelete 
    ? activeTimer?.isRunning && activeTimer.clientId === clientToDelete.id
    : false;

  const isClientReferenced = clientToDelete ? isClientReferencedInIssuedDocs(clientToDelete.id) : false;

  const clientStats = clientToDelete ? getClientStats(clientToDelete.id) : { projectCount: 0, entryCount: 0 };
  const displayedClients = clients.filter(c => !c.isArchived);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">ניהול לקוחות</h1>
          <p className="text-sm text-[#7D5A56] mt-1">רשימת הלקוחות והפרויקטים הפעילים במערכת</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>הוספת לקוח חדש</span>
        </button>
      </div>

      {/* Empty State */}
      {displayedClients.length === 0 ? (
        <div className="liquid-glass rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-3.5 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-white/40 border border-white/60 flex items-center justify-center text-[#BC796F]">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-bold text-warm-900 text-lg">עדיין אין לקוחות במערכת</h2>
            <p className="text-sm text-[#7D5A56] mt-1">
              הוסף את הלקוח הראשון שלך כדי להתחיל לנהל פרויקטים ומעקב שעות.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>הוספת לקוח</span>
          </button>
        </div>
      ) : (
        /* Clients Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedClients.map(client => {
            const clientProjects = projects.filter(p => p.clientId === client.id);
            const clientSeconds = entries
              .filter(e => e.clientId === client.id)
              .reduce((sum, e) => sum + e.durationSeconds, 0);

            return (
              <div
                key={client.id}
                className="liquid-glass rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between group hover:border-[#BC796F]/40 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs shrink-0"
                      style={{ backgroundColor: client.color || '#BC796F' }}
                    >
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-warm-900 text-base">{client.name}</h3>
                      <span className="text-xs text-[#7D5A56]">
                        נוצר ב-{new Date(client.createdAt).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(client)}
                      className="p-1.5 rounded-lg text-[#7D5A56] hover:text-warm-950 hover:bg-white/60 transition-colors"
                      title="עריכת פרטי לקוח"
                      aria-label={`עריכת לקוח ${client.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setClientToDelete(client)}
                      className="p-1.5 rounded-lg text-[#7D5A56] hover:text-red-700 hover:bg-red-50/50 transition-colors"
                      title="מחיקת לקוח"
                      aria-label={`מחיקת לקוח ${client.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Client Metadata: Business Number, Payment Terms, Email & Consent */}
                <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                  {client.businessNumber && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/50 border border-white/70 text-[#683F3B]">
                      <span className="font-medium text-[#7D5A56]">עוסק:</span>
                      <strong dir="ltr" className="font-semibold tabular-nums text-warm-950">
                        {client.businessNumber}
                      </strong>
                    </span>
                  )}

                  {client.email && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/50 border border-white/70 text-[#683F3B]">
                      <span className="font-medium text-[#7D5A56]">דוא״ל:</span>
                      <span dir="ltr" className="font-medium text-warm-950">
                        {client.email}
                      </span>
                    </span>
                  )}

                  {client.paymentTerms && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#BC796F]/12 border border-[#BC796F]/25 text-[#88463F]">
                      <span className="font-medium text-[#7D5A56]">תנאי תשלום:</span>
                      <strong className="font-semibold text-warm-950">
                        {client.paymentTerms === 'אחר' && client.paymentTermsCustom
                          ? client.paymentTermsCustom
                          : client.paymentTerms}
                      </strong>
                    </span>
                  )}

                  {client.electronicConsent?.status === 'consented' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 text-[11px] font-semibold" title={`אישור מסמכים ממוחשבים מיום ${client.electronicConsent.consentedAt || ''} (${client.electronicConsent.sourceReference || 'הסכמה בכתב'})`}>
                      <span>✓ מאושר למסמך ממוחשב</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[11px]" title="לפי סעיף 18ב, נדרשת הסכמת לקוח בכתב לפני משלוח מסמכים ממוחשבים בדוא״ל">
                      <span>ללא אישור ממוחשב</span>
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#BC796F]/15">
                  <div className="liquid-glass-subtle p-3 rounded-2xl flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs text-[#7D5A56] mb-1">
                      <FolderKanban className="w-3.5 h-3.5 text-[#BC796F]" />
                      <span>פרויקטים</span>
                    </div>
                    <span className="text-lg font-bold text-warm-950 tabular-nums">
                      {clientProjects.length}
                    </span>
                  </div>

                  <div className="liquid-glass-subtle p-3 rounded-2xl flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs text-[#7D5A56] mb-1">
                      <Clock className="w-3.5 h-3.5 text-[#BC796F]" />
                      <span>שעות שנרשמו</span>
                    </div>
                    <span className="text-lg font-bold text-warm-950 tabular-nums" dir="ltr">
                      {formatHoursDecimal(clientSeconds)}
                    </span>
                  </div>
                </div>

                {/* Financial Summary Strip */}
                {(() => {
                  const overview = getCustomerFinancialOverview(
                    client.id,
                    clients,
                    projects,
                    entries,
                    documents,
                    settings
                  );
                  return (
                    <div className="mt-3 pt-3 border-t border-[#BC796F]/15 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#7D5A56] font-medium">פתוח לתשלום:</span>
                        <span className={`font-bold tabular-nums ${overview.overduePaymentRequestsCount > 0 ? 'text-red-700' : 'text-warm-950'}`}>
                          {formatCurrencyAmountGroups(overview.openPaymentRequestsAmounts, settings.currency)}
                          {overview.overduePaymentRequestsCount > 0 && (
                            <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200">
                              באיחור
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#7D5A56]">
                        <span>שעות שלא חויבו:</span>
                        <span className="font-semibold text-[#88463F] tabular-nums">
                          {overview.unbilledHoursDecimal} שע׳ ({formatCurrencyAmountGroups(overview.unbilledEstimatedAmounts, settings.currency)})
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setBalanceModalClient(client)}
                        className="mt-1 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/10 hover:bg-[#BC796F]/20 border border-[#BC796F]/25 hover:border-[#BC796F]/45 transition-all shadow-xs active:scale-98"
                      >
                        <Coins className="w-3.5 h-3.5 text-[#BC796F]" />
                        <span>סקירה פיננסית מלאה</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Client Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={closeModal}
            className="fixed inset-0 bg-warm-950/30 backdrop-blur-md"
          />
          <div 
            role="dialog"
            aria-modal="true"
            dir="rtl"
            className="relative w-full max-w-md liquid-glass rounded-3xl shadow-2xl p-6 sm:p-7 z-10 border border-white/80"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#BC796F]/15 mb-4">
              <h3 className="font-bold text-warm-900 text-lg">
                {editingClient ? 'עריכת לקוח' : 'הוספת לקוח חדש'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-warm-700 hover:text-warm-950"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {error && (
                <div className="px-3 py-2 rounded-xl bg-red-500/10 text-red-700 text-xs">
                  {error}
                </div>
              )}

              {/* Field 1: שם העסק / לקוח */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-warm-800">
                  שם העסק / לקוח <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="לדוגמה: אמית טאץ׳ בע״מ"
                  autoFocus
                  className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input"
                />
              </div>

              {/* Field 2: דוא״ל וכתובת */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-warm-800">דוא״ל למסמכים</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input text-left"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-warm-800">כתובת</label>
                  <input
                    type="text"
                    value={clientAddress}
                    onChange={e => setClientAddress(e.target.value)}
                    placeholder="רחוב, עיר"
                    className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input"
                  />
                </div>
              </div>

              {/* Field 2b: מספר עוסק */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-warm-800">מספר עוסק</label>
                  <span className="text-[11px] text-[#7D5A56]">אופציונלי (ע.מ / ח.פ)</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={businessNumber}
                  onChange={e => setBusinessNumber(e.target.value)}
                  placeholder="051234567"
                  className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input text-right tabular-nums"
                />
              </div>

              {/* Field 3: תנאי תשלום */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-warm-800">תנאי תשלום</label>
                <CustomSelect
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  placeholder="בחירת תנאי תשלום"
                  options={[
                    { value: '', label: 'בחירת תנאי תשלום' },
                    { value: 'לתשלום מיידי', label: 'לתשלום מיידי' },
                    { value: 'שוטף', label: 'שוטף' },
                    { value: 'שוטף + 15', label: 'שוטף + 15' },
                    { value: 'שוטף + 30', label: 'שוטף + 30' },
                    { value: 'שוטף + 45', label: 'שוטף + 45' },
                    { value: 'שוטף + 60', label: 'שוטף + 60' },
                    { value: 'שוטף + 90', label: 'שוטף + 90' },
                    { value: 'אחר', label: 'אחר' },
                  ]}
                  triggerClassName="h-11 bg-white/70"
                />
              </div>

              {/* Field 3b: פירוט תנאי התשלום כשאחר נבחר */}
              {paymentTerms === 'אחר' && (
                <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                  <label className="text-xs font-semibold text-warm-800">פירוט תנאי התשלום</label>
                  <input
                    type="text"
                    value={paymentTermsCustom}
                    onChange={e => setPaymentTermsCustom(e.target.value)}
                    placeholder="לדוגמה: מקדמה 30%, יתרה במסירה"
                    className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input"
                  />
                </div>
              )}

              {/* Field 4: הסכמה למסמכים ממוחשבים בדוא״ל (סעיף 18ב(ג) להוראות מס הכנסה) */}
              <div className="p-3 rounded-2xl bg-white/40 border border-[#BC796F]/15 flex flex-col gap-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasElectronicConsent}
                    onChange={e => setHasElectronicConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-[#BC796F] focus:ring-[#BC796F] border-warm-300"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-warm-900">
                      אישור הלקוח למשלוח מסמכים ממוחשבים בדוא״ל
                    </span>
                    <span className="text-[11px] text-[#7D5A56] leading-relaxed">
                      נדרש לפי סעיף 18ב(ג) להוראות מס הכנסה (ניהול פנקסי חשבונות) לפני הפצה אלקטרונית של קבלות ומסמכים ממוחשבים.
                    </span>
                  </div>
                </label>

                {hasElectronicConsent && (
                  <div className="pt-2 border-t border-[#BC796F]/10 flex flex-col gap-1.5 animate-in fade-in">
                    <label className="text-[11px] font-semibold text-warm-800">
                      אסמכתת ההסכמה (מספר סעיף בהסכם / תאריך אישור במייל)
                    </label>
                    <input
                      type="text"
                      value={consentReference}
                      onChange={e => setConsentReference(e.target.value)}
                      placeholder="לדוגמה: הסכם התקשרות סעיף 12 מיום 01.10.2026"
                      className="w-full h-9 px-3 rounded-xl text-xs font-medium text-warm-900 liquid-glass-input"
                    />
                  </div>
                )}
              </div>

              {/* Field 5: גוון ייצוגי */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-warm-800">גוון ייצוגי</label>
                <div className="flex items-center gap-2.5">
                  {PALETTE_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setClientColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        clientColor === c ? 'scale-110 border-warm-950 shadow-sm' : 'border-white'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#BC796F]/15 mt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-warm-800 liquid-glass-btn-secondary"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white liquid-glass-btn-primary"
                >
                  שמירה
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Client */}
      {clientToDelete && (
        <DeleteConfirmModal
          isOpen={!!clientToDelete}
          onClose={() => setClientToDelete(null)}
          onConfirm={() => {
            if (isClientReferenced) {
              updateClient({ ...clientToDelete, isArchived: true });
            } else {
              deleteClient(clientToDelete.id);
            }
          }}
          title={isClientReferenced ? 'העברת לקוח לארכיון' : 'מחיקת לקוח'}
          itemName={clientToDelete.name}
          isBlocked={isTimerRunningOnClient}
          blockedMessage="לא ניתן למחוק לקוח זה מכיוון שפועל כרגע טיימר עבורו. יש לעצור את הטיימר תחילה."
          warningDetails={
            isClientReferenced
              ? 'לקוח זה משויך למסמכים רשמיים שהופקו. כדי לשמור על רצף תיעוד חשבונאי וחוקי, הלקוח יועבר לארכיון ויוסתר מהתפריטים השוטפים, והמסמכים ההיסטוריים יישמרו במלואם.'
              : (clientStats.projectCount > 0 || clientStats.entryCount > 0
                ? `ללקוח זה מקושרים ${clientStats.projectCount} פרויקטים ו-${clientStats.entryCount} דיווחי שעות. מחיקת הלקוח תמחק לצמיתות גם את כל הפרויקטים והדיווחים המקושרים אליו!`
                : 'הלקוח יימחק לצמיתות מהמערכת.')
          }
          confirmButtonText={isClientReferenced ? 'העבר לארכיון' : 'מחק לקוח'}
        />
      )}

      {/* Customer Financial Balance Modal */}
      {balanceModalClient && (
        <CustomerBalanceModal
          isOpen={!!balanceModalClient}
          onClose={() => setBalanceModalClient(null)}
          client={balanceModalClient}
          clients={clients}
          projects={projects}
          entries={entries}
          documents={documents}
          settings={settings}
          onOpenDocumentDetails={(doc) => setDetailsDoc(doc)}
          onOpenTimeBilling={(cId) => setBillingClientId(cId)}
          onOpenNewDocument={(cId) => setNewDocClientId(cId)}
        />
      )}

      {/* Document Details Modal */}
      {detailsDoc && (
        <DocumentDetailsModal
          isOpen={!!detailsDoc}
          onClose={() => setDetailsDoc(null)}
          document={detailsDoc}
        />
      )}

      {/* Time Billing Modal */}
      {billingClientId && (
        <TimeBillingModal
          isOpen={!!billingClientId}
          onClose={() => setBillingClientId(null)}
          initialClientId={billingClientId}
        />
      )}

      {/* Document Editor Modal for new document */}
      {newDocClientId && (
        <DocumentEditorModal
          isOpen={!!newDocClientId}
          onClose={() => setNewDocClientId(null)}
          initialClientId={newDocClientId}
          initialType="payment_request"
        />
      )}
    </div>
  );
};

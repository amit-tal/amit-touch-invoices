import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useDocuments } from '../../context/DocumentsContext';
import type { 
  AppDocument, 
  ReceiptPaymentMethod, 
  PaymentMethodType, 
  PaymentAllocation 
} from '../../types/documents';
import { CustomSelect } from '../CustomSelect';
import { CustomDatePicker } from '../CustomDatePicker';
import { formatCurrency, safeAdd, safeSubtract } from '../../utils/moneyUtils';
import { 
  X, 
  Receipt, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle 
} from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPaymentRequest?: AppDocument | null;
  initialClientId?: string;
  onReceiptIssued?: (receipt: AppDocument) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  targetPaymentRequest,
  initialClientId,
  onReceiptIssued,
}) => {
  const { clients, showToast } = useApp();
  const { 
    documents, 
    businessSettings, 
    isTestMode, 
    recordPaymentReceipt 
  } = useDocuments();

  const [clientId, setClientId] = useState<string>(() => {
    if (targetPaymentRequest) return targetPaymentRequest.clientId;
    if (initialClientId) return initialClientId;
    return clients[0]?.id || '';
  });

  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [description, setDescription] = useState<string>(() => {
    if (targetPaymentRequest) {
      return `תשלום בגין חשבון עסקה מס׳ ${targetPaymentRequest.documentNumber || targetPaymentRequest.id}`;
    }
    return 'תשלום עבור שירותי עיצוב';
  });

  // Client's unpaid or partially paid payment requests
  const clientPaymentRequests = useMemo(() => {
    return documents.filter(doc => 
      doc.type === 'payment_request' &&
      doc.clientId === clientId &&
      (doc.status === 'issued' || doc.status === 'partially_paid') &&
      doc.remainingBalance > 0
    );
  }, [documents, clientId]);

  // Initial requested amount
  const initialAmount = useMemo(() => {
    if (targetPaymentRequest) {
      return targetPaymentRequest.remainingBalance;
    }
    return clientPaymentRequests[0]?.remainingBalance || 0;
  }, [targetPaymentRequest, clientPaymentRequests]);

  const [totalAmount, setTotalAmount] = useState<number>(initialAmount);
  const [isPaperReceipt, setIsPaperReceipt] = useState<boolean>(false);

  // Payment Methods
  const [methods, setMethods] = useState<ReceiptPaymentMethod[]>([
    {
      id: 'method_' + Date.now(),
      type: 'bank_transfer',
      amount: initialAmount,
      bankName: businessSettings.bankDetails?.bankName || '',
      referenceNumber: '',
      isDirectTransferConfirmed: true,
    },
  ]);

  // Payment Request Allocations
  const [allocations, setAllocations] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (targetPaymentRequest) {
      map[targetPaymentRequest.id] = targetPaymentRequest.remainingBalance;
    } else if (clientPaymentRequests.length > 0) {
      map[clientPaymentRequests[0].id] = clientPaymentRequests[0].remainingBalance;
    }
    return map;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Total methods amount
  const methodsSum = useMemo(() => {
    return methods.reduce((acc, m) => safeAdd(acc, m.amount || 0), 0);
  }, [methods]);

  // Total allocated amount across invoices
  const totalAllocated = useMemo(() => {
    return Object.values(allocations).reduce((acc, val) => safeAdd(acc, val || 0), 0);
  }, [allocations]);

  // Excess credit (if total received > total allocated to invoices)
  const excessCredit = useMemo(() => {
    const diff = safeSubtract(totalAmount, totalAllocated);
    return diff > 0 ? diff : 0;
  }, [totalAmount, totalAllocated]);

  // Add a payment method split
  const handleAddMethod = () => {
    const remaining = safeSubtract(totalAmount, methodsSum);
    const newMethod: ReceiptPaymentMethod = {
      id: 'method_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      type: 'credit_card',
      amount: remaining > 0 ? remaining : 0,
      cardLast4: '',
      cardDealType: 'רגילה',
      transactionReference: '',
    };
    setMethods(prev => [...prev, newMethod]);
  };

  const handleUpdateMethod = (id: string, updates: Partial<ReceiptPaymentMethod>) => {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleRemoveMethod = (id: string) => {
    if (methods.length === 1) {
      showToast('חובה להזין לפחות אמצעי תשלום אחד');
      return;
    }
    setMethods(prev => prev.filter(m => m.id !== id));
  };

  // Handle allocation change for an invoice
  const handleAllocationChange = (reqId: string, val: number) => {
    setAllocations(prev => ({
      ...prev,
      [reqId]: val,
    }));
  };

  // Submit Receipt Issuance
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      setError('יש לבחור לקוח');
      return;
    }
    if (totalAmount <= 0) {
      setError('סכום התשלום חייב להיות גדול מ-0');
      return;
    }
    if (Math.abs(methodsSum - totalAmount) > 0.01) {
      setError(`סך אמצעי התשלום (${formatCurrency(methodsSum)}) חייב להיות שווה לסכום הכולל (${formatCurrency(totalAmount)})`);
      return;
    }

    // Format allocations array
    const allocArray: PaymentAllocation[] = Object.entries(allocations)
      .filter(([_, val]) => val > 0)
      .map(([reqId, val]) => ({
        paymentRequestId: reqId,
        allocatedAmount: val,
      }));

    setError('');
    setIsSubmitting(true);

    try {
      const receipt = await recordPaymentReceipt({
        paymentRequestId: targetPaymentRequest?.id,
        clientId,
        amount: totalAmount,
        paymentMethods: methods,
        paymentReceivedDate: paymentDate,
        description: description.trim() || 'קבלה על תשלום',
        allocations: allocArray,
        isPaperReceipt,
      });

      showToast(
        receipt.isTestMode
          ? `הופקה קבלת בדיקה ${receipt.documentNumber}`
          : `הופקה קבלה רשמית ${receipt.documentNumber}`
      );

      if (onReceiptIssued) onReceiptIssued(receipt);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'שגיאה בהפקת הקבלה');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-black/40 backdrop-blur-sm animate-fade-in font-heebo">
      <div 
        className="liquid-glass w-full max-w-2xl rounded-3xl shadow-2xl border border-white/60 flex flex-col max-h-[90vh] overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#BC796F]/15 flex items-center justify-between bg-white/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-warm-950">רישום תשלום והפקת קבלה</h2>
                {isTestMode && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    מצב בדיקה
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7D5A56] mt-0.5">
                הנפקת קבלה רשמית וסגירת יתרות חשבון עסקה
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-warm-600 hover:text-warm-900 hover:bg-white/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 scrollbar-none">
          {/* Client & Date & Total Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-white/40 border border-white/60">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">שם הלקוח *</label>
              <CustomSelect
                value={clientId}
                onChange={setClientId}
                disabled={!!targetPaymentRequest}
                options={clients.map(c => ({
                  value: c.id,
                  label: c.name,
                  badge: c.businessNumber ? `ע.מ ${c.businessNumber}` : undefined,
                }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">תאריך קבלת התשלום</label>
              <CustomDatePicker
                value={paymentDate}
                onChange={setPaymentDate}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">סך התשלום שהתקבל ({businessSettings.currency}) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                dir="ltr"
                value={totalAmount || ''}
                onChange={e => {
                  const val = Number(e.target.value) || 0;
                  setTotalAmount(val);
                  if (methods.length === 1) {
                    handleUpdateMethod(methods[0].id, { amount: val });
                  }
                }}
                className="w-full h-10 px-3.5 rounded-xl text-sm font-bold text-emerald-800 bg-white/70 border border-white/80 text-right tabular-nums focus:bg-white"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">תיאור הקבלה</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="עבור שירותי עיצוב..."
              className="w-full h-10 px-3.5 rounded-xl text-xs font-medium text-warm-900 liquid-glass-input"
            />
          </div>

          {/* Payment Methods (Splits) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-warm-900 flex items-center gap-1.5">
                <span>אמצעי תשלום ופיצול תשלומים</span>
                <span className="text-[11px] text-warm-500 font-normal">
                  (סך האמצעים: {formatCurrency(methodsSum, businessSettings.currency)})
                </span>
              </label>

              <button
                type="button"
                onClick={handleAddMethod}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#88463F] hover:bg-white/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>הוסף אמצעי תשלום</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {methods.map((method) => (
                <div 
                  key={method.id} 
                  className="p-3.5 rounded-2xl bg-white/50 border border-white/70 flex flex-col gap-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    {/* Method Type */}
                    <CustomSelect
                      value={method.type}
                      onChange={(val) => handleUpdateMethod(method.id, { 
                        type: val as PaymentMethodType,
                        ...(val === 'bank_transfer' ? { isDirectTransferConfirmed: true } : {})
                      })}
                      options={[
                        { value: 'bank_transfer', label: 'העברה בנקאית' },
                        { value: 'credit_card', label: 'כרטיס אשראי' },
                        { value: 'cash', label: 'מזומן' },
                        { value: 'check', label: 'צ׳ק' },
                        { value: 'other', label: 'אחר' },
                      ]}
                    />

                    {/* Amount */}
                    <div className="relative">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        dir="ltr"
                        placeholder="סכום"
                        value={method.amount || ''}
                        onChange={e => handleUpdateMethod(method.id, { amount: Number(e.target.value) || 0 })}
                        className="w-full h-10 px-3 rounded-xl text-xs font-bold text-warm-900 bg-white/80 border border-white/80 text-right tabular-nums"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-warm-500 pointer-events-none">
                        {businessSettings.currency}
                      </span>
                    </div>

                    {/* Delete button */}
                    <div className="flex items-center justify-end">
                      {methods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMethod(method.id)}
                          className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 transition-colors"
                          title="הסר אמצעי תשלום"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Contextual Sub-fields */}
                  {method.type === 'bank_transfer' && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/40">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="שם הבנק והסניף"
                          value={method.bankName || ''}
                          onChange={e => handleUpdateMethod(method.id, { bankName: e.target.value })}
                          className="h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80"
                        />
                        <input
                          type="text"
                          placeholder="מספר אסמכתא / העברה *"
                          value={method.referenceNumber || ''}
                          onChange={e => handleUpdateMethod(method.id, { referenceNumber: e.target.value })}
                          className="h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80 font-medium"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-[#7D5A56] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={method.isDirectTransferConfirmed !== false}
                          onChange={e => handleUpdateMethod(method.id, { isDirectTransferConfirmed: e.target.checked })}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-warm-300 cursor-pointer"
                        />
                        <span>אישור מתועד שהכספים הועברו ישירות מחשבון הלקוח לחשבון העסק (סעיף 18ב(ד))</span>
                      </label>
                    </div>
                  )}

                  {method.type === 'credit_card' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/40">
                      <div>
                        <input
                          type="text"
                          maxLength={4}
                          dir="ltr"
                          placeholder="4 ספרות אחרונות בלבד"
                          value={method.cardLast4 || ''}
                          onChange={e => handleUpdateMethod(method.id, { cardLast4: e.target.value.replace(/\D/g, '') })}
                          className="w-full h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80 text-center"
                        />
                        <span className="text-[10px] text-warm-500 block mt-0.5">ללא פרטי כרטיס מלאים</span>
                      </div>
                      <CustomSelect
                        value={method.cardDealType || 'רגילה'}
                        onChange={val => handleUpdateMethod(method.id, { cardDealType: val })}
                        options={[
                          { value: 'רגילה', label: 'עסקה רגילה' },
                          { value: 'תשלומים', label: 'תשלומים' },
                          { value: 'קרדיט', label: 'קרדיט' },
                        ]}
                        triggerClassName="h-8 bg-white/70 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="מספר אישור עסקה"
                        value={method.transactionReference || ''}
                        onChange={e => handleUpdateMethod(method.id, { transactionReference: e.target.value })}
                        className="h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80"
                      />
                    </div>
                  )}

                  {method.type === 'check' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/40">
                      <input
                        type="text"
                        placeholder="מספר צ׳ק"
                        value={method.checkNumber || ''}
                        onChange={e => handleUpdateMethod(method.id, { checkNumber: e.target.value })}
                        className="h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80"
                      />
                      <input
                        type="text"
                        placeholder="בנק וסניף"
                        value={method.checkBank || ''}
                        onChange={e => handleUpdateMethod(method.id, { checkBank: e.target.value })}
                        className="h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80"
                      />
                      <input
                        type="date"
                        value={method.checkMaturityDate || ''}
                        onChange={e => handleUpdateMethod(method.id, { checkMaturityDate: e.target.value })}
                        className="h-8 px-2.5 rounded-lg text-xs bg-white/70 text-warm-900 border border-white/80"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Allocation against open payment requests */}
          {clientPaymentRequests.length > 0 && (
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/40 border border-white/60">
              <label className="text-xs font-bold text-warm-900">
                שיוך התשלום לחשבונות עסקה פתוחים של הלקוח
              </label>

              <div className="flex flex-col gap-2">
                {clientPaymentRequests.map(req => {
                  const currentAlloc = allocations[req.id] || 0;
                  return (
                    <div 
                      key={req.id} 
                      className="p-3 rounded-xl bg-white/60 border border-white/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-warm-900">
                          חשבון עסקה מס׳ {req.documentNumber || req.id}
                        </span>
                        <span className="text-[11px] text-warm-600">
                          תאריך: {req.date} | סה״כ: {formatCurrency(req.totalAmount)} | יתרה לפירעון: <strong className="text-rose-700">{formatCurrency(req.remainingBalance)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-warm-500">סכום לשיוך:</span>
                        <input
                          type="number"
                          min="0"
                          max={req.remainingBalance}
                          step="0.01"
                          dir="ltr"
                          value={currentAlloc || ''}
                          onChange={e => handleAllocationChange(req.id, Number(e.target.value) || 0)}
                          className="w-24 h-8 px-2 rounded-lg text-xs font-bold text-emerald-800 bg-white border border-warm-200 text-right tabular-nums"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {excessCredit > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-800 text-xs flex items-center justify-between">
                  <span>עודף תשלום (יתרת זכות ללקוח):</span>
                  <span className="font-bold tabular-nums">+{formatCurrency(excessCredit, businessSettings.currency)}</span>
                </div>
              )}
            </div>
          )}

          {/* Paper receipt option */}
          <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/50 border border-white/80">
            <input
              type="checkbox"
              id="paperReceiptToggle"
              checked={isPaperReceipt}
              onChange={e => setIsPaperReceipt(e.target.checked)}
              className="w-4 h-4 rounded text-warm-700 focus:ring-warm-500 border-warm-300 cursor-pointer"
            />
            <label htmlFor="paperReceiptToggle" className="text-xs text-warm-900 cursor-pointer select-none">
              הפקת קבלה מודפסת (מסלול נייר ללא חתימה אלקטרונית)
            </label>
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-[#BC796F]/15 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/60 transition-colors"
            >
              ביטול
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isTestMode ? 'הפק קבלת בדיקה' : (isPaperReceipt ? 'הפק קבלה מודפסת (מסלול נייר)' : 'הפק קבלה אלקטרונית רשמית')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

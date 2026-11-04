export type PaymentTermsOption =
  | 'לתשלום מיידי'
  | 'שוטף'
  | 'שוטף + 15'
  | 'שוטף + 30'
  | 'שוטף + 45'
  | 'שוטף + 60'
  | 'שוטף + 90'
  | 'אחר';

export type ElectronicDeliveryConsentStatus = 'not_consented' | 'consented' | 'withdrawn';

export interface ElectronicDeliveryConsent {
  status: ElectronicDeliveryConsentStatus;
  consentedAt?: string; // YYYY-MM-DD
  sourceReference?: string; // e.g. "הסכם התקשרות סעיף 10", "אישור בכתב מיום..."
  withdrawnAt?: string;
  withdrawalReason?: string;
}

export interface Client {
  id: string;
  name: string; // שם העסק / לקוח
  color: string;
  businessNumber?: string; // מספר עוסק
  paymentTerms?: string; // תנאי תשלום
  paymentTermsCustom?: string; // פירוט תנאי התשלום כשאחר נבחר
  isArchived?: boolean;
  createdAt: string;
  email?: string;
  address?: string;
  phone?: string;
  contactPerson?: string;
  company?: string;
  notes?: string;
  electronicConsent?: ElectronicDeliveryConsent;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  icon: string;
  color: string;
  hourlyRate?: number; // תעריף שעתי
  budgetHours?: number; // לשמירה על תאימות נתוני עבר בלבד, לא בשימוש בממשק
  isArchived?: boolean;
  createdAt: string;
  description?: string;
}

export interface TimeEntry {
  id: string;
  clientId: string;
  projectId: string;
  task: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationSeconds: number;
  createdAt: string;
}

export interface ActiveTimer {
  clientId: string;
  projectId: string;
  task: string;
  startTimestamp: number; // Date.now() timestamp
  isRunning: boolean;
}

export interface TimerReminderSettings {
  enabled: boolean;
  thresholdHours: number; // default: 4 (4 continuous hours)
  browserNotificationsEnabled?: boolean;
}

export interface Settings {
  studioName: string;
  defaultHourlyRate: number;
  currency: string;
  timerReminder?: TimerReminderSettings;
}

export type ViewType = 'tracker' | 'projects' | 'clients' | 'reports' | 'documents' | 'settings';

export * from './documents';

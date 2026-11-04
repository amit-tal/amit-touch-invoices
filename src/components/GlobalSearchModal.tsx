import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useDocuments } from '../context/DocumentsContext';
import type { Client, Project, TimeEntry } from '../types';
import type { AppDocument } from '../types/documents';
import { formatCurrency, getDocumentTypeTitle, getStatusBadgeInfo } from '../utils/moneyUtils';
import { formatDurationHHMM } from '../utils/dateUtils';
import { 
  Search, 
  X, 
  Users, 
  FolderKanban, 
  FileText, 
  Clock, 
  CornerDownLeft,
  Building2
} from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDocument?: (doc: AppDocument) => void;
  onSelectEntry?: (entry: TimeEntry) => void;
}

type SearchResultItem = 
  | { type: 'client'; item: Client; key: string }
  | { type: 'project'; item: Project; clientName?: string; key: string }
  | { type: 'document'; item: AppDocument; key: string }
  | { type: 'entry'; item: TimeEntry; projectName?: string; clientName?: string; key: string };

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectDocument,
  onSelectEntry,
}) => {
  const { clients, projects, entries, setCurrentView } = useApp();
  const { documents } = useDocuments();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Clients lookup map
  const clientsMap = useMemo(() => {
    return new Map(clients.map(c => [c.id, c.name]));
  }, [clients]);

  // Projects lookup map
  const projectsMap = useMemo(() => {
    return new Map(projects.map(p => [p.id, p]));
  }, [projects]);

  // Grouped search results
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        clients: [] as Client[],
        projects: [] as (Project & { clientName?: string })[],
        documents: [] as AppDocument[],
        entries: [] as (TimeEntry & { projectName?: string; clientName?: string })[],
        totalCount: 0,
        flatList: [] as SearchResultItem[],
      };
    }

    // 1. Clients (exclude any archived if applicable)
    const matchedClients = clients.filter(c => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const emailMatch = c.email?.toLowerCase().includes(q);
      const phoneMatch = c.phone?.toLowerCase().includes(q);
      const notesMatch = c.notes?.toLowerCase().includes(q);
      return nameMatch || emailMatch || phoneMatch || notesMatch;
    }).slice(0, 5);

    // 2. Projects (exclude archived/deleted)
    const matchedProjects = projects.filter(p => {
      if (p.isArchived) return false;
      const cName = clientsMap.get(p.clientId) || '';
      const nameMatch = p.name?.toLowerCase().includes(q);
      const clientMatch = cName.toLowerCase().includes(q);
      const descMatch = p.description?.toLowerCase().includes(q);
      return nameMatch || clientMatch || descMatch;
    }).slice(0, 5).map(p => ({
      ...p,
      clientName: clientsMap.get(p.clientId),
    }));

    // 3. Documents (exclude canceled unless explicitly searched)
    const matchedDocuments = documents.filter(d => {
      const numMatch = (d.documentNumber || '').toLowerCase().includes(q);
      const clientMatch = (d.clientName || '').toLowerCase().includes(q);
      const projectMatch = (d.projectName || '').toLowerCase().includes(q);
      const typeMatch = getDocumentTypeTitle(d.type).toLowerCase().includes(q);
      const lineItemsMatch = d.lineItems.some(i => i.description.toLowerCase().includes(q));
      const refMatch = (d.customerRef || '').toLowerCase().includes(q);
      return numMatch || clientMatch || projectMatch || typeMatch || lineItemsMatch || refMatch;
    }).slice(0, 6);

    // 4. Time entries (exclude any deleted)
    const matchedEntries = entries.filter((e: TimeEntry) => {
      const proj = projectsMap.get(e.projectId);
      const pName = proj?.name || '';
      const cName = proj ? (clientsMap.get(proj.clientId) || '') : '';
      const taskMatch = (e.task || '').toLowerCase().includes(q);
      const projMatch = pName.toLowerCase().includes(q);
      const clientMatch = cName.toLowerCase().includes(q);
      return taskMatch || projMatch || clientMatch;
    }).slice(0, 6).map((e: TimeEntry) => {
      const proj = projectsMap.get(e.projectId);
      return {
        ...e,
        projectName: proj?.name,
        clientName: proj ? clientsMap.get(proj.clientId) : undefined,
      };
    });

    const flatList: SearchResultItem[] = [
      ...matchedClients.map((c: Client) => ({ type: 'client' as const, item: c, key: `client-${c.id}` })),
      ...matchedProjects.map(p => ({ type: 'project' as const, item: p, clientName: p.clientName, key: `project-${p.id}` })),
      ...matchedDocuments.map((d: AppDocument) => ({ type: 'document' as const, item: d, key: `doc-${d.id}` })),
      ...matchedEntries.map(e => ({ type: 'entry' as const, item: e, projectName: e.projectName, clientName: e.clientName, key: `entry-${e.id}` })),
    ];

    return {
      clients: matchedClients,
      projects: matchedProjects,
      documents: matchedDocuments,
      entries: matchedEntries,
      totalCount: flatList.length,
      flatList,
    };
  }, [query, clients, projects, documents, entries, clientsMap, projectsMap]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= results.flatList.length) {
      setSelectedIndex(Math.max(0, results.flatList.length - 1));
    }
  }, [results.flatList.length, selectedIndex]);

  // Handle action when an item is chosen
  const handleSelectItem = (result: SearchResultItem) => {
    onClose();

    if (result.type === 'client') {
      setCurrentView('clients');
    } else if (result.type === 'project') {
      setCurrentView('projects');
    } else if (result.type === 'document') {
      if (onSelectDocument) {
        onSelectDocument(result.item);
      } else {
        setCurrentView('documents');
      }
    } else if (result.type === 'entry') {
      if (onSelectEntry) {
        onSelectEntry(result.item);
      } else {
        setCurrentView('tracker');
      }
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, results.flatList.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.flatList.length) % Math.max(1, results.flatList.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.flatList[selectedIndex]) {
        handleSelectItem(results.flatList[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-3 bg-black/45 backdrop-blur-md animate-fade-in font-heebo"
      onClick={onClose}
    >
      <div 
        className="liquid-glass w-full max-w-2xl rounded-3xl shadow-2xl border border-white/70 overflow-hidden flex flex-col max-h-[82vh]"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-[#BC796F]/15 bg-white/70">
          <Search className="w-5 h-5 text-[#BC796F] shrink-0 mr-1" />
          
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="חיפוש לקוחות, פרויקטים, מסמכים או דיווחי שעות... (Ctrl+K)"
            className="w-full bg-transparent border-none text-sm sm:text-base font-medium text-warm-950 placeholder:text-warm-400 focus:outline-none focus:ring-0 px-3 text-right"
            dir="rtl"
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-warm-500 hover:text-warm-800 hover:bg-white/60 transition-colors"
              aria-label="נקה חיפוש"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-1 mr-2 text-[11px] font-mono text-warm-500 bg-white/60 px-2 py-0.5 rounded-lg border border-warm-200">
            <span>ESC</span>
          </div>
        </div>

        {/* Results List / Content */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 divide-y divide-white/40 space-y-3 scrollbar-none"
        >
          {/* Empty query initial state */}
          {!query.trim() && (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 text-warm-600">
              <div className="w-12 h-12 rounded-2xl bg-[#BC796F]/10 border border-[#BC796F]/20 flex items-center justify-center text-[#BC796F] mb-1">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-warm-900">חיפוש מהיר בכל רחבי המערכת</p>
              <p className="text-xs text-warm-500 max-w-sm">
                הקלידו שם לקוח, פרויקט, מספר מסמך, סכום, או תיאור משימה למציאה מיידית
              </p>
            </div>
          )}

          {/* No results state */}
          {query.trim() && results.totalCount === 0 && (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 text-warm-600">
              <div className="w-12 h-12 rounded-2xl bg-warm-100 flex items-center justify-center text-warm-400 mb-1">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-warm-900">לא נמצאו תוצאות עבור &quot;{query}&quot;</p>
              <p className="text-xs text-warm-500">נסו לחפש לפי מילת מפתח קצרה יותר או מספר מסמך</p>
            </div>
          )}

          {/* Group 1: Clients */}
          {results.clients.length > 0 && (
            <div className="pt-2 first:pt-0">
              <div className="flex items-center justify-between px-2 pb-1.5 text-xs font-bold text-[#88463F]">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#BC796F]" />
                  <span>לקוחות</span>
                </div>
                <span className="text-[10px] text-warm-500 font-normal">{results.clients.length} תוצאות</span>
              </div>

              <div className="flex flex-col gap-1">
                {results.clients.map(client => {
                  const flatIdx = results.flatList.findIndex(f => f.key === `client-${client.id}`);
                  const isSelected = selectedIndex === flatIdx;

                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => handleSelectItem({ type: 'client', item: client, key: `client-${client.id}` })}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={`flex items-center justify-between w-full p-2.5 rounded-2xl text-right transition-all ${
                        isSelected 
                          ? 'bg-white shadow-sm border border-[#BC796F]/30 text-warm-950' 
                          : 'hover:bg-white/50 text-warm-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#BC796F]/20 to-[#E4AEA3]/30 flex items-center justify-center text-[#BC796F] shrink-0 font-bold text-xs">
                          {client.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-warm-950">{client.name}</div>
                          <div className="text-[11px] text-warm-500 flex items-center gap-2">
                            {client.company && <span>{client.company}</span>}
                            {client.email && <span>{client.email}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[#BC796F] bg-[#FAF4F2] px-2 py-0.5 rounded-md border border-[#BC796F]/20">
                          כרטיס לקוח
                        </span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-[#BC796F]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 2: Projects */}
          {results.projects.length > 0 && (
            <div className="pt-2 first:pt-0">
              <div className="flex items-center justify-between px-2 pb-1.5 text-xs font-bold text-[#88463F]">
                <div className="flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5 text-[#BC796F]" />
                  <span>פרויקטים</span>
                </div>
                <span className="text-[10px] text-warm-500 font-normal">{results.projects.length} תוצאות</span>
              </div>

              <div className="flex flex-col gap-1">
                {results.projects.map(proj => {
                  const flatIdx = results.flatList.findIndex(f => f.key === `project-${proj.id}`);
                  const isSelected = selectedIndex === flatIdx;

                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => handleSelectItem({ type: 'project', item: proj, key: `project-${proj.id}` })}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={`flex items-center justify-between w-full p-2.5 rounded-2xl text-right transition-all ${
                        isSelected 
                          ? 'bg-white shadow-sm border border-[#BC796F]/30 text-warm-950' 
                          : 'hover:bg-white/50 text-warm-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3.5 h-3.5 rounded-full shrink-0" 
                          style={{ backgroundColor: proj.color || '#BC796F' }} 
                        />
                        <div>
                          <div className="text-xs font-bold text-warm-950">{proj.name}</div>
                          {proj.clientName && (
                            <div className="text-[11px] text-warm-500 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-warm-400" />
                              <span>{proj.clientName}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {proj.hourlyRate && (
                          <span className="text-[11px] font-bold text-warm-700 tabular-nums">
                            {formatCurrency(proj.hourlyRate, '₪')}/שעה
                          </span>
                        )}
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-[#BC796F]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 3: Documents */}
          {results.documents.length > 0 && (
            <div className="pt-2 first:pt-0">
              <div className="flex items-center justify-between px-2 pb-1.5 text-xs font-bold text-[#88463F]">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#BC796F]" />
                  <span>מסמכים</span>
                </div>
                <span className="text-[10px] text-warm-500 font-normal">{results.documents.length} תוצאות</span>
              </div>

              <div className="flex flex-col gap-1">
                {results.documents.map(doc => {
                  const flatIdx = results.flatList.findIndex(f => f.key === `doc-${doc.id}`);
                  const isSelected = selectedIndex === flatIdx;
                  const statusInfo = getStatusBadgeInfo(doc.status, doc.type);

                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectItem({ type: 'document', item: doc, key: `doc-${doc.id}` })}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={`flex items-center justify-between w-full p-2.5 rounded-2xl text-right transition-all ${
                        isSelected 
                          ? 'bg-white shadow-sm border border-[#BC796F]/30 text-warm-950' 
                          : 'hover:bg-white/50 text-warm-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-warm-100 flex items-center justify-center text-warm-700 shrink-0">
                          <FileText className="w-4 h-4 text-[#BC796F]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-warm-950">
                              {getDocumentTypeTitle(doc.type)}
                            </span>
                            {doc.documentNumber && (
                              <span className="text-xs font-bold text-[#88463F] tabular-nums" dir="ltr">
                                #{doc.documentNumber}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${statusInfo.bgClass} ${statusInfo.textClass}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-warm-500 flex items-center gap-2">
                            <span>{doc.clientName}</span>
                            <span>•</span>
                            <span className="tabular-nums">{doc.date}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-left font-bold text-xs text-warm-950 tabular-nums">
                          {formatCurrency(doc.totalAmount, doc.currency)}
                        </div>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-[#BC796F]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 4: Time Entries */}
          {results.entries.length > 0 && (
            <div className="pt-2 first:pt-0">
              <div className="flex items-center justify-between px-2 pb-1.5 text-xs font-bold text-[#88463F]">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#BC796F]" />
                  <span>דיווחי שעות</span>
                </div>
                <span className="text-[10px] text-warm-500 font-normal">{results.entries.length} תוצאות</span>
              </div>

              <div className="flex flex-col gap-1">
                {results.entries.map(entry => {
                  const flatIdx = results.flatList.findIndex(f => f.key === `entry-${entry.id}`);
                  const isSelected = selectedIndex === flatIdx;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelectItem({ type: 'entry', item: entry, key: `entry-${entry.id}` })}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={`flex items-center justify-between w-full p-2.5 rounded-2xl text-right transition-all ${
                        isSelected 
                          ? 'bg-white shadow-sm border border-[#BC796F]/30 text-warm-950' 
                          : 'hover:bg-white/50 text-warm-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/70 flex items-center justify-center text-[#BC796F] shrink-0 border border-warm-200/50">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-warm-950 line-clamp-1">
                            {entry.task || 'ללא תיאור'}
                          </div>
                          <div className="text-[11px] text-warm-500 flex items-center gap-2">
                            {entry.projectName && <span>{entry.projectName}</span>}
                            {entry.clientName && <span>({entry.clientName})</span>}
                            <span>•</span>
                            <span className="tabular-nums">{entry.date}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-warm-800 tabular-nums">
                          {formatDurationHHMM(entry.durationSeconds)}
                        </span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-[#BC796F]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="px-4 py-2.5 bg-white/60 border-t border-[#BC796F]/15 flex items-center justify-between text-[11px] text-warm-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-warm-200 font-mono text-[10px]">↑↓</kbd>
              ניווט
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-warm-200 font-mono text-[10px]">↵</kbd>
              פתיחה
            </span>
          </div>

          <span className="text-[10px] text-warm-400">AMIT TOUCH Global Search</span>
        </div>
      </div>
    </div>
  );
};

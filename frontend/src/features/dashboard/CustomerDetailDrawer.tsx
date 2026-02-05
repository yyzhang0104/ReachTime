/**
 * Customer Detail Drawer
 * Side panel for viewing/editing customer details and generating AI drafts
 * 
 * Features:
 * - Time confirmation with locking (once confirmed, won't recalculate)
 * - Editable draft with confirm finalization
 * - Avoids duplicate OpenAI calls by persisting draft
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, useFocusItem, useCustomer } from '@/store';
import type { ExtractedPreferences, FocusDraft } from '@/types';
import { getCustomerAvailability, getTimezoneOffsetLabel } from '@/services/availability';
import { pinyin } from 'pinyin-pro';
import {
  getNextAvailableWindowSync,
  getNextAvailableWindow,
  formatScheduledTime,
  setReminder,
  hashString,
  type ExtendedScheduleRecommendation,
  type UserWorkHoursConfig,
} from '@/services/scheduling';

/**
 * Parse "HH:mm" string to hour number
 */
function parseHourFromTimeString(timeStr: string): number {
  const [hourStr] = timeStr.split(':');
  return parseInt(hourStr, 10);
}

/**
 * Check if a string contains Chinese characters
 */
function containsChinese(str: string): boolean {
  return /[\u4e00-\u9fa5]/.test(str);
}

/**
 * Check if target language is Chinese
 */
function isChineseLanguage(lang: string): boolean {
  const lowerLang = lang.toLowerCase();
  return lowerLang.includes('chinese') || 
         lowerLang.includes('中文') || 
         lowerLang.includes('mandarin') ||
         lowerLang.includes('简体') ||
         lowerLang.includes('繁体');
}

/**
 * Convert Chinese name to pinyin with capitalization (for non-Chinese target languages)
 * Example: "明" -> "Ming"
 */
function convertToPinyinIfNeeded(name: string, targetLanguage: string): string {
  if (!containsChinese(name)) {
    return name; // Not Chinese, return as-is
  }
  
  if (isChineseLanguage(targetLanguage)) {
    return name; // Target is Chinese, keep Chinese characters
  }
  
  // Convert to pinyin with proper capitalization
  // pinyin-pro returns lowercase by default, we capitalize the first letter
  const pinyinResult = pinyin(name, { toneType: 'none', type: 'array' });
  // Capitalize first letter of each character's pinyin
  return pinyinResult.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
import { generateDraft, extractPreferences, ApiError } from '@/services/apiClient';
import { CustomerForm } from '@/features/customers/CustomerForm';
import { formatInTimeZone } from 'date-fns-tz';

/** Generate a unique draft ID */
const generateDraftId = () => Math.random().toString(36).substr(2, 9);

/** Get a display label for a draft (title > intent snippet > "Draft N") */
function getDraftLabel(draft: FocusDraft, index: number): string {
  if (draft.title) return draft.title;
  if (draft.intent) {
    const snippet = draft.intent.slice(0, 20);
    return snippet.length < draft.intent.length ? `${snippet}...` : snippet;
  }
  return `Draft ${index + 1}`;
}

interface CustomerDetailDrawerProps {
  customerId: string;
  onClose: () => void;
}

export const CustomerDetailDrawer: React.FC<CustomerDetailDrawerProps> = ({ customerId, onClose }) => {
  const { userProfile, updateFocusItem, addToFocus, setReminder: storeSetReminder, activeReminders } = useStore();
  const customer = useCustomer(customerId);
  const focusItem = useFocusItem(customerId);

  // If the customer was deleted while the drawer is open, close it.
  useEffect(() => {
    if (!customer) onClose();
  }, [customer, onClose]);

  if (!customer) return null;
  
  // =========== MULTI-DRAFT STATE ===========
  // Track which draft is currently active
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(
    focusItem?.activeDraftId
  );
  
  // Derive drafts array and active draft from focusItem
  const drafts = useMemo(() => focusItem?.drafts || [], [focusItem?.drafts]);
  const activeDraft = useMemo(
    () => drafts.find((d) => d.id === activeDraftId) || drafts[0] || null,
    [drafts, activeDraftId]
  );
  
  // Sync activeDraftId when focusItem changes (e.g., on initial load or after adding a draft)
  useEffect(() => {
    if (focusItem?.activeDraftId && focusItem.activeDraftId !== activeDraftId) {
      setActiveDraftId(focusItem.activeDraftId);
    } else if (!activeDraftId && drafts.length > 0) {
      setActiveDraftId(drafts[0].id);
    }
  }, [focusItem?.activeDraftId, drafts, activeDraftId]);
  
  // =========== FORM STATE (derived from active draft or defaults) ===========
  const primaryChannel = customer.channels.find((c) => c.isPrimary) || customer.channels[0];
  
  // Intent, language, channel for the draft form
  const [intent, setIntent] = useState(activeDraft?.intent || focusItem?.intent || '');
  const [targetLanguage, setTargetLanguage] = useState(activeDraft?.targetLanguage || 'Professional English');
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    activeDraft?.channelHandle 
      ? customer.channels.find(c => c.handle === activeDraft.channelHandle)?.id || primaryChannel?.id || ''
      : primaryChannel?.id || ''
  );
  
  // Draft content state (editable)
  const [draftSubject, setDraftSubject] = useState(activeDraft?.subject || '');
  const [draftContent, setDraftContent] = useState(activeDraft?.content || '');
  const [isDraftConfirmed, setIsDraftConfirmed] = useState(activeDraft?.isConfirmed || false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  
  // Track if we have a draft (with generated content)
  const hasDraft = !!(activeDraft?.subject || activeDraft?.content);
  
  // Sync local form state when active draft changes
  useEffect(() => {
    if (activeDraft) {
      setIntent(activeDraft.intent);
      setTargetLanguage(activeDraft.targetLanguage);
      setDraftSubject(activeDraft.subject);
      setDraftContent(activeDraft.content);
      setIsDraftConfirmed(activeDraft.isConfirmed);
      // Find channel by handle
      const matchedChannel = customer.channels.find(c => c.handle === activeDraft.channelHandle);
      if (matchedChannel) {
        setSelectedChannelId(matchedChannel.id);
      }
      
      // Deterministic edit mode rule:
      // - Unconfirmed draft with content → edit mode ON (show Confirm Draft)
      // - Confirmed draft → edit mode OFF (show Edit/Copy)
      const hasContent = !!(activeDraft.subject || activeDraft.content);
      if (hasContent && !activeDraft.isConfirmed) {
        setIsEditingDraft(true);
      } else {
        setIsEditingDraft(false);
      }
    } else {
      // No active draft - reset to defaults
      setIntent(focusItem?.intent || '');
      setTargetLanguage('Professional English');
      setDraftSubject('');
      setDraftContent('');
      setIsDraftConfirmed(false);
      setSelectedChannelId(primaryChannel?.id || '');
      setIsEditingDraft(false);
    }
    // Clear transient UI state when switching drafts
    setCopied(false);
    setError(null);
  }, [activeDraft?.id]); // Only run when active draft ID changes
  
  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  
  // Build user work hours config from profile
  const userWorkHoursConfig: UserWorkHoursConfig = {
    start: parseHourFromTimeString(userProfile.workHours.start),
    end: parseHourFromTimeString(userProfile.workHours.end),
  };
  
  // Scheduling state
  const [scheduleRec, setScheduleRec] = useState<ExtendedScheduleRecommendation>(
    () => getNextAvailableWindowSync(customer, userProfile.currentTimezone, userWorkHoursConfig)
  );
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);

  // Local extracted preferences (so we can use them even if the customer isn't in focus)
  const [extractedPrefs, setExtractedPrefs] = useState<ExtractedPreferences | null>(
    focusItem?.extractedPreferences ?? null
  );
  const [extractedPrefsHash, setExtractedPrefsHash] = useState<string>(
    focusItem?.crmNotesHash ?? ''
  );
  
  // Time confirmation state
  const isTimeConfirmed = focusItem?.isTimeConfirmed || false;
  const confirmedTime = focusItem?.confirmedScheduledTime 
    ? new Date(focusItem.confirmedScheduledTime)
    : null;
  
  // Custom send time state
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [customDateTime, setCustomDateTime] = useState<string>('');

  const availability = getCustomerAvailability(customer);
  const offset = getTimezoneOffsetLabel(customer.timezone);
  const hasReminder = activeReminders.has(customerId);
  
  // Determine the effective send time
  const effectiveSendTime = isTimeConfirmed && confirmedTime
    ? confirmedTime
    : customDateTime 
      ? new Date(customDateTime) 
      : scheduleRec.suggestedTime;
  const isCustomTime = !!customDateTime && !isTimeConfirmed;
  
  const selectedChannel =
    customer.channels.find((c) => c.id === selectedChannelId) || primaryChannel;

  const ensureFocusItem = useCallback(async () => {
    if (focusItem) return;
    await addToFocus(customerId, intent);
  }, [addToFocus, customerId, focusItem, intent]);

  // Load async schedule recommendation (only if time not confirmed)
  useEffect(() => {
    if (isTimeConfirmed) {
      setIsLoadingSchedule(false);
      return;
    }

    // If CRM notes exist and we haven't finished extracting preferences for this version yet,
    // wait briefly so we don't show a recommendation that ignores explicit avoid dates.
    if (customer.crmNotes) {
      const currentHash = hashString(customer.crmNotes);
      const hasFocusCache =
        focusItem?.crmNotesHash === currentHash && !!focusItem.extractedPreferences;
      const hasLocalCache = extractedPrefsHash === currentHash && !!extractedPrefs;
      if (!hasFocusCache && !hasLocalCache) {
        setIsLoadingSchedule(true);
        return;
      }
    }
    
    let cancelled = false;
    
    const loadSchedule = async () => {
      try {
        const prefsToUse = extractedPrefs ?? focusItem?.extractedPreferences ?? undefined;
        const rec = await getNextAvailableWindow(
          customer,
          userProfile.currentTimezone,
          prefsToUse,
          userWorkHoursConfig
        );
        if (!cancelled) {
          setScheduleRec(rec);
        }
      } catch (err) {
        console.error('Failed to load schedule:', err);
      } finally {
        if (!cancelled) {
          setIsLoadingSchedule(false);
        }
      }
    };
    
    loadSchedule();
    
    return () => { cancelled = true; };
  }, [customer, userProfile.currentTimezone, userProfile.workHours.start, userProfile.workHours.end, focusItem, extractedPrefs, isTimeConfirmed]);

  // Extract preferences from CRM notes if needed
  useEffect(() => {
    if (!customer.crmNotes) return;
    if (isTimeConfirmed) return; // Don't re-extract if time is confirmed
    
    const currentHash = hashString(customer.crmNotes);
    
    // Check if we need to extract preferences
    if (focusItem?.crmNotesHash === currentHash && focusItem.extractedPreferences) {
      setExtractedPrefs(focusItem.extractedPreferences);
      setExtractedPrefsHash(currentHash);
      return;
    }
    if (extractedPrefsHash === currentHash && extractedPrefs) {
      return;
    }
    
    const extractPrefs = async () => {
      try {
        const today = formatInTimeZone(new Date(), customer.timezone, 'yyyy-MM-dd');
        const prefs = await extractPreferences({
          crm_notes: customer.crmNotes,
          customer_country: customer.country,
          customer_timezone: customer.timezone,
          today_local_date: today,
        });

        setExtractedPrefs(prefs);
        setExtractedPrefsHash(currentHash);

        // If a focus item exists, persist the cache; otherwise keep local only.
        if (focusItem) {
          await updateFocusItem(customer.id, {
            extractedPreferences: prefs,
            crmNotesHash: currentHash,
            preferencesExtractedAt: Date.now(),
          });
        }
      } catch (err) {
        console.error('Failed to extract preferences:', err);
        // Mark this notes version as processed to avoid blocking scheduling forever.
        setExtractedPrefs(null);
        setExtractedPrefsHash(currentHash);
      }
    };
    
    extractPrefs();
  }, [
    customer.crmNotes,
    customer.id,
    customer.country,
    customer.timezone,
    focusItem,
    extractedPrefs,
    extractedPrefsHash,
    isTimeConfirmed,
    updateFocusItem,
  ]);

  // =========== MULTI-DRAFT HANDLERS ===========
  
  /** Add a new empty draft and switch to it */
  const handleAddDraft = async () => {
    await ensureFocusItem();
    const newDraftId = generateDraftId();
    const now = Date.now();
    const newDraft: FocusDraft = {
      id: newDraftId,
      intent: '',
      targetLanguage: 'Professional English',
      channelType: primaryChannel?.type || 'Email',
      channelHandle: primaryChannel?.handle,
      subject: '',
      content: '',
      isConfirmed: false,
      createdAt: now,
      updatedAt: now,
    };
    
    const updatedDrafts = [...drafts, newDraft];
    await updateFocusItem(customer.id, {
      drafts: updatedDrafts,
      activeDraftId: newDraftId,
    });
    setActiveDraftId(newDraftId);
  };
  
  /** Switch to a different draft */
  const handleSwitchDraft = async (draftId: string) => {
    if (draftId === activeDraftId) return;
    await ensureFocusItem();
    await updateFocusItem(customer.id, { activeDraftId: draftId });
    setActiveDraftId(draftId);
  };
  
  /** Open rename modal for active draft */
  const handleOpenRename = () => {
    setRenameValue(activeDraft?.title || '');
    setShowRenameModal(true);
  };
  
  /** Save renamed draft */
  const handleSaveRename = async () => {
    if (!activeDraft) return;
    const updatedDrafts = drafts.map((d) =>
      d.id === activeDraft.id ? { ...d, title: renameValue.trim() || undefined, updatedAt: Date.now() } : d
    );
    await updateFocusItem(customer.id, { drafts: updatedDrafts });
    setShowRenameModal(false);
  };
  
  /** Delete the active draft */
  const handleDeleteDraft = async () => {
    if (!activeDraft) return;
    const remainingDrafts = drafts.filter((d) => d.id !== activeDraft.id);
    const newActiveId = remainingDrafts.length > 0 ? remainingDrafts[0].id : undefined;
    await updateFocusItem(customer.id, {
      drafts: remainingDrafts,
      activeDraftId: newActiveId,
    });
    setActiveDraftId(newActiveId);
  };

  const handleGenerateDraft = async () => {
    if (!intent.trim()) {
      setError('Please enter your communication intent');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Convert Chinese first name to pinyin if target language is not Chinese
      const senderName = convertToPinyinIfNeeded(userProfile.firstName, targetLanguage);
      
      // For draft greeting, use customer first name only
      const customerFirstName = customer.firstName || customer.name || '';
      const channelType = selectedChannel?.type || 'Email';
      
      // For Email channel: if customer first name is Chinese and target language is non-Chinese, convert to pinyin
      let customerNameForDraft = customerFirstName;
      if (channelType === 'Email') {
        customerNameForDraft = convertToPinyinIfNeeded(customerFirstName, targetLanguage);
      }
      
      const result = await generateDraft({
        user_intent: intent,
        communication_channel: channelType,
        crm_notes: customer.crmNotes,
        target_language: targetLanguage,
        customer_name: customerNameForDraft,
        sender_name: senderName,
      });
      
      setDraftSubject(result.subject);
      setDraftContent(result.content);
      setIsEditingDraft(true); // Allow immediate editing
      setIsDraftConfirmed(false);
      
      // Ensure focus item exists
      await ensureFocusItem();
      
      // Create or update draft in drafts array
      const now = Date.now();
      const selectedChannelHandle = selectedChannel?.handle;
      
      if (activeDraft) {
        // Update existing draft
        const updatedDrafts = drafts.map((d) =>
          d.id === activeDraft.id
            ? {
                ...d,
                intent,
                targetLanguage,
                channelType,
                channelHandle: selectedChannelHandle,
                subject: result.subject,
                content: result.content,
                isConfirmed: false,
                confirmedAt: undefined,
                updatedAt: now,
              }
            : d
        );
        await updateFocusItem(customer.id, { drafts: updatedDrafts, intent });
      } else {
        // Create new draft
        const newDraftId = generateDraftId();
        const newDraft: FocusDraft = {
          id: newDraftId,
          intent,
          targetLanguage,
          channelType,
          channelHandle: selectedChannelHandle,
          subject: result.subject,
          content: result.content,
          isConfirmed: false,
          createdAt: now,
          updatedAt: now,
        };
        await updateFocusItem(customer.id, {
          drafts: [...drafts, newDraft],
          activeDraftId: newDraftId,
          intent,
        });
        setActiveDraftId(newDraftId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to generate draft. Please check your connection.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!activeDraft) return;
    await ensureFocusItem();
    
    // Update the active draft as confirmed
    const now = Date.now();
    const updatedDrafts = drafts.map((d) =>
      d.id === activeDraft.id
        ? {
            ...d,
            subject: draftSubject,
            content: draftContent,
            isConfirmed: true,
            confirmedAt: now,
            updatedAt: now,
          }
        : d
    );
    await updateFocusItem(customer.id, { drafts: updatedDrafts });
    setIsDraftConfirmed(true);
    setIsEditingDraft(false);
  };

  const handleCopy = () => {
    if (draftSubject && draftContent) {
      navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftContent}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmSendTime = async () => {
    await ensureFocusItem();
    // Lock the send time - it won't be recalculated anymore
    await updateFocusItem(customer.id, {
      isTimeConfirmed: true,
      confirmedScheduledTime: effectiveSendTime.getTime(),
      confirmedAt: Date.now(),
      scheduledTime: effectiveSendTime.getTime(),
    });
    setIsEditingTime(false);
  };

  const handleUnconfirmSendTime = async () => {
    await ensureFocusItem();
    // Unlock the send time for recalculation
    await updateFocusItem(customer.id, {
      isTimeConfirmed: false,
      confirmedScheduledTime: undefined,
      confirmedAt: undefined,
    });
  };

  const handleSetReminder = () => {
    // Reminders are persisted on focus items; ensure it's present
    ensureFocusItem().catch(console.error);
    const cancel = setReminder(
      effectiveSendTime,
      customer.name,
      intent,
      () => {
        // Reminder triggered
        updateFocusItem(customer.id, { reminderSet: false });
      }
    );
    storeSetReminder(customer.id, cancel);
    updateFocusItem(customer.id, {
      scheduledTime: effectiveSendTime.getTime(),
      reminderSet: true,
    });
  };

  // Start editing the send time
  const handleStartEditTime = () => {
    const date = effectiveSendTime;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    setCustomDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    setIsEditingTime(true);
  };

  // Cancel time editing
  const handleCancelEditTime = () => {
    setCustomDateTime('');
    setIsEditingTime(false);
  };

  const statusColors = {
    AVAILABLE: 'text-emerald-600 bg-emerald-50',
    UNAVAILABLE: 'text-slate-600 bg-slate-100',
    HOLIDAY: 'text-amber-600 bg-amber-50',
  };

  const statusLabels = {
    AVAILABLE: 'Available',
    UNAVAILABLE: 'Unavailable',
    HOLIDAY: 'Holiday',
  };

  if (showEditForm) {
    return <CustomerForm customer={customer} onClose={() => setShowEditForm(false)} />;
  }

  const formattedTime = formatScheduledTime(
    effectiveSendTime,
    userProfile.currentTimezone,
    customer.timezone
  );
  const showScheduleLoading = isLoadingSchedule && !isTimeConfirmed;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-amber-700 font-bold text-xl">
              {customer.name[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{customer.name}</h2>
              <p className="text-sm text-slate-500">{customer.company}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditForm(true)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Edit Contact"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status & Time Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Local Time</div>
              <div className="text-2xl font-mono font-bold text-slate-800">{availability.localTime}</div>
              <div className="text-xs text-slate-500">{availability.localDate} • {offset}</div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Status</div>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${statusColors[availability.status]}`}>
                <div className={`w-2 h-2 rounded-full ${availability.status === 'AVAILABLE' ? 'bg-emerald-500' : availability.status === 'UNAVAILABLE' ? 'bg-slate-400' : 'bg-amber-500'}`} />
                {statusLabels[availability.status]}
              </div>
              <div className="text-xs text-slate-500 mt-1">{availability.reason}</div>
            </div>
          </div>

          {/* Contact Channels */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Contact Channels</div>
            <div className="space-y-2">
              {customer.channels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-100 text-amber-700">
                    {channel.type}
                  </span>
                  <span className="text-sm text-slate-700">{channel.handle}</span>
                  {channel.isPrimary && (
                    <span className="text-xs text-slate-400">Primary</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CRM Notes */}
          {customer.crmNotes && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">CRM Notes</div>
              <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-700 italic">
                "{customer.crmNotes}"
              </div>
            </div>
          )}

          {/* Scheduling Recommendation */}
          <div className={`p-4 rounded-xl border ${
            isTimeConfirmed
              ? 'bg-emerald-50 border-emerald-200'
              : scheduleRec.isWeekend && !isCustomTime 
                ? 'bg-amber-50 border-amber-200' 
                : 'bg-slate-50 border-slate-200'
          }`}>
            {/* Confirmed Time Banner */}
            {isTimeConfirmed && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-emerald-200">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-emerald-700">
                  Send Time Confirmed
                </span>
                <button
                  onClick={handleUnconfirmSendTime}
                  className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 underline"
                >
                  Change
                </button>
              </div>
            )}
            
            {/* Weekend Warning Banner */}
            {!isTimeConfirmed && scheduleRec.isWeekend && !isCustomTime && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-200">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-semibold text-amber-700">
                  Today is weekend for this customer
                </span>
              </div>
            )}
            
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className={`text-xs font-bold uppercase mb-1 ${
                  isTimeConfirmed
                    ? 'text-emerald-600'
                    : scheduleRec.isWeekend && !isCustomTime 
                      ? 'text-amber-600' 
                      : 'text-slate-600'
                }`}>
                  {isTimeConfirmed 
                    ? 'Confirmed Send Time'
                    : isCustomTime 
                      ? 'Custom Send Time'
                      : scheduleRec.isWeekend 
                        ? `Next Business Day${scheduleRec.nextBusinessDay ? ` (${scheduleRec.nextBusinessDay})` : ''}`
                        : scheduleRec.isOptimal 
                          ? 'Optimal Send Time' 
                          : 'Suggested Send Time'}
                </div>
                
                {isEditingTime && !isTimeConfirmed ? (
                  // Edit mode: show datetime input
                  <div className="space-y-2">
                    <input
                      type="datetime-local"
                      value={customDateTime}
                      onChange={(e) => setCustomDateTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmSendTime}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        Confirm Time
                      </button>
                      <button
                        onClick={handleCancelEditTime}
                        className="px-3 py-1.5 bg-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display mode: show time with edit button
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold text-slate-800">
                      {showScheduleLoading ? 'Analyzing…' : `${formattedTime.userDateTime} your time`}
                    </div>
                    {!isTimeConfirmed && (
                      <button
                        onClick={handleStartEditTime}
                        className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                        title="Edit send time"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                
                {!isEditingTime && (
                  <div className="text-xs text-slate-500 mt-1">
                    {showScheduleLoading
                      ? 'Analyzing CRM notes and constraints…'
                      : `${formattedTime.customerDateTime} customer time`}
                  </div>
                )}
              </div>
              
              {!isEditingTime && !isTimeConfirmed && (
                <button
                  onClick={handleConfirmSendTime}
                  disabled={showScheduleLoading}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    showScheduleLoading
                      ? 'bg-emerald-200 text-emerald-700 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  Confirm Time
                </button>
              )}
              
              {isTimeConfirmed && !hasReminder && (
                <button
                  onClick={handleSetReminder}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Set Reminder
                </button>
              )}
              
              {isTimeConfirmed && hasReminder && (
                <div className="px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-200 text-emerald-700">
                  ⏰ Reminder Set
                </div>
              )}
            </div>
          </div>

          {/* AI Draft Section */}
          <div className="border-t border-slate-100 pt-6">
            {/* Header with Add Draft button */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {hasDraft ? (isDraftConfirmed ? 'Confirmed Draft' : 'Draft Preview') : 'Generate AI Draft'}
              </h3>
              {drafts.length > 0 && (
                <button
                  onClick={handleAddDraft}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add another draft
                </button>
              )}
            </div>
            
            {/* Draft Tabs/List - only show if multiple drafts or one draft with content */}
            {drafts.length > 0 && (
              <div className="mb-4">
                <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-100">
                  {drafts.map((draft, index) => (
                    <div
                      key={draft.id}
                      className={`group flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                        draft.id === activeDraftId
                          ? 'bg-amber-100 text-amber-800 font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <button
                        onClick={() => handleSwitchDraft(draft.id)}
                        className="flex items-center gap-1"
                      >
                        {draft.isConfirmed && (
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className="max-w-[120px] truncate">{getDraftLabel(draft, index)}</span>
                      </button>
                      
                      {/* Rename/Delete actions - show on hover or when active */}
                      {draft.id === activeDraftId && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            onClick={handleOpenRename}
                            className="p-1 text-slate-400 hover:text-amber-700 rounded transition-colors"
                            title="Rename draft"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {drafts.length > 1 && (
                            <button
                              onClick={handleDeleteDraft}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                              title="Delete draft"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Rename Modal */}
            <AnimatePresence>
              {showRenameModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
                  onClick={() => setShowRenameModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl"
                  >
                    <h4 className="text-lg font-bold text-slate-800 mb-4">Rename Draft</h4>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder="Enter draft name..."
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none mb-4"
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveRename}
                        className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowRenameModal(false)}
                        className="flex-1 py-2 border-2 border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {!hasDraft ? (
              // No draft yet - show generation form
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Communication Intent *
                  </label>
                  <textarea
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="e.g. Follow up on product sample, ask for feedback on logistics..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none h-24"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Target Language Style
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option>Professional English</option>
                    <option>British English</option>
                    <option>US English</option>
                    <option>简体中文</option>
                    <option>日本語</option>
                    <option>한국어</option>
                    <option>Español</option>
                    <option>Deutsch</option>
                    <option>Français</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Communication Channel
                  </label>
                  <select
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    {customer.channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.type}{ch.isPrimary ? ' (Primary)' : ''} — {ch.handle}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleGenerateDraft}
                  disabled={isGenerating}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                      </svg>
                      Generate Draft
                    </>
                  )}
                </button>
              </div>
            ) : (
              // Has draft - show editable or confirmed view
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Subject */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Subject</div>
                  {isEditingDraft ? (
                    <input
                      type="text"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-semibold"
                    />
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl text-slate-800 font-semibold">
                      {draftSubject}
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Content</div>
                  {isEditingDraft ? (
                    <textarea
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      className="w-full p-4 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none h-48"
                    />
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {draftContent}
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex flex-col gap-3">
                  {isEditingDraft ? (
                    // Editing mode: Confirm + Cancel
                    <div className="flex gap-3">
                      <button
                        onClick={handleConfirmDraft}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors"
                      >
                        Confirm Draft
                      </button>
                      <button
                        onClick={() => {
                          // Reset to saved version from active draft
                          setDraftSubject(activeDraft?.subject || '');
                          setDraftContent(activeDraft?.content || '');
                          setIsEditingDraft(false);
                        }}
                        className="py-3 px-4 border-2 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    // Preview mode: Edit + Copy (+ Confirm if unconfirmed)
                    <>
                      {/* Show Confirm button prominently if draft is not yet confirmed */}
                      {!isDraftConfirmed && (
                        <button
                          onClick={handleConfirmDraft}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors"
                        >
                          Confirm Draft
                        </button>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setIsEditingDraft(true)}
                          className="flex-1 py-3 border-2 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-colors"
                        >
                          Edit Draft
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

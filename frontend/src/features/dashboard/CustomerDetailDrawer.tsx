/**
 * Customer Detail Drawer
 * Side panel for viewing/editing customer details and generating AI drafts
 * 
 * Features:
 * - Time confirmation with locking (once confirmed, won't recalculate)
 * - Editable draft with confirm finalization
 * - Avoids duplicate OpenAI calls by persisting draft
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStore, useFocusItem, useCustomer } from '@/store';
import type { ExtractedPreferences } from '@/types';
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
  
  // Intent state
  const [intent, setIntent] = useState(focusItem?.intent || '');
  const [targetLanguage, setTargetLanguage] = useState('Professional English');
  const primaryChannel = customer.channels.find((c) => c.isPrimary) || customer.channels[0];
  const [selectedChannelId, setSelectedChannelId] = useState<string>(primaryChannel?.id || '');
  
  // Draft state - support editing
  const [draftSubject, setDraftSubject] = useState(focusItem?.draftSubject || '');
  const [draftContent, setDraftContent] = useState(focusItem?.draftContent || '');
  const [hasDraft, setHasDraft] = useState(!!focusItem?.draftSubject);
  const [isDraftConfirmed, setIsDraftConfirmed] = useState(focusItem?.isDraftConfirmed || false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  
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
      
      const result = await generateDraft({
        user_intent: intent,
        communication_channel: selectedChannel?.type || 'Email',
        crm_notes: customer.crmNotes,
        target_language: targetLanguage,
        customer_name: customer.name,
        sender_name: senderName,
      });
      
      setDraftSubject(result.subject);
      setDraftContent(result.content);
      setHasDraft(true);
      setIsEditingDraft(true); // Allow immediate editing
      setIsDraftConfirmed(false);
      
      // Save intent and draft to focus item
      const updates = {
        intent,
        draftSubject: result.subject,
        draftContent: result.content,
        isDraftConfirmed: false,
      };
      
      if (focusItem) {
        await updateFocusItem(customer.id, updates);
      } else {
        await addToFocus(customer.id, intent);
        // Update with draft after adding
        await updateFocusItem(customer.id, updates);
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
    await ensureFocusItem();
    // Save the edited draft as finalized
    await updateFocusItem(customer.id, {
      draftSubject,
      draftContent,
      isDraftConfirmed: true,
      draftConfirmedAt: Date.now(),
    });
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
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {hasDraft ? (isDraftConfirmed ? 'Confirmed Draft' : 'Draft Preview') : 'Generate AI Draft'}
            </h3>
            
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
                <div className="flex gap-3">
                  {isEditingDraft ? (
                    <>
                      <button
                        onClick={handleConfirmDraft}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors"
                      >
                        Confirm Draft
                      </button>
                      <button
                        onClick={() => {
                          // Reset to saved version
                          setDraftSubject(focusItem?.draftSubject || '');
                          setDraftContent(focusItem?.draftContent || '');
                          setIsEditingDraft(false);
                        }}
                        className="py-3 px-4 border-2 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
                
                {/* Regenerate option */}
                {!isEditingDraft && (
                  <button
                    onClick={() => {
                      setHasDraft(false);
                      setDraftSubject('');
                      setDraftContent('');
                      setIsDraftConfirmed(false);
                    }}
                    className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Generate new draft with different intent
                  </button>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

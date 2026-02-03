/**
 * Scheduling Service
 * Calculates optimal send times based on:
 * 1. Customer work time + weekends + holidays (hard constraint)
 * 2. Customer preferences: preferredHours > LLM extracted preferences
 * 3. User work time priority (09:00-18:00), with friendly ordering for non-overlap
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { setHours, setMinutes, startOfDay, addDays, addMinutes } from 'date-fns';
import type { Customer, ScheduleRecommendation, ExtractedPreferences, Weekday } from '@/types';
import { getHolidayStatus } from '@/services/apiClient';

// Default working hours (customer and user)
const DEFAULT_WORK_START = 9;
const DEFAULT_WORK_END = 18;

// User work hours (fixed for MVP)
const USER_WORK_START = 9;
const USER_WORK_END = 18;

// Weekend days (0 = Sunday, 6 = Saturday)
const WEEKEND_DAYS = [0, 6];

// Optimal send buffer (don't schedule too close to current time)
const MIN_BUFFER_MINUTES = 15;

// Maximum days to look ahead for scheduling
const MAX_LOOKAHEAD_DAYS = 14;

// Day of week mapping for ExtractedPreferences
const WEEKDAY_MAP: Record<Weekday, number> = {
  'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6
};

/**
 * Extended schedule recommendation with additional context
 */
export interface ExtendedScheduleRecommendation extends ScheduleRecommendation {
  isWeekend: boolean;
  isHoliday: boolean;
  nextBusinessDay?: string;
  isUserWorkTime: boolean;      // Whether suggested time is in user's work hours
  userFriendlinessScore: number; // 0-4: higher = more friendly to user
}

/**
 * Parse time string "HH:MM" to hour and minute
 */
function parseTimeString(timeStr: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = timeStr.split(':');
  return {
    hour: parseInt(hourStr, 10),
    minute: parseInt(minuteStr, 10),
  };
}

/**
 * Get day of week from a Date in a specific timezone
 */
function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  const dayStr = formatInTimeZone(date, timezone, 'i'); // 1-7 (Mon-Sun)
  return parseInt(dayStr, 10) % 7; // Convert to 0-6 (Sun-Sat)
}

/**
 * Get hour in a specific timezone
 */
function getHourInTimezone(date: Date, timezone: string): number {
  const hourStr = formatInTimeZone(date, timezone, 'H');
  return parseInt(hourStr, 10);
}

/**
 * Get date string in YYYY-MM-DD format for a specific timezone
 */
function getDateStringInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

/**
 * Check if a date string falls within an avoid_date_ranges
 */
function isInAvoidDateRanges(
  dateStr: string,
  ranges: { start: string; end: string }[]
): boolean {
  for (const range of ranges) {
    if (dateStr >= range.start && dateStr <= range.end) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a weekday is avoided based on LLM preferences
 */
function isAvoidedWeekday(dayOfWeek: number, avoidWeekdays: Weekday[]): boolean {
  for (const wd of avoidWeekdays) {
    if (WEEKDAY_MAP[wd] === dayOfWeek) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an hour is within a time window
 */
function isInTimeWindow(
  hour: number,
  windows: { start: string; end: string }[]
): boolean {
  for (const window of windows) {
    const start = parseTimeString(window.start);
    const end = parseTimeString(window.end);
    
    // Handle overnight windows (e.g., 22:00 - 06:00)
    if (start.hour <= end.hour) {
      if (hour >= start.hour && hour < end.hour) return true;
    } else {
      if (hour >= start.hour || hour < end.hour) return true;
    }
  }
  return false;
}

/**
 * Calculate user friendliness score based on user's local hour
 * Higher score = more friendly to user
 * Priority: 09:00-18:00 (4) > 18:00-22:00 (3) > 06:00-09:00 (2) > 22:00-00:00 (1) > 00:00-06:00 (0)
 */
function getUserFriendlinessScore(userHour: number): number {
  if (userHour >= USER_WORK_START && userHour < USER_WORK_END) {
    return 4; // User work hours - best
  } else if (userHour >= USER_WORK_END && userHour < 22) {
    return 3; // Evening before 22:00
  } else if (userHour >= 6 && userHour < USER_WORK_START) {
    return 2; // Early morning after 06:00
  } else if (userHour >= 22 && userHour < 24) {
    return 1; // Late night (前半夜: 22:00 - 00:00)
  } else {
    return 0; // Very late night (后半夜: 00:00 - 06:00)
  }
}

/**
 * Check if a candidate date/time is valid based on all constraints
 */
async function isValidCandidate(
  candidateDate: Date,
  customer: Customer,
  extractedPrefs: ExtractedPreferences | null,
  workStart: number,
  workEnd: number,
): Promise<{ valid: boolean; isHoliday: boolean; isWeekend: boolean }> {
  const customerTimezone = customer.timezone;
  const dayOfWeek = getDayOfWeekInTimezone(candidateDate, customerTimezone);
  const customerHour = getHourInTimezone(candidateDate, customerTimezone);
  const dateStr = getDateStringInTimezone(candidateDate, customerTimezone);
  
  // Check weekend
  const isWeekend = WEEKEND_DAYS.includes(dayOfWeek);
  if (isWeekend) {
    return { valid: false, isHoliday: false, isWeekend: true };
  }
  
  // Check holiday via backend
  let isHoliday = false;
  try {
    const holidayStatus = await getHolidayStatus({
      country_code: customer.country,
      date: dateStr,
    });
    isHoliday = holidayStatus.is_holiday;
    if (isHoliday) {
      return { valid: false, isHoliday: true, isWeekend: false };
    }
  } catch {
    // If holiday check fails, continue without holiday filtering
  }
  
  // Check if within customer work hours
  if (customerHour < workStart || customerHour >= workEnd) {
    return { valid: false, isHoliday: false, isWeekend: false };
  }
  
  // Check LLM extracted preferences
  if (extractedPrefs) {
    // Check avoid_dates
    if (extractedPrefs.avoid_dates.includes(dateStr)) {
      return { valid: false, isHoliday: false, isWeekend: false };
    }
    
    // Check avoid_date_ranges
    if (isInAvoidDateRanges(dateStr, extractedPrefs.avoid_date_ranges)) {
      return { valid: false, isHoliday: false, isWeekend: false };
    }
    
    // Check avoid_weekdays
    if (isAvoidedWeekday(dayOfWeek, extractedPrefs.avoid_weekdays)) {
      return { valid: false, isHoliday: false, isWeekend: false };
    }
    
    // Check avoid_time_windows
    if (extractedPrefs.avoid_time_windows.length > 0) {
      if (isInTimeWindow(customerHour, extractedPrefs.avoid_time_windows)) {
        return { valid: false, isHoliday: false, isWeekend: false };
      }
    }
  }
  
  return { valid: true, isHoliday: false, isWeekend: false };
}

/**
 * Calculate preference score for a candidate time
 * Higher = better match with preferences
 */
function getPreferenceScore(
  candidateDate: Date,
  customer: Customer,
  extractedPrefs: ExtractedPreferences | null,
): number {
  const customerTimezone = customer.timezone;
  const customerHour = getHourInTimezone(candidateDate, customerTimezone);
  const dayOfWeek = getDayOfWeekInTimezone(candidateDate, customerTimezone);
  const dateStr = getDateStringInTimezone(candidateDate, customerTimezone);
  
  let score = 0;
  
  // Prefer customer's preferredHours if set (highest priority)
  if (customer.preferredHours) {
    if (customerHour >= customer.preferredHours.start && customerHour < customer.preferredHours.end) {
      score += 100; // Strong preference for explicit preferred hours
    }
  }
  
  // LLM extracted preferences (lower priority than preferredHours)
  if (extractedPrefs) {
    // Check preferred_time_windows
    if (extractedPrefs.preferred_time_windows.length > 0) {
      if (isInTimeWindow(customerHour, extractedPrefs.preferred_time_windows)) {
        score += 50;
      }
    }
    
    // Check preferred_weekdays
    for (const wd of extractedPrefs.preferred_weekdays) {
      if (WEEKDAY_MAP[wd] === dayOfWeek) {
        score += 30;
        break;
      }
    }
    
    // Check preferred_dates
    if (extractedPrefs.preferred_dates.includes(dateStr)) {
      score += 40;
    }
    
    // Check preferred_date_ranges
    for (const range of extractedPrefs.preferred_date_ranges) {
      if (dateStr >= range.start && dateStr <= range.end) {
        score += 35;
        break;
      }
    }
  }
  
  return score;
}

/**
 * Generate candidate time slots for scheduling
 */
function generateCandidates(
  startDate: Date,
  customerTimezone: string,
  workStart: number,
  workEnd: number,
  daysAhead: number = MAX_LOOKAHEAD_DAYS,
): Date[] {
  const candidates: Date[] = [];
  const now = new Date();
  // Anchor on the customer's local day start, then convert each slot back to UTC.
  const customerNowLocal = toZonedTime(startDate, customerTimezone);
  const customerDay0Local = startOfDay(customerNowLocal);
  
  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const dayLocal = addDays(customerDay0Local, dayOffset);
    
    // Generate hourly slots within work hours
    for (let hour = workStart; hour < workEnd; hour++) {
      // Create a local wall-clock time for the customer (in system Date object),
      // then convert it to a real UTC instant.
      const candidateLocal = setMinutes(setHours(dayLocal, hour), 0);
      const candidateUTC = fromZonedTime(candidateLocal, customerTimezone);
      
      // Skip if in the past
      if (candidateUTC.getTime() <= now.getTime() + MIN_BUFFER_MINUTES * 60 * 1000) {
        continue;
      }
      
      candidates.push(candidateUTC);
    }
  }
  
  return candidates;
}

/**
 * Main scheduling function: Get the next available window for a customer
 * 
 * Priority:
 * 1. Customer work time + weekends + holidays (hard constraint)
 * 2. preferredHours > LLM extracted preferences (soft constraints for ranking)
 * 3. User work time priority; non-overlap uses friendliness ordering
 * 
 * @param customer - The customer to schedule for
 * @param userTimezone - The user's current timezone
 * @param focusItem - Optional focus item with cached LLM preferences
 */
export async function getNextAvailableWindow(
  customer: Customer,
  userTimezone: string,
  extractedPreferences?: ExtractedPreferences,
): Promise<ExtendedScheduleRecommendation> {
  const now = new Date();
  
  // Determine work hours to use
  const workStart = customer.preferredHours?.start ?? DEFAULT_WORK_START;
  const workEnd = customer.preferredHours?.end ?? DEFAULT_WORK_END;
  
  // LLM extracted preferences (optional)
  const extractedPrefs = extractedPreferences ?? null;
  
  // Generate candidate time slots
  const candidates = generateCandidates(
    now,
    customer.timezone,
    workStart,
    workEnd,
    MAX_LOOKAHEAD_DAYS
  );
  
  if (candidates.length === 0) {
    // Fallback: next business day at work start
    return {
      suggestedTime: addDays(setMinutes(setHours(now, workStart), 0), 1),
      reason: 'No available slots found',
      isOptimal: false,
      isWeekend: false,
      isHoliday: false,
      isUserWorkTime: false,
      userFriendlinessScore: 0,
    };
  }
  
  // Evaluate candidates
  interface ScoredCandidate {
    time: Date;
    preferenceScore: number;
    userFriendlinessScore: number;
    isUserWorkTime: boolean;
    isHoliday: boolean;
    isWeekend: boolean;
  }
  
  const validCandidates: ScoredCandidate[] = [];
  
  for (const candidate of candidates) {
    const validation = await isValidCandidate(
      candidate,
      customer,
      extractedPrefs,
      workStart,
      workEnd
    );
    
    if (!validation.valid) continue;
    
    const preferenceScore = getPreferenceScore(candidate, customer, extractedPrefs);
    const userHour = getHourInTimezone(candidate, userTimezone);
    const userFriendliness = getUserFriendlinessScore(userHour);
    const isUserWorkTime = userHour >= USER_WORK_START && userHour < USER_WORK_END;
    
    validCandidates.push({
      time: candidate,
      preferenceScore,
      userFriendlinessScore: userFriendliness,
      isUserWorkTime,
      isHoliday: validation.isHoliday,
      isWeekend: validation.isWeekend,
    });
  }
  
  if (validCandidates.length === 0) {
    // No valid candidates found, return a default
    const fallbackTime = addDays(setMinutes(setHours(now, workStart), 0), 1);
    return {
      suggestedTime: fallbackTime,
      reason: 'No available slots found within constraints',
      isOptimal: false,
      isWeekend: false,
      isHoliday: false,
      isUserWorkTime: false,
      userFriendlinessScore: 0,
    };
  }
  
  // Sort candidates:
  // 1. First by whether it's in user's work time (prefer yes)
  // 2. Then by preference score (higher = better)
  // 3. Then by user friendliness score (higher = better)
  // 4. Then by time (earlier = better)
  validCandidates.sort((a, b) => {
    // Prioritize user work time
    if (a.isUserWorkTime !== b.isUserWorkTime) {
      return a.isUserWorkTime ? -1 : 1;
    }
    // Then preference score
    if (a.preferenceScore !== b.preferenceScore) {
      return b.preferenceScore - a.preferenceScore;
    }
    // Then user friendliness
    if (a.userFriendlinessScore !== b.userFriendlinessScore) {
      return b.userFriendlinessScore - a.userFriendlinessScore;
    }
    // Finally, earlier time
    return a.time.getTime() - b.time.getTime();
  });
  
  const best = validCandidates[0];
  const customerTimeStr = formatInTimeZone(best.time, customer.timezone, 'HH:mm');
  const userTimeStr = formatInTimeZone(best.time, userTimezone, 'HH:mm');
  const customerDateStr = formatInTimeZone(best.time, customer.timezone, 'EEE, MMM d');
  
  // Build reason string (not shown to user per requirements, but kept for internal use)
  let reason = `${customerDateStr} ${customerTimeStr} customer time, ${userTimeStr} your time`;
  
  const dayOfWeek = getDayOfWeekInTimezone(best.time, customer.timezone);
  const isToday = getDateStringInTimezone(best.time, customer.timezone) === 
                  getDateStringInTimezone(now, customer.timezone);
  
  return {
    suggestedTime: best.time,
    reason,
    isOptimal: best.isUserWorkTime && best.preferenceScore > 0,
    isWeekend: WEEKEND_DAYS.includes(dayOfWeek),
    isHoliday: best.isHoliday,
    isUserWorkTime: best.isUserWorkTime,
    userFriendlinessScore: best.userFriendlinessScore,
    nextBusinessDay: isToday ? undefined : formatInTimeZone(best.time, customer.timezone, 'EEEE'),
  };
}

/**
 * Synchronous version for initial render (without holiday check)
 * Use this for immediate display, then call async version for accurate result
 */
export function getNextAvailableWindowSync(
  customer: Customer,
  userTimezone: string,
): ExtendedScheduleRecommendation {
  const now = new Date();
  const workStart = customer.preferredHours?.start ?? DEFAULT_WORK_START;
  const workEnd = customer.preferredHours?.end ?? DEFAULT_WORK_END;
  
  // Simple logic: find next work hour (computed in customer local time, then converted to UTC)
  const customerNowLocal = toZonedTime(now, customer.timezone);
  const customerHour = customerNowLocal.getHours();
  const dayOfWeek = getDayOfWeekInTimezone(now, customer.timezone);
  const isWeekend = WEEKEND_DAYS.includes(dayOfWeek);
  
  let suggestedLocal: Date;
  let nextBusinessDay: string | undefined;
  
  if (isWeekend) {
    // Skip to Monday
    const daysToAdd = dayOfWeek === 0 ? 1 : 2;
    const mondayLocal = addDays(startOfDay(customerNowLocal), daysToAdd);
    suggestedLocal = setMinutes(setHours(mondayLocal, workStart), 0);
    nextBusinessDay = 'Monday';
  } else if (customerHour < workStart) {
    // Before work hours
    suggestedLocal = setMinutes(setHours(startOfDay(customerNowLocal), workStart), 0);
  } else if (customerHour >= workEnd) {
    // After work hours, go to next day
    const nextDayLocal = addDays(startOfDay(customerNowLocal), 1);
    const nextDayOfWeek = (dayOfWeek + 1) % 7;
    if (WEEKEND_DAYS.includes(nextDayOfWeek)) {
      const daysToAdd = nextDayOfWeek === 6 ? 2 : 1;
      suggestedLocal = setMinutes(setHours(addDays(nextDayLocal, daysToAdd - 1), workStart), 0);
      nextBusinessDay = 'Monday';
    } else {
      suggestedLocal = setMinutes(setHours(nextDayLocal, workStart), 0);
    }
  } else {
    // Within work hours, round to next 15-min mark + buffer
    suggestedLocal = addMinutes(customerNowLocal, MIN_BUFFER_MINUTES);
    const roundedMinutes = Math.ceil(suggestedLocal.getMinutes() / 15) * 15;
    suggestedLocal.setMinutes(roundedMinutes % 60);
    if (roundedMinutes >= 60) {
      suggestedLocal = addMinutes(suggestedLocal, 60 - suggestedLocal.getMinutes());
    }
    suggestedLocal.setSeconds(0);
    suggestedLocal.setMilliseconds(0);
  }
  
  const suggestedTime = fromZonedTime(suggestedLocal, customer.timezone);
  const userHour = getHourInTimezone(suggestedTime, userTimezone);
  const isUserWorkTime = userHour >= USER_WORK_START && userHour < USER_WORK_END;
  
  return {
    suggestedTime,
    reason: '',
    isOptimal: isUserWorkTime,
    isWeekend,
    isHoliday: false,
    isUserWorkTime,
    userFriendlinessScore: getUserFriendlinessScore(userHour),
    nextBusinessDay,
  };
}

/**
 * Format a scheduled time for display
 */
export function formatScheduledTime(
  time: Date,
  userTimezone: string,
  customerTimezone: string
): { userTime: string; customerTime: string; userDate: string; customerDate: string } {
  return {
    userTime: formatInTimeZone(time, userTimezone, 'HH:mm'),
    customerTime: formatInTimeZone(time, customerTimezone, 'HH:mm'),
    userDate: formatInTimeZone(time, userTimezone, 'EEE, MMM d'),
    customerDate: formatInTimeZone(time, customerTimezone, 'EEE, MMM d'),
  };
}

/**
 * Calculate milliseconds until a scheduled time
 */
export function getMillisecondsUntil(scheduledTime: Date): number {
  return Math.max(0, scheduledTime.getTime() - Date.now());
}

/**
 * Check if a scheduled time has passed
 */
export function hasTimePassed(scheduledTime: Date): boolean {
  return scheduledTime.getTime() <= Date.now();
}

/**
 * Create a browser notification (requires permission)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
}

/**
 * Show a browser notification
 */
export function showNotification(title: string, body: string): void {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'globalsync-reminder',
    });
  }
}

/**
 * Set up a reminder for a scheduled time
 * Returns a function to cancel the reminder
 */
export function setReminder(
  scheduledTime: Date,
  customerName: string,
  intent: string,
  onTrigger: () => void
): () => void {
  const msUntil = getMillisecondsUntil(scheduledTime);
  
  if (msUntil <= 0) {
    // Already passed
    onTrigger();
    return () => {};
  }
  
  const timeoutId = setTimeout(() => {
    showNotification(
      `Time to contact ${customerName}`,
      intent || 'Scheduled follow-up'
    );
    onTrigger();
  }, msUntil);
  
  // Return cancel function
  return () => clearTimeout(timeoutId);
}

/**
 * Simple hash function for crmNotes to detect changes
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

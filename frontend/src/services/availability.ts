/**
 * Availability Service
 * Calculates customer availability based on timezone, working hours, and preferences
 */

import { formatInTimeZone } from 'date-fns-tz';
import type { Customer, AvailabilityStatus } from '@/types';

// Default working hours (in customer's local time)
const DEFAULT_WORK_START = 9;
const DEFAULT_WORK_END = 18;

// Weekend days (0 = Sunday, 6 = Saturday)
const WEEKEND_DAYS = [0, 6];

export interface AvailabilityInfo {
  status: AvailabilityStatus;
  localTime: string;        // HH:mm format
  localDate: string;        // EEE, MMM d format
  hour: number;             // 0-23
  isWeekend: boolean;
  reason: string;           // Human-readable explanation
}

/**
 * Get customer's current local time info
 */
export function getCustomerTimeInfo(timezone: string): { time: string; date: string; hour: number; dayOfWeek: number } {
  const now = new Date();
  const time = formatInTimeZone(now, timezone, 'HH:mm');
  const date = formatInTimeZone(now, timezone, 'EEE, MMM d');
  const hourStr = formatInTimeZone(now, timezone, 'H');
  const dayStr = formatInTimeZone(now, timezone, 'i'); // Day of week 1-7 (Mon-Sun)
  
  return {
    time,
    date,
    hour: parseInt(hourStr, 10),
    dayOfWeek: parseInt(dayStr, 10) % 7, // Convert to 0-6 (Sun-Sat)
  };
}

/**
 * Check if a given hour is within a time range
 */
function isWithinHours(hour: number, start: number, end: number): boolean {
  if (start <= end) {
    return hour >= start && hour < end;
  }
  // Handle overnight ranges (e.g., 22:00 - 06:00)
  return hour >= start || hour < end;
}

/**
 * Calculate availability status for a customer
 */
export function getCustomerAvailability(customer: Customer): AvailabilityInfo {
  const timeInfo = getCustomerTimeInfo(customer.timezone);
  const { time, date, hour, dayOfWeek } = timeInfo;
  
  // Check if it's a weekend
  const isWeekend = WEEKEND_DAYS.includes(dayOfWeek);
  
  // TODO: Add holiday check here using date-holidays or similar
  // For now, we skip holiday detection
  
  // Determine which hours to use (preferred or default)
  const workStart = customer.preferredHours?.start ?? DEFAULT_WORK_START;
  const workEnd = customer.preferredHours?.end ?? DEFAULT_WORK_END;
  
  // Calculate status
  let status: AvailabilityStatus;
  let reason: string;
  
  if (isWeekend) {
    status = 'UNAVAILABLE' as AvailabilityStatus;
    reason = `Weekend in ${customer.timezone}`;
  } else if (isWithinHours(hour, workStart, workEnd)) {
    status = 'AVAILABLE' as AvailabilityStatus;
    if (customer.preferredHours) {
      reason = `Within preferred hours (${workStart}:00-${workEnd}:00)`;
    } else {
      reason = `Within working hours (${workStart}:00-${workEnd}:00)`;
    }
  } else {
    status = 'UNAVAILABLE' as AvailabilityStatus;
    reason = `Outside working hours (currently ${time})`;
  }
  
  return {
    status,
    localTime: time,
    localDate: date,
    hour,
    isWeekend,
    reason,
  };
}

/**
 * Get timezone offset label (e.g., "UTC+08:00")
 */
export function getTimezoneOffsetLabel(timezone: string): string {
  const now = new Date();
  const offsetStr = formatInTimeZone(now, timezone, 'xxx'); // e.g., +08:00
  return `UTC${offsetStr}`;
}

/**
 * Sort customers by availability (available first)
 */
export function sortByAvailability(customers: Customer[]): Customer[] {
  return [...customers].sort((a, b) => {
    const statusA = getCustomerAvailability(a).status;
    const statusB = getCustomerAvailability(b).status;
    
    // Priority: AVAILABLE > UNAVAILABLE > HOLIDAY
    const priority = {
      AVAILABLE: 0,
      UNAVAILABLE: 1,
      HOLIDAY: 2,
    };
    
    return priority[statusA] - priority[statusB];
  });
}

/**
 * Get a list of common timezones grouped by region
 * This is used for the timezone selector
 * 
 * Scope: Developed countries + Southeast Asia (matching backend holiday service)
 */
export const TIMEZONE_REGIONS: Record<string, string[]> = {
  'North America': [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Vancouver',
  ],
  'Europe': [
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Amsterdam',
    'Europe/Brussels',
    'Europe/Zurich',
    'Europe/Vienna',
    'Europe/Stockholm',
    'Europe/Oslo',
    'Europe/Copenhagen',
    'Europe/Helsinki',
    'Europe/Dublin',
  ],
  'Asia - Developed': [
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Taipei',
    'Asia/Singapore',
    'Asia/Dubai',
    'Asia/Tel_Aviv',
  ],
  'Southeast Asia': [
    'Asia/Bangkok',
    'Asia/Ho_Chi_Minh',
    'Asia/Kuala_Lumpur',
    'Asia/Jakarta',
    'Asia/Manila',
  ],
  'Oceania': [
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Perth',
    'Pacific/Auckland',
  ],
};

/**
 * Get all timezones as a flat list
 */
export function getAllTimezones(): string[] {
  return Object.values(TIMEZONE_REGIONS).flat();
}

/**
 * Country to primary timezone mapping
 * Used for auto-selecting timezone when country is chosen
 * 
 * Scope: Developed countries + Southeast Asia (matching backend holiday service)
 */
export const COUNTRY_TIMEZONES: Record<string, string> = {
  // North America
  'US': 'America/New_York',
  'CA': 'America/Toronto',
  // Europe - Western
  'GB': 'Europe/London',
  'IE': 'Europe/Dublin',
  'DE': 'Europe/Berlin',
  'FR': 'Europe/Paris',
  'IT': 'Europe/Rome',
  'ES': 'Europe/Madrid',
  'NL': 'Europe/Amsterdam',
  'BE': 'Europe/Brussels',
  'CH': 'Europe/Zurich',
  'AT': 'Europe/Vienna',
  // Europe - Nordic
  'SE': 'Europe/Stockholm',
  'NO': 'Europe/Oslo',
  'DK': 'Europe/Copenhagen',
  'FI': 'Europe/Helsinki',
  // Asia - Developed
  'JP': 'Asia/Tokyo',
  'KR': 'Asia/Seoul',
  'CN': 'Asia/Shanghai',
  'SG': 'Asia/Singapore',
  'AE': 'Asia/Dubai',
  'IL': 'Asia/Tel_Aviv',
  // Southeast Asia
  'TH': 'Asia/Bangkok',
  'VN': 'Asia/Ho_Chi_Minh',
  'MY': 'Asia/Kuala_Lumpur',
  'ID': 'Asia/Jakarta',
  'PH': 'Asia/Manila',
  // Oceania
  'AU': 'Australia/Sydney',
  'NZ': 'Pacific/Auckland',
};

/**
 * List of countries for the country selector
 * 
 * Scope: Developed countries + Southeast Asia (matching backend holiday service)
 * Sorted alphabetically by name within each region
 */
export const COUNTRIES = [
  // North America
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
  // Europe - Western
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'GB', name: 'United Kingdom' },
  // Asia - Developed
  { code: 'CN', name: 'China' },
  { code: 'IL', name: 'Israel' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  // Southeast Asia
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  // Oceania
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
];

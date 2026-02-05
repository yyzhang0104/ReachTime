/**
 * Core type definitions for ReachTime
 */

// Communication channel types
export type ChannelType = 'Email' | 'WhatsApp' | 'WeChat' | 'SMS' | 'Phone';

// Weekday type for scheduling constraints
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

// A single contact channel entry
export interface ContactChannel {
  id: string;
  type: ChannelType;
  handle: string; // email address, phone number, or username
  isPrimary: boolean;
}

// Preferred contact hours (in customer's local time)
export interface PreferredHours {
  start: number; // 0-23
  end: number;   // 0-23
}

// Time window for scheduling (HH:MM format, 24h, customer's local time)
export interface TimeWindow {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

// Date range for scheduling constraints (YYYY-MM-DD format)
export interface DateRange {
  start: string; // "YYYY-MM-DD"
  end: string;   // "YYYY-MM-DD"
}

// Extracted preferences from CRM notes (via LLM)
export interface ExtractedPreferences {
  preferred_time_windows: TimeWindow[];
  avoid_time_windows: TimeWindow[];
  preferred_weekdays: Weekday[];
  avoid_weekdays: Weekday[];
  preferred_dates: string[];      // YYYY-MM-DD format
  avoid_dates: string[];          // YYYY-MM-DD format
  preferred_date_ranges: DateRange[];
  avoid_date_ranges: DateRange[];
  confidence: number;             // 0-1
  notes_language: string;         // 'zh', 'en', 'mixed', 'unknown'
}

// Request for extracting preferences
export interface ExtractPreferencesRequest {
  crm_notes: string;
  customer_country?: string;
  customer_timezone?: string;
  today_local_date?: string;
}

// Holiday status check request
export interface HolidayStatusRequest {
  country_code: string;
  date: string; // YYYY-MM-DD
}

// Holiday status response
export interface HolidayStatusResponse {
  is_holiday: boolean;
  is_weekend: boolean;
  holiday_name?: string;
  is_supported_country: boolean;
}

// Batch holiday status request
export interface HolidayStatusBatchRequest {
  country_code: string;
  dates: string[]; // Array of YYYY-MM-DD
}

// Batch holiday response - only holidays are returned
export interface HolidayMapResponse {
  holidays: Record<string, string>; // date -> holiday_name, only for holidays
  is_supported_country: boolean;
}

// Customer data model (upgraded with multi-channel support)
export interface Customer {
  id: string;
  name: string;
  company: string;
  country: string;           // ISO country code (e.g., "US", "CN", "GB")
  timezone: string;          // IANA timezone (e.g., "America/New_York")
  channels: ContactChannel[];
  crmNotes: string;
  tags: string[];            // Structured tags like "logistics-sensitive", "vip"
  preferredHours?: PreferredHours;
  createdAt: number;
  updatedAt: number;
}

// Today's focus item with intent and scheduled time
export interface FocusItem {
  customerId: string;
  intent: string;            // What you want to communicate
  scheduledTime?: number;    // Unix timestamp for scheduled send
  reminderSet: boolean;      // Whether reminder is active
  addedAt: number;
  
  // Time confirmation fields (P0.3)
  isTimeConfirmed?: boolean;         // Whether user confirmed the scheduled time
  confirmedScheduledTime?: number;   // The confirmed time (locked, won't be recalculated)
  confirmedAt?: number;              // When the time was confirmed
  
  // Draft persistence fields (P1.1)
  draftSubject?: string;             // Saved draft subject
  draftContent?: string;             // Saved draft content
  isDraftConfirmed?: boolean;        // Whether draft is finalized
  draftConfirmedAt?: number;         // When draft was confirmed
  
  // LLM preferences cache
  extractedPreferences?: ExtractedPreferences;
  crmNotesHash?: string;             // Hash of crmNotes when preferences were extracted
  preferencesExtractedAt?: number;   // When preferences were extracted
}

// User work hours (in user's local time)
export interface UserWorkHours {
  start: string; // "HH:mm" format, e.g. "09:00"
  end: string;   // "HH:mm" format, e.g. "18:00"
}

// User profile
export interface UserProfile {
  username: string;
  name: string;              // Deprecated - use firstName/lastName instead
  firstName: string;         // Required: user's first name (名)
  lastName?: string;         // Optional: user's last name (姓)
  homeTimezone: string;      // User's home timezone
  currentTimezone: string;   // Current timezone (for travel mode)
  workHours: UserWorkHours;  // User's work hours for scheduling
}

// Availability status for customers
export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',     // Green - within working/preferred hours
  UNAVAILABLE = 'UNAVAILABLE', // Red - outside working hours
  HOLIDAY = 'HOLIDAY',         // Gray - public holiday
}

// Draft request to backend API
export interface DraftRequest {
  user_intent: string;
  communication_channel: string;
  crm_notes: string;
  target_language: string;
  customer_name: string;
  sender_name: string;
}

// Draft response from backend API
export interface DraftResponse {
  subject: string;
  content: string;
}

// Scheduling recommendation
export interface ScheduleRecommendation {
  suggestedTime: Date;
  reason: string;
  isOptimal: boolean;
}

// Vault lock state
export type VaultState = 'locked' | 'unlocked' | 'uninitialized';

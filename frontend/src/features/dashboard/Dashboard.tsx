/**
 * Dashboard Component
 * Displays customer cards with availability status and sorting
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store';
import type { Customer } from '@/types';
import { getCustomerAvailability, getTimezoneOffsetLabel, sortByAvailability } from '@/services/availability';
import { CustomerDetailDrawer } from './CustomerDetailDrawer';

interface CustomerCardProps {
  customer: Customer;
  onSelect: () => void;
  onToggleFocus: () => void;
  isInFocus: boolean;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onSelect, onToggleFocus, isInFocus }) => {
  const { deleteCustomer, activeReminders } = useStore();
  const availability = getCustomerAvailability(customer);
  const offset = getTimezoneOffsetLabel(customer.timezone);
  const hasReminder = activeReminders.has(customer.id);

  const primaryChannel = customer.channels.find((c) => c.isPrimary) || customer.channels[0];

  const statusColors = {
    AVAILABLE: 'bg-emerald-500',
    UNAVAILABLE: 'bg-slate-300',
    HOLIDAY: 'bg-amber-400',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group relative"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <button onClick={onSelect} className="flex items-center gap-3 text-left">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-indigo-600 font-bold text-lg relative">
            {customer.name[0]}
            {/* Status indicator */}
            <div
              className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${statusColors[availability.status]}`}
            />
            {/* Reminder indicator */}
            {hasReminder && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center">
                <span className="text-[8px]">⏰</span>
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 leading-none">{customer.name}</h3>
            <p className="text-xs text-slate-500 mt-1">{customer.company}</p>
          </div>
        </button>
        <div className="text-right">
          <div className="text-xl font-mono font-bold text-slate-700">{availability.localTime}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{offset}</div>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-full">
            {primaryChannel?.type}
          </span>
          <span className="text-xs text-slate-500 truncate">{primaryChannel?.handle}</span>
        </div>
        {customer.crmNotes && (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
            <p className="text-xs text-slate-600 line-clamp-2 italic">"{customer.crmNotes}"</p>
          </div>
        )}
        {customer.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {customer.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onSelect}
          className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
        >
          AI Draft
        </button>
        <button
          onClick={onToggleFocus}
          className={`p-2.5 rounded-xl transition-all ${
            isInFocus
              ? 'bg-indigo-100 text-indigo-600'
              : 'bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-100'
          }`}
          title={isInFocus ? 'Remove from Focus' : 'Add to Focus'}
        >
          <svg className="w-5 h-5" fill={isInFocus ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </button>
        <button
          onClick={() => deleteCustomer(customer.id)}
          className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 rounded-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Status Badge */}
      {availability.status === 'AVAILABLE' && (
        <div className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
          Available Now
        </div>
      )}
    </motion.div>
  );
};

interface DashboardProps {
  onAddCustomer: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onAddCustomer }) => {
  const { customers, focusItems, addToFocus, removeFromFocus } = useStore();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showFocusOnly, setShowFocusOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort customers
  const displayedCustomers = useMemo(() => {
    let filtered = customers;

    // Filter by focus
    if (showFocusOnly) {
      const focusIds = new Set(focusItems.map((f) => f.customerId));
      filtered = filtered.filter((c) => focusIds.has(c.id));
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.company.toLowerCase().includes(query) ||
          c.tags.some((t) => t.includes(query))
      );
    }

    // Sort
    if (showFocusOnly) {
      const now = Date.now();
      const focusById = new Map(focusItems.map((f) => [f.customerId, f]));

      return [...filtered].sort((a, b) => {
        const fa = focusById.get(a.id);
        const fb = focusById.get(b.id);

        const taRaw =
          fa?.confirmedScheduledTime ?? fa?.scheduledTime ?? Number.POSITIVE_INFINITY;
        const tbRaw =
          fb?.confirmedScheduledTime ?? fb?.scheduledTime ?? Number.POSITIVE_INFINITY;

        // Overdue items (past scheduled time) should bubble up
        const ta = taRaw !== Number.POSITIVE_INFINITY && taRaw < now ? 0 : taRaw;
        const tb = tbRaw !== Number.POSITIVE_INFINITY && tbRaw < now ? 0 : tbRaw;

        if (ta !== tb) return ta - tb;

        // Tie-breaker: availability (available first)
        const statusA = getCustomerAvailability(a).status;
        const statusB = getCustomerAvailability(b).status;
        const priority = { AVAILABLE: 0, UNAVAILABLE: 1, HOLIDAY: 2 } as const;
        const pa = priority[statusA as keyof typeof priority] ?? 9;
        const pb = priority[statusB as keyof typeof priority] ?? 9;
        if (pa !== pb) return pa - pb;

        // Final: name
        return a.name.localeCompare(b.name);
      });
    }

    // Default: sort by availability
    return sortByAvailability(filtered);
  }, [customers, focusItems, showFocusOnly, searchQuery]);

  const handleToggleFocus = async (customerId: string) => {
    const isInFocus = focusItems.some((f) => f.customerId === customerId);
    if (isInFocus) {
      await removeFromFocus(customerId);
    } else {
      await addToFocus(customerId);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {showFocusOnly ? "Today's Focus" : 'All Contacts'}
          </h2>
          <p className="text-slate-500 mt-1">Smart sorting by availability for peak response rates.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Focus Toggle */}
          <button
            onClick={() => setShowFocusOnly(!showFocusOnly)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-colors ${
              showFocusOnly
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {showFocusOnly ? 'Show All' : 'Focus Only'}
          </button>

          {/* Add Button */}
          <button
            onClick={onAddCustomer}
            className="group flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold shadow-xl shadow-indigo-200 transition-all active:scale-95"
          >
            <svg
              className="w-5 h-5 transition-transform group-hover:rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden md:inline">Add Contact</span>
          </button>
        </div>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {displayedCustomers.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-20 text-center"
            >
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              <h3 className="text-slate-600 font-medium">
                {showFocusOnly
                  ? 'No contacts in focus. Add some to get started.'
                  : 'No customers yet. Click "+" to get started.'}
              </h3>
            </motion.div>
          ) : (
            displayedCustomers.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                onSelect={() => setSelectedCustomerId(customer.id)}
                onToggleFocus={() => handleToggleFocus(customer.id)}
                isInFocus={focusItems.some((f) => f.customerId === customer.id)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedCustomerId && (
          <CustomerDetailDrawer
            customerId={selectedCustomerId}
            onClose={() => setSelectedCustomerId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

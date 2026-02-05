/**
 * Customer Form Component
 * For creating and editing customer profiles with multi-channel support
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { Customer, ContactChannel, ChannelType, PreferredHours } from '@/types';
import { COUNTRIES, COUNTRY_TIMEZONES, TIMEZONE_REGIONS, timezoneCityLabel } from '@/services/availability';

interface CustomerFormProps {
  customer?: Customer; // If provided, we're editing
  onClose: () => void;
}

const CHANNEL_TYPES: ChannelType[] = ['Email', 'WhatsApp', 'WeChat', 'SMS', 'Phone'];

const generateId = () => Math.random().toString(36).substr(2, 9);

function normalizeCountryForSelector(countryCode: string): string {
  // Requirement: do not show HK/TW in country dropdown.
  // If existing data contains HK/TW, map to China for selection purposes.
  if (countryCode === 'HK' || countryCode === 'TW') return 'CN';
  return countryCode;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ customer, onClose }) => {
  const { addCustomer, updateCustomer } = useStore();
  const isEditing = !!customer;

  const [formData, setFormData] = useState({
    name: customer?.name || '',
    company: customer?.company || '',
    country: normalizeCountryForSelector(customer?.country || 'US'),
    timezone: customer?.timezone || 'America/New_York',
    crmNotes: customer?.crmNotes || '',
    tags: customer?.tags || [],
  });

  const [channels, setChannels] = useState<ContactChannel[]>(
    customer?.channels || [{ id: generateId(), type: 'Email', handle: '', isPrimary: true }]
  );

  const [preferredHours, setPreferredHours] = useState<PreferredHours | undefined>(
    customer?.preferredHours
  );

  const [showPreferredHours, setShowPreferredHours] = useState(!!customer?.preferredHours);
  const [tagInput, setTagInput] = useState('');

  // Auto-select timezone when country changes
  useEffect(() => {
    if (!isEditing && formData.country && COUNTRY_TIMEZONES[formData.country]) {
      setFormData((prev) => ({ ...prev, timezone: COUNTRY_TIMEZONES[formData.country] }));
    }
  }, [formData.country, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate at least one channel
    const validChannels = channels.filter((c) => c.handle.trim());
    if (validChannels.length === 0) {
      alert('Please add at least one contact channel');
      return;
    }

    // Ensure one primary channel
    if (!validChannels.some((c) => c.isPrimary)) {
      validChannels[0].isPrimary = true;
    }

    const customerData: Customer = {
      id: customer?.id || generateId(),
      name: formData.name.trim(),
      company: formData.company.trim(),
      country: formData.country,
      timezone: formData.timezone,
      channels: validChannels,
      crmNotes: formData.crmNotes.trim(),
      tags: formData.tags,
      preferredHours: showPreferredHours ? preferredHours : undefined,
      createdAt: customer?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    if (isEditing) {
      await updateCustomer(customer.id, customerData);
    } else {
      await addCustomer(customerData);
    }

    onClose();
  };

  const addChannel = () => {
    setChannels([...channels, { id: generateId(), type: 'Email', handle: '', isPrimary: false }]);
  };

  const removeChannel = (id: string) => {
    const updated = channels.filter((c) => c.id !== id);
    // Ensure at least one primary
    if (updated.length > 0 && !updated.some((c) => c.isPrimary)) {
      updated[0].isPrimary = true;
    }
    setChannels(updated);
  };

  const updateChannel = (id: string, updates: Partial<ContactChannel>) => {
    setChannels(
      channels.map((c) => {
        if (c.id === id) {
          // If setting as primary, unset others
          if (updates.isPrimary) {
            return { ...c, ...updates };
          }
          return { ...c, ...updates };
        }
        if (updates.isPrimary) {
          return { ...c, isPrimary: false };
        }
        return c;
      })
    );
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">
            {isEditing ? 'Edit Contact' : 'New Global Contact'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name *</label>
              <input
                required
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. John Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company</label>
              <input
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="e.g. Acme Corp"
              />
            </div>
          </div>

          {/* Country & Timezone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Country</label>
              <select
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Timezone</label>
              <select
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              >
                {Object.entries(TIMEZONE_REGIONS).map(([region, tzs]) => (
                  <optgroup key={region} label={region}>
                    {tzs.map((tz) => (
                      <option key={tz} value={tz}>
                        {timezoneCityLabel(tz)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* Contact Channels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Contact Channels *</label>
              <button
                type="button"
                onClick={addChannel}
                className="text-xs text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Channel
              </button>
            </div>
            <div className="space-y-2">
              {channels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-2">
                  <select
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                    value={channel.type}
                    onChange={(e) => updateChannel(channel.id, { type: e.target.value as ChannelType })}
                  >
                    {CHANNEL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                    value={channel.handle}
                    onChange={(e) => updateChannel(channel.id, { handle: e.target.value })}
                    placeholder={channel.type === 'Email' ? 'email@example.com' : 'Handle/Number'}
                  />
                  <button
                    type="button"
                    onClick={() => updateChannel(channel.id, { isPrimary: true })}
                    className={`p-2 rounded-lg transition-colors ${
                      channel.isPrimary
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-400 hover:text-slate-600'
                    }`}
                    title={channel.isPrimary ? 'Primary' : 'Set as Primary'}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                  {channels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChannel(channel.id)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preferred Hours */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPreferredHours}
                onChange={(e) => {
                  setShowPreferredHours(e.target.checked);
                  if (e.target.checked && !preferredHours) {
                    setPreferredHours({ start: 9, end: 11 });
                  }
                }}
                className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
              />
              <span className="text-xs font-bold text-slate-500 uppercase">Preferred Contact Hours</span>
            </label>
            {showPreferredHours && preferredHours && (
              <div className="mt-2 flex items-center gap-2">
                <select
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                  value={preferredHours.start}
                  onChange={(e) => setPreferredHours({ ...preferredHours, start: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <span className="text-slate-400">to</span>
                <select
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                  value={preferredHours.end}
                  onChange={(e) => setPreferredHours({ ...preferredHours, end: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">(customer's local time)</span>
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-amber-900">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="e.g. vip, logistics-sensitive"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          {/* CRM Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CRM Notes (Private)</label>
            <textarea
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none h-24"
              value={formData.crmNotes}
              onChange={(e) => setFormData({ ...formData, crmNotes: e.target.value })}
              placeholder="e.g. Prefers morning calls, logistics delays last month, interested in Product X..."
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            type="submit"
            onClick={handleSubmit}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-lg shadow-amber-100 transition-all active:scale-[0.98]"
          >
            {isEditing ? 'Save Changes' : 'Save Contact Locally'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

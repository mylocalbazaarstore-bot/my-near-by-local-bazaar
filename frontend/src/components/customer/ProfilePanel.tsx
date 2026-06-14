// src/components/customer/ProfilePanel.tsx
// ─────────────────────────────────────────────────────────────
// Customer Profile — MyLocalBazaar
// Editable name/email/gender/DOB, read-only phone, referral code
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { User as UserIcon, Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useProfile } from '@/hooks/useDashboard';
import { getErrorMessage } from '@/lib/api';

export default function ProfilePanel() {
  const { profile, loading, updateProfile } = useProfile();
  const [form, setForm] = useState({
    full_name:     '',
    email:         '',
    gender:        '',
    date_of_birth: '',
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name:     profile.full_name || '',
        email:         profile.email || '',
        gender:        profile.gender || '',
        date_of_birth: profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '',
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        full_name:     form.full_name,
        email:         form.email || undefined,
        gender:        form.gender || undefined,
        date_of_birth: form.date_of_birth || undefined,
      });
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const copyReferral = () => {
    if (!profile?.referral_code) return;
    navigator.clipboard.writeText(profile.referral_code);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-5 max-w-lg">
        <div className="skeleton h-7 w-40 rounded" />
        <div className="flex items-center gap-4">
          <div className="skeleton w-20 h-20 rounded-2xl" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        </div>
        <div className="card p-5 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="section-heading text-xl flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-brand-green" /> My Profile
        </h2>
        <p className="text-xs text-surface-500 mt-0.5">Manage your personal details</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-green to-brand-orange
                        flex items-center justify-center text-white font-display font-black text-3xl">
          {profile?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p className="font-bold text-surface-900">{profile?.full_name || 'Customer'}</p>
          <p className="text-sm text-surface-500">{profile?.phone}</p>
          <p className="text-xs text-brand-green mt-0.5">Verified Customer ✓</p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            placeholder="Your full name"
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="your@email.com"
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Gender
          </label>
          <select
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            className="input-field"
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Date of Birth
          </label>
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))}
            className="input-field"
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Read-only info */}
      <div className="card p-4">
        <div className="flex items-center justify-between py-2 border-b border-surface-100">
          <span className="text-sm text-surface-500">Mobile Number</span>
          <span className="text-sm font-semibold text-surface-900">{profile?.phone}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-surface-500">Referral Code</span>
          <button
            onClick={copyReferral}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-mono font-black tracking-widest transition-all',
              copied
                ? 'bg-brand-green text-white'
                : 'bg-surface-100 text-brand-green hover:bg-surface-200'
            )}
          >
            {profile?.referral_code}
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

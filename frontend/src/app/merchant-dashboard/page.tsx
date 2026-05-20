// src/app/merchant-dashboard/page.tsx
// ─────────────────────────────────────────────────────────────
// Merchant Dashboard — MyLocalBazaar
// Authenticated SaaS panel for store owners
// Sections: Analytics | Products | Orders | Settings | KYC | Hours | Bank
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout, type NavItem } from '@/components/ui/DashboardLayout';
import AnalyticsDashboard from '@/components/merchant-dash/AnalyticsCharts';
import ProductsTable     from '@/components/merchant-dash/ProductsTable';
import OrdersManagement  from '@/components/merchant-dash/OrdersManagement';
import { useAuthStore }  from '@/store/authStore';
import { api, apiGet, apiPatch, apiPost, apiPostForm } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Store, AlertTriangle, CheckCircle2, Upload, Clock,
  ToggleLeft, ToggleRight, Camera, CreditCard,
} from 'lucide-react';

// ── Merchant Nav ───────────────────────────────────────────────
const NAV: NavItem[] = [
  { href: '#analytics', label: 'Analytics',      icon: '📊' },
  { href: '#products',  label: 'Products',        icon: '📦' },
  { href: '#orders',    label: 'Orders',          icon: '🛒', badge: '!' },
  { href: '#kyc',       label: 'KYC & Documents', icon: '🪪' },
  { href: '#settings',  label: 'Store Settings',  icon: '⚙️' },
  { href: '#hours',     label: 'Opening Hours',   icon: '🕐' },
  { href: '#bank',      label: 'Bank & Payouts',  icon: '💳' },
  { href: '#support',   label: 'Help & Support',  icon: '🆘' },
];

// ── Day labels (0 = Sunday .. 6 = Saturday) ───────────────────
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Store Settings Form ────────────────────────────────────────
function StoreSettings() {
  const [form, setForm] = useState({
    store_description:     '',
    min_order_value:       '',
    delivery_radius_km:    '',
    accepts_cod:           true,
    whatsapp_catalog_link: '',
  });
  const [isOpen,      setIsOpen]      = useState(true);
  const [toggling,    setToggling]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoUrl,     setLogoUrl]     = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<any>('/auth/merchant/me')
      .then((res) => {
        const m = (res.data as any)?.merchant;
        if (!m) return;
        setIsOpen(!!m.is_open);
        setLogoUrl(m.store_logo_url || null);
        setForm({
          store_description:     m.store_description     || '',
          min_order_value:       m.min_order_value       != null ? String(m.min_order_value) : '',
          delivery_radius_km:    m.delivery_radius_km    != null ? String(m.delivery_radius_km) : '',
          accepts_cod:           m.accepts_cod           ?? true,
          whatsapp_catalog_link: m.whatsapp_catalog_link || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleStore = async () => {
    setToggling(true);
    try {
      await apiPatch('/auth/merchant/toggle-open');
      setIsOpen((v) => !v);
      toast.success(`Store is now ${!isOpen ? 'open' : 'closed'}`);
    } catch {
      toast.error('Failed to toggle store status');
    } finally {
      setToggling(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch('/auth/merchant/settings', form);
      toast.success('Settings saved!');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setLogoLoading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await apiPostForm<any>('/auth/merchant/logo', fd);
      setLogoUrl((res.data as any)?.logo_url || null);
      toast.success('Store logo updated');
    } catch {
      toast.error('Logo upload failed');
    } finally {
      setLogoLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 max-w-lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="section-heading text-xl">Store Settings</h2>

      {/* Logo upload */}
      <div className="card p-5 flex items-center gap-5">
        <div className="relative flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Store logo"
                 className="w-20 h-20 rounded-2xl object-cover border-2 border-surface-200" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center border-2 border-dashed border-surface-300">
              <Store className="w-8 h-8 text-surface-400" />
            </div>
          )}
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={logoLoading}
            className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-brand-orange
                       flex items-center justify-center shadow-md hover:opacity-90 transition-opacity"
          >
            <Camera className="w-4 h-4 text-white" />
          </button>
          <input
            ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
          />
        </div>
        <div>
          <p className="font-bold text-surface-900">Store Logo</p>
          <p className="text-xs text-surface-500 mt-0.5">
            {logoLoading ? 'Uploading…' : 'Click the camera icon to update your logo (JPG/PNG, max 2MB)'}
          </p>
        </div>
      </div>

      {/* Open / Close toggle */}
      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="font-bold text-surface-900">Store Status</p>
          <p className="text-xs text-surface-500 mt-0.5">
            {isOpen ? 'Customers can see and order from your store' : 'Your store is hidden from customers'}
          </p>
        </div>
        <button
          onClick={toggleStore} disabled={toggling}
          className="flex items-center gap-2 text-sm font-bold transition-colors"
        >
          {isOpen ? (
            <>
              <ToggleRight className="w-8 h-8 text-brand-green" />
              <span className="text-brand-green">Open</span>
            </>
          ) : (
            <>
              <ToggleLeft className="w-8 h-8 text-surface-400" />
              <span className="text-surface-500">Closed</span>
            </>
          )}
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Store Description
          </label>
          <textarea
            value={form.store_description}
            onChange={(e) => setForm((f) => ({ ...f, store_description: e.target.value }))}
            placeholder="Describe your store and what you offer…"
            rows={3} className="input-field resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
              Minimum Order (₹)
            </label>
            <input
              type="number" value={form.min_order_value}
              onChange={(e) => setForm((f) => ({ ...f, min_order_value: e.target.value }))}
              placeholder="e.g. 100" className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
              Delivery Radius (km)
            </label>
            <input
              type="number" value={form.delivery_radius_km}
              onChange={(e) => setForm((f) => ({ ...f, delivery_radius_km: e.target.value }))}
              placeholder="e.g. 5" className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            WhatsApp Catalog Link
          </label>
          <input
            type="url" value={form.whatsapp_catalog_link}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp_catalog_link: e.target.value }))}
            placeholder="https://wa.me/c/…" className="input-field"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setForm((f) => ({ ...f, accepts_cod: !f.accepts_cod }))}
            className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
              form.accepts_cod ? 'bg-brand-green' : 'bg-surface-300'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              form.accepts_cod ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </div>
          <span className="text-sm font-semibold text-surface-700">Accept Cash on Delivery (COD)</span>
        </label>

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Opening Hours Panel ────────────────────────────────────────
type HourEntry = {
  day_of_week: number;
  open_time:   string;
  close_time:  string;
  is_closed:   boolean;
};

const DEFAULT_HOURS: HourEntry[] = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  open_time:   '09:00',
  close_time:  '21:00',
  is_closed:   i === 0, // Sunday closed by default
}));

function OpeningHoursPanel() {
  const [hours,   setHours]   = useState<HourEntry[]>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    apiGet<any>('/auth/merchant/me')
      .then((res) => {
        const oh: any[] = (res.data as any)?.merchant?.operating_hours || [];
        if (oh.length === 7) {
          setHours(
            oh.map((h: any) => ({
              day_of_week: Number(h.day_of_week),
              open_time:   h.open_time   ? h.open_time.slice(0, 5)   : '09:00',
              close_time:  h.close_time  ? h.close_time.slice(0, 5)  : '21:00',
              is_closed:   !!h.is_closed,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateDay = (idx: number, patch: Partial<HourEntry>) => {
    setHours((prev) => prev.map((h, i) => i === idx ? { ...h, ...patch } : h));
  };

  const saveHours = async () => {
    setSaving(true);
    try {
      await api.put('/auth/merchant/hours', { hours });
      toast.success('Operating hours saved');
    } catch {
      toast.error('Failed to save hours');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 max-w-lg">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="section-heading text-xl flex items-center gap-2">
          <Clock className="w-5 h-5" /> Opening Hours
        </h2>
        <p className="text-xs text-surface-500 mt-0.5">
          Set your store hours so customers know when you're open.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-surface-100">
          {hours.map((h, idx) => (
            <div key={h.day_of_week}
                 className={`flex items-center gap-4 px-5 py-4 ${h.is_closed ? 'opacity-50' : ''}`}>
              {/* Day name + closed toggle */}
              <div className="w-28 flex-shrink-0">
                <p className="text-sm font-bold text-surface-900">{DAY_LABELS[h.day_of_week]}</p>
              </div>

              {/* Closed toggle */}
              <button
                onClick={() => updateDay(idx, { is_closed: !h.is_closed })}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex-shrink-0 ${
                  h.is_closed
                    ? 'bg-red-100 text-red-600'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {h.is_closed ? 'Closed' : 'Open'}
              </button>

              {/* Time pickers */}
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time" value={h.open_time} disabled={h.is_closed}
                  onChange={(e) => updateDay(idx, { open_time: e.target.value })}
                  className="input-field py-1.5 text-sm flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <span className="text-xs text-surface-400 flex-shrink-0">to</span>
                <input
                  type="time" value={h.close_time} disabled={h.is_closed}
                  onChange={(e) => updateDay(idx, { close_time: e.target.value })}
                  className="input-field py-1.5 text-sm flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={saveHours} disabled={saving} className="btn-primary w-full max-w-xl">
        {saving ? 'Saving…' : 'Save Opening Hours'}
      </button>
    </div>
  );
}

// ── KYC Panel ─────────────────────────────────────────────────
const KYC_FILE_FIELDS = [
  { key: 'gst_certificate', label: 'GST Certificate',  urlKey: 'gst_certificate_url',  required: false },
  { key: 'pan_card',        label: 'PAN Card',          urlKey: 'pan_card_url',          required: true  },
  { key: 'aadhaar_front',   label: 'Aadhaar Front',     urlKey: 'aadhaar_front_url',     required: true  },
  { key: 'aadhaar_back',    label: 'Aadhaar Back',      urlKey: 'aadhaar_back_url',      required: true  },
  { key: 'shop_license',    label: 'Shop License',      urlKey: 'shop_license_url',      required: false },
  { key: 'food_license',    label: 'FSSAI / Food License', urlKey: 'food_license_url',   required: false },
];

function KYCPanel() {
  const [kyc,       setKyc]       = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [files,     setFiles]     = useState<Record<string, File>>({});
  const [gstin,     setGstin]     = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expanded,  setExpanded]  = useState(false);

  const loadKYC = useCallback(() => {
    setLoading(true);
    apiGet<any>('/auth/merchant/kyc/status')
      .then((res) => setKyc((res.data as any)?.kyc))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadKYC(); }, [loadKYC]);

  const handleFileChange = (key: string, file: File | undefined) => {
    if (!file) return;
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const submitKYC = async () => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(files).forEach(([k, f]) => fd.append(k, f));
      if (gstin)     fd.append('gstin',      gstin);
      if (panNumber) fd.append('pan_number', panNumber);
      await apiPostForm('/auth/merchant/kyc', fd);
      toast.success('KYC documents submitted for review');
      setFiles({});
      loadKYC();
      setExpanded(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="section-heading text-xl">KYC & Verification</h2>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Overall status */}
          <div className={`card p-5 flex items-center gap-4 border-2 ${
            kyc?.kyc_status === 'verified'
              ? 'border-green-200 bg-green-50'
              : kyc?.kyc_status === 'submitted'
                ? 'border-blue-200 bg-blue-50'
                : 'border-orange-200 bg-orange-50'
          }`}>
            {kyc?.kyc_status === 'verified' ? (
              <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-orange-500 flex-shrink-0" />
            )}
            <div>
              <p className="font-bold text-surface-900">
                KYC Status: <span className="capitalize">{kyc?.kyc_status || 'Pending'}</span>
              </p>
              <p className="text-xs text-surface-600 mt-0.5">
                {kyc?.kyc_status === 'verified'
                  ? `Verified on ${kyc.verified_at ? new Date(kyc.verified_at).toLocaleDateString() : 'N/A'}`
                  : kyc?.kyc_status === 'submitted'
                    ? 'Documents under review (1–2 business days)'
                    : 'Submit your documents to go live on MyLocalBazaar'}
              </p>
              {kyc?.rejection_reason && (
                <p className="text-xs text-red-600 mt-1 font-semibold">
                  Rejection reason: {kyc.rejection_reason}
                </p>
              )}
            </div>
          </div>

          {/* Documents list with upload indicators */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50">
              <p className="text-xs font-bold text-surface-500 uppercase tracking-widest">Documents</p>
            </div>
            <div className="divide-y divide-surface-100">
              {KYC_FILE_FIELDS.map(({ key, label, urlKey, required }) => {
                const url = kyc?.[urlKey];
                const staged = !!files[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {url ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : staged ? (
                        <Upload className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-surface-300 flex-shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-surface-900">{label}</span>
                      {required && !url && (
                        <span className="text-[10px] text-red-500 font-bold">Required</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                           className="text-xs font-bold text-brand-green hover:underline">View</a>
                      )}
                      {staged && (
                        <span className="text-xs text-blue-600 font-semibold">Staged</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload form */}
          {kyc?.kyc_status !== 'verified' && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-50 transition-colors"
              >
                <span className="font-bold text-surface-900 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload / Update Documents
                </span>
                <span className="text-surface-400 text-lg">{expanded ? '▲' : '▼'}</span>
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-4 border-t border-surface-100 pt-4">
                      {/* Text fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                            GSTIN
                          </label>
                          <input type="text" value={gstin}
                                 onChange={(e) => setGstin(e.target.value.toUpperCase())}
                                 placeholder="22AAAAA0000A1Z5" maxLength={15}
                                 className="input-field font-mono" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                            PAN Number
                          </label>
                          <input type="text" value={panNumber}
                                 onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                                 placeholder="ABCDE1234F" maxLength={10}
                                 className="input-field font-mono" />
                        </div>
                      </div>

                      {/* File inputs */}
                      <div className="space-y-3">
                        {KYC_FILE_FIELDS.map(({ key, label }) => (
                          <div key={key}>
                            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
                              {label}
                              {files[key] && (
                                <span className="ml-2 text-blue-600 normal-case font-normal">
                                  {files[key].name}
                                </span>
                              )}
                            </label>
                            <input
                              type="file" accept="image/*,.pdf"
                              onChange={(e) => handleFileChange(key, e.target.files?.[0])}
                              className="block w-full text-sm text-surface-600
                                         file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                                         file:text-xs file:font-bold file:bg-surface-100 file:text-surface-700
                                         hover:file:bg-surface-200 file:cursor-pointer cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={submitKYC} disabled={submitting}
                        className="btn-primary w-full"
                      >
                        {submitting ? 'Submitting…' : 'Submit KYC Documents'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Bank Payout Panel ─────────────────────────────────────────
function BankPayoutPanel() {
  const [form, setForm] = useState({
    account_holder_name: '',
    account_number:      '',
    ifsc_code:           '',
    bank_name:           '',
    branch_name:         '',
    upi_id:              '',
  });
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    apiGet<any>('/auth/merchant/bank')
      .then((res) => {
        const b = (res.data as any)?.bank;
        if (!b) return;
        setIsVerified(!!b.is_verified);
        setForm({
          account_holder_name: b.account_holder_name || '',
          account_number:      b.account_number      || '',
          ifsc_code:           b.ifsc_code           || '',
          bank_name:           b.bank_name            || '',
          branch_name:         b.branch_name          || '',
          upi_id:              b.upi_id               || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.account_holder_name || !form.account_number || !form.ifsc_code) {
      toast.error('Account holder name, account number, and IFSC code are required');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/auth/merchant/bank', form);
      toast.success('Bank details saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save bank details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 max-w-lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="section-heading text-xl flex items-center gap-2">
          <CreditCard className="w-5 h-5" /> Bank & Payouts
        </h2>
        <p className="text-xs text-surface-500 mt-0.5">
          Your earnings will be settled to this bank account within 3–5 business days.
        </p>
      </div>

      {isVerified && (
        <div className="card p-4 flex items-center gap-3 border-2 border-green-200 bg-green-50">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-800">
            Bank account verified — payouts are enabled
          </p>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Account Holder Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={form.account_holder_name}
            onChange={(e) => setForm((f) => ({ ...f, account_holder_name: e.target.value }))}
            placeholder="Full name as on bank account" className="input-field"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Account Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={form.account_number}
            onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value.replace(/\D/g, '') }))}
            placeholder="Bank account number" className="input-field font-mono"
            inputMode="numeric"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
              IFSC Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={form.ifsc_code}
              onChange={(e) => setForm((f) => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))}
              placeholder="SBIN0001234" maxLength={11}
              className="input-field font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
              Bank Name
            </label>
            <input
              type="text" value={form.bank_name}
              onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
              placeholder="e.g. State Bank of India" className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            Branch Name
          </label>
          <input
            type="text" value={form.branch_name}
            onChange={(e) => setForm((f) => ({ ...f, branch_name: e.target.value }))}
            placeholder="e.g. Kharghar, Navi Mumbai" className="input-field"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-1.5">
            UPI ID (optional)
          </label>
          <input
            type="text" value={form.upi_id}
            onChange={(e) => setForm((f) => ({ ...f, upi_id: e.target.value }))}
            placeholder="yourname@upi" className="input-field"
          />
        </div>

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : 'Save Bank Details'}
        </button>
      </div>
    </div>
  );
}

// ── Coming Soon ────────────────────────────────────────────────
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">🚧</div>
      <h3 className="font-display text-xl font-bold text-surface-900 mb-2">{label}</h3>
      <p className="text-sm text-surface-500">This section is being built and will be available soon.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MERCHANT DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════
export default function MerchantDashboardPage() {
  const [section, setSection] = useState('analytics');
  const { user, role, isHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && (!user || role !== 'merchant')) {
      router.replace('/merchant/login?redirect=/merchant-dashboard');
    }
  }, [isHydrated, user, role, router]);

  if (!isHydrated || !user) return null;

  const renderSection = () => {
    switch (section) {
      case 'analytics': return <AnalyticsDashboard />;
      case 'products':  return <ProductsTable />;
      case 'orders':    return <OrdersManagement />;
      case 'kyc':       return <KYCPanel />;
      case 'settings':  return <StoreSettings />;
      case 'hours':     return <OpeningHoursPanel />;
      case 'bank':      return <BankPayoutPanel />;
      default:          return <ComingSoon label={section.replace(/-/g, ' ')} />;
    }
  };

  return (
    <DashboardLayout
      nav={NAV}
      title="Merchant Panel"
      subtitle="Store Dashboard"
      role="merchant"
      accentColor="orange"
      activeHref={`#${section}`}
      onNavClick={(href) => setSection(href.replace('#', ''))}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {renderSection()}
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
}

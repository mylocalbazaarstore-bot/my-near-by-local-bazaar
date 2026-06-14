// src/components/checkout/AddressStep.tsx
// ─────────────────────────────────────────────────────────────
// Checkout Step 2 — Delivery Address
// GET /auth/customer/addresses | POST /auth/customer/address
// GET /cart/delivery-charge?address_id=
// ─────────────────────────────────────────────────────────────

'use client';
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Loader2, Check } from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { Address, DeliveryEstimate } from './types';

const LABELS = ['Home', 'Work', 'Other'] as const;

interface AddressFormState {
  label: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  landmark: string;
  pincode: string;
  city: string;
  state: string;
  is_default: boolean;
}

const emptyForm = (fullName = ''): AddressFormState => ({
  label: 'Home',
  full_name: fullName,
  phone: '',
  address_line1: '',
  address_line2: '',
  landmark: '',
  pincode: '',
  city: 'Navi Mumbai',
  state: 'Maharashtra',
  is_default: false,
});

export default function AddressStep({
  selectedAddress, delivery, onSelect, onContinue, onBack,
}: {
  selectedAddress: Address | null;
  delivery: DeliveryEstimate | null;
  onSelect: (address: Address, delivery: DeliveryEstimate | null) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [addresses, setAddresses]             = useState<Address[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const [showForm, setShowForm]               = useState(false);
  const [form, setForm]                       = useState<AddressFormState>(emptyForm());
  const [saving, setSaving]                   = useState(false);

  const fetchDelivery = async (addressId: string): Promise<DeliveryEstimate | null> => {
    setCheckingDelivery(true);
    try {
      const res = await apiGet<DeliveryEstimate>(`/cart/delivery-charge?address_id=${addressId}`);
      return res.data;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return null;
    } finally {
      setCheckingDelivery(false);
    }
  };

  const handleSelect = async (addr: Address) => {
    const est = await fetchDelivery(addr.id);
    onSelect(addr, est);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<{ addresses: Address[] }>('/auth/customer/addresses');
        if (cancelled) return;
        const list = res.data.addresses || [];
        setAddresses(list);
        if (!selectedAddress && list.length > 0) {
          const def = list.find((a) => a.is_default) || list[0];
          handleSelect(def);
        }
        if (list.length === 0) setShowForm(true);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateForm = (field: keyof AddressFormState, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const saveAddress = async () => {
    if (!form.full_name.trim() || !form.phone.trim() || !form.address_line1.trim() || !form.pincode.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    if (!/^\d{6}$/.test(form.pincode.trim())) {
      toast.error('Enter a valid 6-digit pincode');
      return;
    }

    setSaving(true);
    try {
      const res = await apiPost<{ address: Address }>('/auth/customer/address', {
        label: form.label,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        pincode: form.pincode.trim(),
        city: form.city.trim() || 'Navi Mumbai',
        state: form.state.trim() || 'Maharashtra',
        is_default: form.is_default,
      });
      const newAddr = res.data.address;
      setAddresses((prev) => [...prev, newAddr]);
      setShowForm(false);
      setForm(emptyForm(user?.full_name || ''));
      toast.success('Address added');
      await handleSelect(newAddr);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="skeleton h-4 w-1/3 rounded mb-2" />
            <div className="skeleton h-3.5 w-2/3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const deliveryBlocked = !!delivery && !delivery.delivers;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-surface-900 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-brand-green" /> Delivery Address
      </h2>

      <div className="space-y-2">
        {addresses.map((addr) => {
          const active = selectedAddress?.id === addr.id;
          return (
            <button
              key={addr.id}
              onClick={() => handleSelect(addr)}
              className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                active ? 'border-brand-green bg-brand-green/5' : 'border-surface-200 bg-white hover:border-surface-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  active ? 'border-brand-green' : 'border-surface-300'
                }`}>
                  {active && <div className="w-2 h-2 rounded-full bg-brand-green" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge bg-surface-100 text-surface-600 text-[10px]">{addr.label}</span>
                    {addr.is_default && (
                      <span className="badge bg-brand-green/10 text-brand-green text-[10px]">Default</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-surface-900">{addr.full_name} · {addr.phone}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}
                    {addr.landmark ? `, ${addr.landmark}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Delivery availability feedback */}
      {selectedAddress && (
        <div className={`px-4 py-3 rounded-xl text-sm ${deliveryBlocked ? 'bg-red-50 border border-red-200' : 'bg-surface-50'}`}>
          {checkingDelivery ? (
            <span className="flex items-center gap-2 text-surface-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking delivery availability…
            </span>
          ) : delivery ? (
            delivery.delivers ? (
              <span className="flex items-center gap-2 text-green-700">
                <Check className="w-4 h-4" />
                {delivery.is_free_delivery
                  ? 'Free delivery to this address'
                  : `Delivery charge: ₹${(delivery.delivery_charge ?? 0).toFixed(2)}`}
                {' '}({delivery.distance_km.toFixed(1)} km away)
              </span>
            ) : (
              <span className="text-red-600">{delivery.message || 'This address is outside the store’s delivery zone'}</span>
            )
          ) : null}
        </div>
      )}

      {/* Add new address */}
      {!showForm ? (
        <button
          onClick={() => { setForm(emptyForm(user?.full_name || '')); setShowForm(true); }}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border border-dashed
                     border-surface-300 text-surface-600 text-sm font-bold hover:border-brand-green hover:text-brand-green transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New Address
        </button>
      ) : (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-bold text-surface-900">New Address</h3>

          <div className="flex gap-2">
            {LABELS.map((l) => (
              <button
                key={l}
                onClick={() => updateForm('label', l)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  form.label === l ? 'border-brand-green bg-brand-green/10 text-brand-green' : 'border-surface-200 text-surface-600'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <input
            value={form.full_name}
            onChange={(e) => updateForm('full_name', e.target.value)}
            placeholder="Recipient name *"
            className="input-field"
          />
          <input
            value={form.phone}
            onChange={(e) => updateForm('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Mobile number *"
            className="input-field"
          />
          <input
            value={form.address_line1}
            onChange={(e) => updateForm('address_line1', e.target.value)}
            placeholder="Address line 1 (house no, street) *"
            className="input-field"
          />
          <input
            value={form.address_line2}
            onChange={(e) => updateForm('address_line2', e.target.value)}
            placeholder="Address line 2 (optional)"
            className="input-field"
          />
          <input
            value={form.landmark}
            onChange={(e) => updateForm('landmark', e.target.value)}
            placeholder="Landmark (optional)"
            className="input-field"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.pincode}
              onChange={(e) => updateForm('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Pincode *"
              className="input-field"
            />
            <input
              value={form.city}
              onChange={(e) => updateForm('city', e.target.value)}
              placeholder="City"
              className="input-field"
            />
          </div>
          <input
            value={form.state}
            onChange={(e) => updateForm('state', e.target.value)}
            placeholder="State"
            className="input-field"
          />

          <label className="flex items-center gap-2 text-sm text-surface-600">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => updateForm('is_default', e.target.checked)}
            />
            Set as default address
          </label>

          <div className="flex gap-2">
            {addresses.length > 0 && (
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">
                Cancel
              </button>
            )}
            <button onClick={saveAddress} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Address'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-ghost flex-1">← Back</button>
        <button
          onClick={onContinue}
          disabled={!selectedAddress || checkingDelivery || deliveryBlocked}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          Continue to Coupon →
        </button>
      </div>
    </div>
  );
}

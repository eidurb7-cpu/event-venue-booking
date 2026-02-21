import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { services } from '../data/mockData';
import { createRequest, getServiceCatalog } from '../utils/api';
import { getCurrentUser } from '../utils/auth';

export default function RequestPage() {
  const fallbackCategories = useMemo(() => Array.from(new Set(services.map((s) => s.category))), []);
  const [categories, setCategories] = useState<string[]>(fallbackCategories);
  const [submittedId, setSubmittedId] = useState('');
  const [isCustomerSession, setIsCustomerSession] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    selectedServices: [] as string[],
    budget: '',
    offerResponseHours: '48',
    eventDate: '',
    address: '',
    notes: '',
  });

  useEffect(() => {
    getServiceCatalog()
      .then((data) => {
        const dbCategories = Array.from(new Set(data.services.map((s) => s.category)));
        if (dbCategories.length > 0) setCategories(dbCategories);
      })
      .catch(() => {
        setCategories(fallbackCategories);
      });
  }, [fallbackCategories]);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current || current.role !== 'customer') return;
    setIsCustomerSession(true);
    setForm((prev) => ({
      ...prev,
      customerName: prev.customerName || current.user.name || '',
      customerEmail: prev.customerEmail || current.user.email || '',
    }));
  }, []);

  const toggleService = (category: string) => {
    setForm((prev) => ({
      ...prev,
      selectedServices: prev.selectedServices.includes(category)
        ? prev.selectedServices.filter((c) => c !== category)
        : [...prev.selectedServices, category],
    }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.customerEmail || !form.budget || form.selectedServices.length === 0) return;
    setIsSubmitting(true);
    setError('');
    try {
      const data = await createRequest({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone || undefined,
        selectedServices: form.selectedServices,
        budget: Number(form.budget),
        offerResponseHours: Number(form.offerResponseHours),
        eventDate: form.eventDate || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      setSubmittedId(data.request.id);
      setForm({
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        selectedServices: [],
        budget: '',
        offerResponseHours: '48',
        eventDate: '',
        address: '',
        notes: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden der Anfrage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Anfrage / Offer erstellen</h1>
          <p className="text-gray-600 mb-6">
            Waehle die gewuenschten Dienstleistungen und dein Budget. Vendor koennen sich danach auf deine Anfrage bewerben.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                  disabled={isCustomerSession}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  required
                  value={form.customerEmail}
                  onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))}
                  disabled={isCustomerSession}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Telefon (optional)</label>
                <input
                  type="tel"
                  value={form.customerPhone}
                  onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  placeholder="+49 ..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Dienstleistungen</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const selected = form.selectedServices.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleService(category)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        selected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Budget (EUR)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.budget}
                  onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Event-Datum (optional)</label>
                <input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Event-Adresse (optional)</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Strasse, Stadt, PLZ"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Antwortfrist fuer Vendor</label>
              <select
                value={form.offerResponseHours}
                onChange={(e) => setForm((p) => ({ ...p, offerResponseHours: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              >
                <option value="24">24 Stunden</option>
                <option value="48">48 Stunden</option>
                <option value="72">72 Stunden</option>
                <option value="120">5 Tage</option>
                <option value="168">7 Tage</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Nach Ablauf der Frist wird die Anfrage automatisch als abgelaufen markiert.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Kurzbeschreibung</label>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Was genau brauchst du? Zeitfenster, Stil, besondere Anforderungen..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-purple-600 text-white py-3 font-medium hover:bg-purple-700 transition-colors"
            >
              {isSubmitting ? 'Wird gesendet...' : 'Anfrage senden'}
            </button>
          </form>

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {submittedId && (
            <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Anfrage gesendet ({submittedId}). Vendor koennen jetzt Angebote abgeben.
            </div>
          )}

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
            <Link to="/customer-portfolio" className="text-purple-600 hover:text-purple-700">
              Zu meinem Portfolio (Anfragen & Angebote)
            </Link>
            <Link to="/vendor-portfolio" className="text-gray-700 hover:text-gray-900">
              Vendor Portfolio (Demo)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

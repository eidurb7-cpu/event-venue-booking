import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getCustomerRequests } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { InvoiceItem, InvoiceStatus, mapRequestsToInvoices } from '../utils/invoices';

const statusClasses: Record<InvoiceStatus, string> = {
  Paid: 'bg-green-100 text-green-700',
  Pending: 'bg-amber-100 text-amber-700',
  Overdue: 'bg-red-100 text-red-700',
};

export default function Invoices() {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | InvoiceStatus>('All');

  useEffect(() => {
    const current = getCurrentUser();
    if (!current || current.role !== 'customer' || !current.user.email) {
      setError('Bitte zuerst als Kunde einloggen.');
      return;
    }

    setCustomerName(current.user.name || '');
    setCustomerEmail(current.user.email);

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getCustomerRequests(current.user.email);
        const items = mapRequestsToInvoices(data.requests, customerName || current.user.name || 'Customer');
        setInvoices(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Rechnungen.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [customerName]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((item) => {
      const byStatus = statusFilter === 'All' || item.status === statusFilter;
      const q = search.trim().toLowerCase();
      const bySearch = !q || item.id.toLowerCase().includes(q) || item.client.toLowerCase().includes(q);
      return byStatus && bySearch;
    });
  }, [invoices, search, statusFilter]);

  return (
    <div className="min-h-screen bg-white py-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A1A1A]">Invoices</h1>
          <p className="mt-1 text-sm text-[#666666]">
            {customerEmail
              ? `Account: ${customerName || customerEmail} (${customerEmail})`
              : 'A searchable list of your generated invoices'}
          </p>
        </div>

        <div className="mb-4 rounded-xl border border-[#E0E0E0] bg-[#F5F5F5] p-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or invoice #"
            className="w-full rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#7C9CB4]"
          />
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {(['All', 'Paid', 'Pending', 'Overdue'] as const).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setStatusFilter(chip)}
              className={`whitespace-nowrap rounded-xl border px-4 py-2 text-sm ${
                statusFilter === chip
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-[#E0E0E0] bg-[#F5F5F5] text-[#666666]'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {loading && <div className="rounded-lg border border-[#E0E0E0] p-4 text-sm text-[#666666]">Loading invoices...</div>}

        {!loading && filteredInvoices.length === 0 && (
          <div className="rounded-xl border border-[#E0E0E0] bg-[#F5F5F5] p-5 text-sm text-[#666666]">No invoices found.</div>
        )}

        <div className="space-y-3">
          {filteredInvoices.map((item) => (
            <Link
              key={item.id}
              to={`/invoice/${encodeURIComponent(item.id)}`}
              className="block rounded-xl border border-[#E0E0E0] bg-[#F5F5F5] p-4 hover:border-[#C4836A] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[#1A1A1A]">{item.id}</p>
                  <p className="truncate text-sm text-[#666666]">{item.client}</p>
                </div>
                <span className={`rounded-md px-3 py-1 text-xs font-semibold ${statusClasses[item.status]}`}>{item.status}</span>
              </div>
              <div className="mt-3 h-px bg-[#E0E0E0]" />
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#A0A0A0]">Due Date</p>
                  <p className="text-sm font-medium text-[#1A1A1A]">{item.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-[#A0A0A0]">Amount</p>
                  <p className="text-lg font-extrabold text-[#1A1A1A]">EUR {item.total.toLocaleString()}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <Link to="/customer-portfolio" className="text-sm text-[#7C9CB4] hover:underline">
            Back to Customer Portfolio
          </Link>
        </div>
      </div>
    </div>
  );
}

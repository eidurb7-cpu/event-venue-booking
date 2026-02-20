import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getCustomerRequests } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { InvoiceItem, mapRequestsToInvoices } from '../utils/invoices';

const statusClasses: Record<string, string> = {
  Paid: 'bg-green-100 text-green-700',
  Pending: 'bg-amber-100 text-amber-700',
  Overdue: 'bg-red-100 text-red-700',
};

export default function InvoiceDetail() {
  const { invoiceId = '' } = useParams();
  const [invoice, setInvoice] = useState<InvoiceItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const decodedId = useMemo(() => decodeURIComponent(invoiceId), [invoiceId]);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current || current.role !== 'customer' || !current.user.email) {
      setError('Bitte zuerst als Kunde einloggen.');
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getCustomerRequests(current.user.email);
        const invoices = mapRequestsToInvoices(data.requests, current.user.name || 'Customer');
        const found = invoices.find((i) => i.id === decodedId) || null;
        if (!found) {
          setError('Rechnung nicht gefunden.');
        }
        setInvoice(found);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Rechnung.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [decodedId]);

  return (
    <div className="min-h-screen bg-white py-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link to="/invoices" className="text-sm text-[#7C9CB4] hover:underline">
            Back to invoices
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#EEEEEE]"
          >
            Print / PDF
          </button>
        </div>

        {loading && <div className="rounded-xl border border-[#E0E0E0] p-4 text-sm text-[#666666]">Loading invoice...</div>}
        {error && !loading && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {invoice && !loading && (
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A1A1A]">Invoice</h1>
                <p className="mt-1 text-sm text-[#666666]">{invoice.id}</p>
              </div>
              <span className={`rounded-md px-3 py-1 text-xs font-semibold ${statusClasses[invoice.status] || ''}`}>
                {invoice.status}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[#A0A0A0]">Billed To</p>
                <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">{invoice.client}</p>
                {invoice.address && <p className="mt-1 text-sm text-[#666666]">{invoice.address}</p>}
              </div>
              <div className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[#A0A0A0]">Invoice Date</p>
                <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">{invoice.date}</p>
                {invoice.eventDate && (
                  <>
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-[#A0A0A0]">Event Date</p>
                    <p className="mt-1 text-sm text-[#666666]">{new Date(invoice.eventDate).toLocaleDateString()}</p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-[#E0E0E0]">
              <table className="w-full text-sm">
                <thead className="bg-[#F5F5F5] text-[#666666]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Description</th>
                    <th className="px-3 py-2 text-left font-semibold">Vendor</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#E0E0E0]">
                    <td className="px-3 py-2 text-[#1A1A1A]">{invoice.services.join(', ') || 'Event Service'}</td>
                    <td className="px-3 py-2 text-[#666666]">{invoice.vendorName}</td>
                    <td className="px-3 py-2 text-right text-[#1A1A1A]">EUR {invoice.subtotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {invoice.notes && (
              <div className="mt-4 rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-3 text-sm text-[#666666]">
                <span className="font-semibold text-[#1A1A1A]">Notes:</span> {invoice.notes}
              </div>
            )}

            <div className="mt-6 ml-auto w-full sm:w-72 rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-4">
              <div className="flex items-center justify-between text-sm text-[#666666]">
                <span>Subtotal</span>
                <span className="text-[#1A1A1A]">EUR {invoice.subtotal.toLocaleString()}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-[#666666]">
                <span>VAT ({Math.round(invoice.vatRate * 100)}%)</span>
                <span className="text-[#1A1A1A]">EUR {invoice.vatAmount.toLocaleString()}</span>
              </div>
              <div className="mt-3 h-px bg-[#E0E0E0]" />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-base font-bold text-[#1A1A1A]">Total</span>
                <span className="text-xl font-extrabold text-[#1A1A1A]">EUR {invoice.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

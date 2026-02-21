import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { MapPin, Users, Check, Calendar as CalendarIcon, Trash2, ArrowRight } from 'lucide-react';
import { venues, services } from '../data/mockData';
import { ServiceCard } from '../components/ServiceCard';
import { useLanguage } from '../context/LanguageContext';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { getCurrentUser } from '../utils/auth';
import { useCart } from '../context/CartContext';
import { toCartVenue } from '../types/cart';

type SavedVenueState = {
  selectedDate: string;
  estimatedGuests: string;
};

export default function VenueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { cart, setVenue, toggleService, hasService, removeService, total } = useCart();
  const venue = venues.find((v) => v.id === id);

  const [selectedDate, setSelectedDate] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [estimatedGuests, setEstimatedGuests] = useState('50');
  const [payNowLoading, setPayNowLoading] = useState(false);
  const [saveLaterLoading, setSaveLaterLoading] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const currentUser = getCurrentUser();
  const isBookingBlockedForRole = currentUser?.role === 'vendor' || currentUser?.role === 'admin';
  const venueStateStorageKey = venue ? `venueState:${venue.id}` : '';
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const FRONTEND_BASE_URL = import.meta.env.VITE_FRONTEND_BASE_URL || window.location.origin;

  useEffect(() => {
    if (!venueStateStorageKey) return;
    try {
      const raw = localStorage.getItem(venueStateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedVenueState;
      if (typeof parsed.selectedDate === 'string') setSelectedDate(parsed.selectedDate);
      if (typeof parsed.estimatedGuests === 'string') setEstimatedGuests(parsed.estimatedGuests);
    } catch {
      // Ignore invalid state.
    }
  }, [venueStateStorageKey]);

  useEffect(() => {
    if (!venueStateStorageKey) return;
    localStorage.setItem(venueStateStorageKey, JSON.stringify({ selectedDate, estimatedGuests }));
  }, [venueStateStorageKey, selectedDate, estimatedGuests]);

  useEffect(() => {
    if (!venue) return;
    if (cart.venue?.id === venue.id) return;
    setVenue(toCartVenue(venue));
  }, [venue, cart.venue?.id, setVenue]);

  if (!venue) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('venue.notFound.title')}</h1>
          <Link to="/venues" className="text-purple-600 hover:text-purple-700">
            {t('venue.back')}
          </Link>
        </div>
      </div>
    );
  }

  const handleToggleService = (serviceId: string, providerId: string) => {
    const service = services.find((s) => s.id === serviceId);
    const provider = service?.providers.find((p) => p.id === providerId);
    if (!service || !provider) return;
    toggleService({
      id: `${serviceId}:${providerId}`,
      title: `${service.name} - ${provider.name}`,
      price: provider.price,
      category: service.category,
      serviceId,
      providerId,
    });
  };

  const handleCompleteBookingFromService = (serviceId: string, providerId: string) => {
    if (!hasService(`${serviceId}:${providerId}`)) handleToggleService(serviceId, providerId);
    if (cart.venue?.id !== venue.id) setVenue(toCartVenue(venue));
    navigate('/cart');
  };

  const selectedServices = useMemo(
    () =>
      cart.services
        .map((item) => {
          const service = services.find((s) => s.id === item.serviceId);
          const provider = service?.providers.find((p) => p.id === item.providerId);
          return { item, service, provider };
        })
        .filter((entry) => entry.service && entry.provider),
    [cart.services],
  );

  const calculateTotal = () => {
    const guests = Number.parseInt(estimatedGuests, 10);
    const guestsForEstimate = Number.isFinite(guests) && guests > 0 ? guests : 1;
    const servicesTotal = selectedServices.reduce((sum, entry) => {
      if (entry.service?.category === 'catering') return sum + entry.provider!.price * guestsForEstimate;
      return sum + entry.provider!.price;
    }, 0);
    return (cart.venue?.price ?? 0) + servicesTotal;
  };

  const handleProceedToBooking = () => {
    if (isBookingBlockedForRole) {
      alert('Please use a customer account to continue.');
      return;
    }
    if (!selectedDate) {
      alert(t('venue.alert.selectDate'));
      return;
    }
    if (venue.bookedDates.includes(selectedDate)) {
      alert(t('venue.alert.notAvailable'));
      return;
    }
    const bookingData = {
      venue,
      selectedDate,
      estimatedGuests,
      selectedProviders: selectedServices.map((entry) => ({
        service: entry.service,
        provider: entry.provider,
        quantity: 1,
      })),
    };
    sessionStorage.setItem('bookingData', JSON.stringify(bookingData));
    navigate('/booking');
  };

  const handlePayNow = async () => {
    if (isBookingBlockedForRole) {
      alert('Please use a customer account for checkout.');
      return;
    }
    if (!cart.venue) {
      alert('Select a venue to continue.');
      return;
    }
    setPayNowLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart,
          customer: bookingForm,
          successUrl: `${FRONTEND_BASE_URL}/checkout/success`,
          cancelUrl: `${FRONTEND_BASE_URL}/cart`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Checkout error: ${body?.error || res.statusText}`);
        return;
      }
      const data = (await res.json()) as { url?: string | null };
      if (!data?.url) {
        alert('Checkout URL missing. Please try again.');
        return;
      }
      window.location.href = data.url;
    } finally {
      setPayNowLoading(false);
    }
  };

  const submitCompleteBookingForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingForm.name.trim() || !bookingForm.email.trim()) {
      alert('Please enter name and email.');
      return;
    }
    await handlePayNow();
  };

  const handleSaveForLater = () => {
    if (!cart.venue) {
      alert('Select a venue to continue.');
      return;
    }
    setSaveLaterLoading(true);
    setTimeout(() => {
      setSaveLaterLoading(false);
      alert('Saved. You can continue later from Cart.');
      navigate('/cart');
    }, 200);
  };

  const hasCateringSelected = selectedServices.some((entry) => entry.service?.category === 'catering');
  const isVenueAvailable = selectedDate ? !venue.bookedDates.includes(selectedDate) : true;
  const today = new Date().toISOString().split('T')[0];
  const selectedDateObj = selectedDate ? new Date(`${selectedDate}T00:00:00`) : undefined;
  const displayDate = selectedDateObj
    ? selectedDateObj.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';
  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const isBookedDate = (date: Date) => venue.bookedDates.includes(formatDate(date));
  const isAvailableDate = (date: Date) => formatDate(date) >= today && !isBookedDate(date);

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="container mx-auto px-4">
        <Link to="/venues" className="text-purple-600 hover:text-purple-700 mb-6 inline-block">
          {t('venue.back')}
        </Link>

        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6 sm:mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            <div className="h-64 sm:h-80 lg:h-auto">
              <img src={venue.image} alt={venue.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-5 sm:p-8">
              <div className="inline-block bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-sm mb-4">{venue.type}</div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-4">{venue.name}</h1>
              <p className="text-gray-600 mb-6">{venue.description}</p>
              <div className="flex items-center gap-6 mb-6 text-gray-600">
                <div className="flex items-center gap-2"><MapPin className="size-5" /><span>{venue.location}</span></div>
                <div className="flex items-center gap-2"><Users className="size-5" /><span>{t('venue.guests', { count: venue.capacity })}</span></div>
              </div>
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">{t('venue.features')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {venue.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-gray-600"><Check className="size-4 text-purple-600" /><span className="text-sm">{feature}</span></div>
                  ))}
                </div>
              </div>
              <div className="pt-6 border-t">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold text-purple-600">${venue.price.toLocaleString()}</span>
                  <span className="text-gray-500">{t('venue.perEvent')}</span>
                </div>
                <button type="button" onClick={() => setVenue(toCartVenue(venue))} className="rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
                  {cart.venue?.id === venue.id ? 'Added ✓' : 'Add venue to cart'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{t('venue.services.title')}</h2>
          <p className="text-gray-600 mb-8">{t('venue.services.desc')}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                selectedProviderIds={service.providers.filter((provider) => hasService(`${service.id}:${provider.id}`)).map((provider) => provider.id)}
                onAddToCart={handleToggleService}
                onCompleteBooking={handleCompleteBookingFromService}
                selectedDate={selectedDate}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 sm:p-8 sticky bottom-2 sm:bottom-4">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1 grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <div className="flex items-center gap-2 mb-2"><CalendarIcon className="size-5 text-purple-600" /><h3 className="font-semibold text-gray-900">{t('venue.eventDate')}</h3></div>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className="w-full max-w-sm flex items-center justify-between gap-3 text-left px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg hover:border-purple-300 focus:ring-2 focus:ring-purple-600 focus:border-transparent">
                      <span>{selectedDate ? displayDate : t('venue.selectDate')}</span>
                      <CalendarIcon className="size-5 text-purple-600" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(92vw,340px)] sm:w-auto p-2">
                    <Calendar
                      mode="single"
                      selected={selectedDateObj}
                      onSelect={(date) => {
                        if (!date) return;
                        setSelectedDate(formatDate(date));
                        setIsCalendarOpen(false);
                      }}
                      fromDate={new Date(`${today}T00:00:00`)}
                      modifiers={{ booked: isBookedDate, available: isAvailableDate }}
                      modifiersClassNames={{ booked: 'bg-red-100 text-red-700 hover:bg-red-200', available: 'bg-green-100 text-green-700 hover:bg-green-200' }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                {hasCateringSelected && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Guests (for catering estimate)</label>
                    <input type="number" min={1} value={estimatedGuests} onChange={(e) => setEstimatedGuests(e.target.value)} className="w-full max-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent" />
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 mb-2">{t('venue.summary.title')}</h3>
                <div className="text-2xl sm:text-3xl font-bold text-purple-600">EUR {calculateTotal().toLocaleString()}</div>
                <p className="text-xs text-gray-500 mt-2">Global cart total: EUR {total.toLocaleString()}</p>
              </div>
            </div>

            <div className="w-full lg:w-[360px] border border-gray-200 rounded-lg p-3 sm:p-4 bg-gray-50">
              <h4 className="font-semibold text-gray-900 mb-2">{language === 'de' ? 'Warenkorb' : 'Cart'}</h4>
              {selectedServices.length === 0 ? (
                <p className="text-sm text-gray-600">{language === 'de' ? 'Noch keine Services hinzugefuegt.' : 'No services added yet.'}</p>
              ) : (
                <div className="space-y-3 max-h-56 overflow-auto pr-1">
                  {selectedServices.map(({ item, service, provider }) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-2.5">
                      <p className="text-sm font-medium text-gray-900">{provider!.name}</p>
                      <p className="text-xs text-gray-500">{service!.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-purple-700">EUR {provider!.price.toLocaleString()}</p>
                        <button type="button" onClick={() => removeService(item.id)} className="inline-flex items-center gap-1 rounded border border-red-200 text-red-600 px-2 py-1 text-xs hover:bg-red-50">
                          <Trash2 className="size-3.5" />
                          {language === 'de' ? 'Entfernen' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link to="/cart" className="mt-3 inline-flex text-sm font-medium text-purple-700 hover:text-purple-900">
                {language === 'de' ? 'Zum Warenkorb' : 'Go to cart'}
              </Link>
            </div>

            <div className="w-full lg:w-auto flex flex-col gap-2">
              <button onClick={() => setShowCheckoutForm((prev) => !prev)} disabled={!cart.venue || payNowLoading || isBookingBlockedForRole} className="w-full lg:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">
                {payNowLoading ? 'Starting checkout...' : isBookingBlockedForRole ? 'Customers only' : 'Complete booking'}
                <ArrowRight className="size-5" />
              </button>
              <button onClick={handleSaveForLater} disabled={!cart.venue || saveLaterLoading} className="w-full lg:w-auto rounded-lg border border-purple-300 bg-white px-6 sm:px-8 py-3 sm:py-4 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:bg-gray-100 disabled:text-gray-400">
                {saveLaterLoading ? 'Saving...' : 'Save for later'}
              </button>
              <button onClick={handleProceedToBooking} disabled={(selectedDate && !isVenueAvailable) || isBookingBlockedForRole} className="w-full lg:w-auto rounded-lg border border-gray-300 bg-white px-6 sm:px-8 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400">
                {isBookingBlockedForRole ? (language === 'de' ? 'Nur fuer Kundenkonto' : 'Customers only') : t('venue.summary.proceed')}
              </button>
            </div>
          </div>

          {showCheckoutForm && (
            <form onSubmit={submitCompleteBookingForm} className="mt-4 rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Complete booking</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" required placeholder="Full name" value={bookingForm.name} onChange={(e) => setBookingForm((p) => ({ ...p, name: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2.5" />
                <input type="email" required placeholder="Email" value={bookingForm.email} onChange={(e) => setBookingForm((p) => ({ ...p, email: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2.5" />
                <input type="tel" placeholder="Phone (optional)" value={bookingForm.phone} onChange={(e) => setBookingForm((p) => ({ ...p, phone: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2.5" />
                <input type="text" placeholder="Short note (optional)" value={bookingForm.notes} onChange={(e) => setBookingForm((p) => ({ ...p, notes: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2.5" />
              </div>
              <button type="submit" disabled={!cart.venue || payNowLoading || isBookingBlockedForRole} className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
                {payNowLoading ? 'Starting checkout...' : 'Pay now'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

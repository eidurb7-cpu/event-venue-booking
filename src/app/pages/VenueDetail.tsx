import { useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { MapPin, Users, Check, ArrowRight, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { venues, services } from '../data/mockData';
import { ServiceCard } from '../components/ServiceCard';
import { useLanguage } from '../context/LanguageContext';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { getCurrentUser } from '../utils/auth';

type CartItem = {
  serviceId: string;
  providerId: string;
  quantity: number;
};

export default function VenueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const venue = venues.find((v) => v.id === id);

  const [selectedDate, setSelectedDate] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [estimatedGuests, setEstimatedGuests] = useState('50');
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const checkoutSectionRef = useRef<HTMLDivElement | null>(null);
  const cartSectionRef = useRef<HTMLDivElement | null>(null);
  const currentUser = getCurrentUser();
  const isBookingBlockedForRole = currentUser?.role === 'vendor' || currentUser?.role === 'admin';

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

  const handleAddToCart = (serviceId: string, providerId: string) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.serviceId === serviceId && item.providerId === providerId);
      if (existingIndex >= 0) {
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: Math.min(item.quantity + 1, 20) }
            : item
        );
      }
      return [...prev, { serviceId, providerId, quantity: 1 }];
    });
  };

  const handleUpdateCartQuantity = (serviceId: string, providerId: string, quantity: number) => {
    const safeQty = Number.isFinite(quantity) ? Math.max(1, Math.min(20, quantity)) : 1;
    setCartItems((prev) =>
      prev.map((item) =>
        item.serviceId === serviceId && item.providerId === providerId ? { ...item, quantity: safeQty } : item
      )
    );
  };

  const handleRemoveFromCart = (serviceId: string, providerId: string) => {
    setCartItems((prev) => prev.filter((item) => !(item.serviceId === serviceId && item.providerId === providerId)));
  };

  const calculateTotal = () => {
    let total = venue.price;
    const parsedGuests = Number.parseInt(estimatedGuests, 10);
    const guestsForEstimate = Number.isFinite(parsedGuests) && parsedGuests > 0 ? parsedGuests : 1;

    cartItems.forEach(({ serviceId, providerId, quantity }) => {
      const service = services.find((s) => s.id === serviceId);
      const provider = service?.providers.find((p) => p.id === providerId);
      if (provider) {
        if (service?.category === 'catering') {
          // Catering is per person; use live guest estimate for immediate total feedback.
          total += provider.price * guestsForEstimate;
        } else {
          total += provider.price * quantity;
        }
      }
    });

    return total;
  };

  const handleProceedToBooking = () => {
    if (currentUser?.role === 'vendor') {
      alert('Vendor accounts are view-only for booking pages. Please use a customer account to book.');
      return;
    }
    if (currentUser?.role === 'admin') {
      alert('Admin accounts cannot place bookings. Please use a customer account.');
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
      selectedProviders: cartItems
        .map((item) => {
          const { serviceId, providerId, quantity } = item;
          const service = services.find((s) => s.id === serviceId);
          const provider = service?.providers.find((p) => p.id === providerId);
          return { service, provider, quantity };
        })
        .filter((item) => item.service && item.provider)
    };

    sessionStorage.setItem('bookingData', JSON.stringify(bookingData));
    navigate('/booking');
  };

  const guideToCompleteBooking = () => {
    checkoutSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const guideToCart = () => {
    cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const hasSelectedProviders = cartItems.length > 0;
  const hasCateringSelected = cartItems.some((item) => item.serviceId === 'catering');
  const isVenueAvailable = selectedDate ? !venue.bookedDates.includes(selectedDate) : true;
  const today = new Date().toISOString().split('T')[0];
  const selectedDateObj = selectedDate ? new Date(`${selectedDate}T00:00:00`) : undefined;

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isBookedDate = (date: Date) => venue.bookedDates.includes(formatDate(date));
  const isAvailableDate = (date: Date) => formatDate(date) >= today && !isBookedDate(date);
  const displayDate = selectedDateObj
    ? selectedDateObj.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '';

  const handleDateSelect = (date?: Date) => {
    if (!date) return;
    setSelectedDate(formatDate(date));
    setIsCalendarOpen(false);
  };

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
              <div className="inline-block bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-sm mb-4">
                {venue.type}
              </div>

              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-4">{venue.name}</h1>
              <p className="text-gray-600 mb-6">{venue.description}</p>

              <div className="flex items-center gap-6 mb-6 text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="size-5" />
                  <span>{venue.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="size-5" />
                  <span>{t('venue.guests', { count: venue.capacity })}</span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">{t('venue.features')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {venue.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-gray-600">
                      <Check className="size-4 text-purple-600" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold text-purple-600">${venue.price.toLocaleString()}</span>
                  <span className="text-gray-500">{t('venue.perEvent')}</span>
                </div>
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
                selectedProviderIds={cartItems.filter((item) => item.serviceId === service.id).map((item) => item.providerId)}
                onAddToCart={handleAddToCart}
                selectedDate={selectedDate}
              />
            ))}
          </div>
        </div>

        <div ref={checkoutSectionRef} className="bg-white rounded-xl shadow-md p-4 sm:p-8 sticky bottom-2 sm:bottom-4">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1 grid gap-6 lg:grid-cols-2 lg:items-end">
              <div ref={datePickerRef}>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="size-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-900">{t('venue.eventDate')}</h3>
                </div>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full max-w-sm flex items-center justify-between gap-3 text-left px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg hover:border-purple-300 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    >
                      <span>{selectedDate ? displayDate : t('venue.selectDate')}</span>
                      <CalendarIcon className="size-5 text-purple-600" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(92vw,340px)] sm:w-auto p-2">
                    <Calendar
                      mode="single"
                      selected={selectedDateObj}
                      onSelect={handleDateSelect}
                      fromDate={new Date(`${today}T00:00:00`)}
                      modifiers={{
                        booked: isBookedDate,
                        available: isAvailableDate,
                      }}
                      modifiersClassNames={{
                        booked: 'bg-red-100 text-red-700 hover:bg-red-200',
                        available: 'bg-green-100 text-green-700 hover:bg-green-200',
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-gray-500 w-full sm:w-auto">{t('venue.calendar.hint')}</span>
                  <span className="flex items-center gap-2 text-gray-600">
                    <span className="inline-block size-3 rounded bg-green-200 border border-green-300" />
                    {t('venue.calendar.available')}
                  </span>
                  <span className="flex items-center gap-2 text-gray-600">
                    <span className="inline-block size-3 rounded bg-red-200 border border-red-300" />
                    {t('venue.calendar.booked')}
                  </span>
                </div>
                <div className="mt-3 min-h-8 flex items-center">
                  {selectedDate && (
                    <div
                      className={`inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-1 text-xs sm:text-sm ${
                        isVenueAvailable
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      <span className="font-medium">{t('venue.dateConfirmed', { date: displayDate })}</span>
                      <span className="opacity-75">-</span>
                      <span>{isVenueAvailable ? t('venue.calendar.available') : t('venue.calendar.booked')}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                {hasCateringSelected && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Gaeste (Catering-Kalkulation)</label>
                    <input
                      type="number"
                      min={1}
                      value={estimatedGuests}
                      onChange={(e) => setEstimatedGuests(e.target.value)}
                      className="w-full max-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    />
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 mb-2">{t('venue.summary.title')}</h3>
                <div className="text-2xl sm:text-3xl font-bold text-purple-600">${calculateTotal().toLocaleString()}</div>
                {hasSelectedProviders && (
                  <p className="text-sm text-gray-600 mt-1">
                    {t('venue.summary.services', {
                      count: cartItems.length
                    })}
                  </p>
                )}
                {hasCateringSelected && (
                  <p className="text-xs text-gray-500 mt-1">inkl. Catering fuer ca. {Number.parseInt(estimatedGuests, 10) || 1} Gaeste</p>
                )}
                <p className="text-xs text-gray-500 mt-2">{t('venue.summary.note')}</p>
              </div>
            </div>

            <div ref={cartSectionRef} className="w-full lg:w-[360px] border border-gray-200 rounded-lg p-3 sm:p-4 bg-gray-50">
              <h4 className="font-semibold text-gray-900 mb-2">
                {language === 'de' ? 'Warenkorb' : 'Cart'}
              </h4>
              {cartItems.length === 0 ? (
                <p className="text-sm text-gray-600">
                  {language === 'de' ? 'Noch keine Services hinzugefuegt.' : 'No services added yet.'}
                </p>
              ) : (
                <div className="space-y-3 max-h-56 overflow-auto pr-1">
                  {cartItems.map((item) => {
                    const service = services.find((s) => s.id === item.serviceId);
                    const provider = service?.providers.find((p) => p.id === item.providerId);
                    if (!service || !provider) return null;

                    return (
                      <div key={`${item.serviceId}-${item.providerId}`} className="rounded-lg border border-gray-200 bg-white p-2.5">
                        <p className="text-sm font-medium text-gray-900">{provider.name}</p>
                        <p className="text-xs text-gray-500">{service.name}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {service.category === 'catering' ? (
                            <p className="text-xs text-gray-600">
                              {language === 'de' ? 'Menge basiert auf Gaesten' : 'Quantity based on guests'}
                            </p>
                          ) : (
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={item.quantity}
                              onChange={(e) => handleUpdateCartQuantity(item.serviceId, item.providerId, Number.parseInt(e.target.value || '1', 10))}
                              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(item.serviceId, item.providerId)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
                          >
                            <Trash2 className="size-3.5" />
                            {language === 'de' ? 'Entfernen' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleProceedToBooking}
              disabled={!selectedDate || !isVenueAvailable || isBookingBlockedForRole}
              className="w-full lg:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isBookingBlockedForRole ? (language === 'de' ? 'Nur fuer Kundenkonto' : 'Customers only') : t('venue.summary.proceed')}
              <ArrowRight className="size-5" />
            </button>
          </div>
        </div>

        <div
          className={`fixed z-40 left-4 right-4 bottom-4 sm:left-auto sm:right-6 sm:w-[360px] transition-all duration-300 ${
            selectedDate && isVenueAvailable ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
          }`}
        >
          <div className="rounded-xl border border-purple-200 bg-white/95 backdrop-blur shadow-xl p-3 sm:p-4">
            <p className="text-xs text-gray-500">Datum gewaehlt: {displayDate}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-700">Gesamt (Schaetzung)</p>
                <p className="text-xl font-bold text-purple-700">${calculateTotal().toLocaleString()}</p>
              </div>
              <button
                onClick={handleProceedToBooking}
                disabled={isBookingBlockedForRole}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-purple-700 transition-colors"
              >
                {isBookingBlockedForRole ? (language === 'de' ? 'Nur Kunden' : 'Customers only') : t('venue.summary.proceed')}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Go to checkout section"
          onClick={guideToCompleteBooking}
          className="fixed z-40 right-4 sm:right-6 bottom-24 sm:bottom-28 h-12 w-12 rounded-full bg-purple-600 text-white shadow-lg hover:bg-purple-700 transition-all duration-300 flex items-center justify-center animate-pulse"
        >
          <ArrowRight className="size-5" />
        </button>

        <button
          type="button"
          aria-label="Go to cart section"
          onClick={guideToCart}
          className="fixed z-40 right-4 sm:right-6 bottom-40 sm:bottom-44 rounded-full bg-white border border-purple-300 text-purple-700 px-3 py-1.5 text-xs font-semibold shadow-md hover:bg-purple-50 transition-colors"
        >
          {language === 'de' ? 'Warenkorb' : 'Cart'}
        </button>

        <div className="fixed z-30 right-4 sm:right-6 bottom-16 sm:bottom-20 rounded-full bg-white/95 border border-purple-200 px-3 py-1 text-[11px] text-purple-700 shadow-sm">
          {language === 'de' ? 'Zum Checkout' : 'Go to checkout'}
        </div>
      </div>
    </div>
  );
}

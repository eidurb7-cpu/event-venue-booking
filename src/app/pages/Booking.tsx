import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Calendar, Check, Clock } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Booking() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [bookingData, setBookingData] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    altName: '',
    altPhone: '',
    contactMethod: 'email',
    eventTime: '',
    setupTime: '',
    eventType: '',
    guests: '',
    eventAddress: '',
    city: '',
    postalCode: '',
    notes: '',
    reviewAccepted: false
  });

  useEffect(() => {
    const storedData = sessionStorage.getItem('bookingData');
    if (storedData) {
      const parsed = JSON.parse(storedData);
      setBookingData(parsed);
      if (parsed?.estimatedGuests) {
        setFormData((prev) => ({ ...prev, guests: String(parsed.estimatedGuests) }));
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuccess(true);
    sessionStorage.removeItem('bookingData');

    setTimeout(() => {
      navigate('/');
    }, 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = e.target instanceof HTMLInputElement ? e.target.checked : false;

    setFormData((prev) => ({
      ...prev,
      [name]: name === 'reviewAccepted' ? checked : value
    }));
  };

  const calculateTotal = () => {
    if (!bookingData) return 0;

    let total = bookingData.venue.price;
    const numGuests = parseInt(formData.guests, 10) || 0;

    bookingData.selectedProviders.forEach((item: any) => {
      if (item.service?.category === 'catering') {
        // Catering is per person and only scales once guest count is known.
        total += numGuests > 0 ? item.provider.price * numGuests : 0;
      } else {
        total += item.provider.price;
      }
    });

    return total;
  };

  const dateLocale = language === 'de' ? 'de-DE' : 'en-US';

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="bg-white rounded-xl shadow-lg p-12 max-w-md text-center">
          <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="size-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('booking.success.title')}</h2>
          <p className="text-gray-600 mb-2">{t('booking.success.message', { email: formData.email })}</p>
          <p className="text-sm font-semibold text-purple-700 mt-2">{t('booking.success.status')}</p>
          <div className="bg-purple-50 rounded-lg p-4 mt-6 mb-6">
            <p className="text-sm text-gray-700">
              <strong>{t('booking.success.eventDate')}:</strong> {bookingData?.selectedDate}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              <strong>{t('booking.success.eventTime')}:</strong> {formData.eventTime}
            </p>
          </div>
          <p className="text-sm text-gray-500">{t('booking.success.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">{t('booking.title')}</h1>
          <p className="text-gray-600">{t('booking.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-5 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5 sm:mb-6">{t('booking.info.title')}</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.name')} *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    placeholder="Max Mustermann"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.email')} *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    placeholder="max@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.phone')} *</label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    placeholder="+49 170 1234567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.altName')}</label>
                  <input
                    type="text"
                    name="altName"
                    value={formData.altName}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.altPhone')}</label>
                  <input
                    type="tel"
                    name="altPhone"
                    value={formData.altPhone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.contactMethod')} *</label>
                  <select
                    name="contactMethod"
                    required
                    value={formData.contactMethod}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  >
                    <option value="email">{t('booking.info.contactMethod.email')}</option>
                    <option value="phone">{t('booking.info.contactMethod.phone')}</option>
                    <option value="whatsapp">{t('booking.info.contactMethod.whatsapp')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.address')} *</label>
                  <input
                    type="text"
                    name="eventAddress"
                    required
                    value={formData.eventAddress}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.city')} *</label>
                  <input
                    type="text"
                    name="city"
                    required
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.postalCode')} *</label>
                  <input
                    type="text"
                    name="postalCode"
                    required
                    value={formData.postalCode}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.time')} *</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
                    <input
                      type="time"
                      name="eventTime"
                      required
                      value={formData.eventTime}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.setupTime')}</label>
                  <input
                    type="time"
                    name="setupTime"
                    value={formData.setupTime}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.type')} *</label>
                  <select
                    name="eventType"
                    required
                    value={formData.eventType}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  >
                    <option value="">{t('booking.type.select')}</option>
                    <option value="wedding">{t('booking.type.wedding')}</option>
                    <option value="corporate">{t('booking.type.corporate')}</option>
                    <option value="birthday">{t('booking.type.birthday')}</option>
                    <option value="conference">{t('booking.type.conference')}</option>
                    <option value="other">{t('booking.type.other')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.guests')} *</label>
                  <input
                    type="number"
                    name="guests"
                    required
                    value={formData.guests}
                    onChange={handleChange}
                    min="1"
                    max={bookingData?.venue.capacity}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    placeholder={bookingData?.estimatedGuests || '100'}
                  />
                  {bookingData && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('booking.info.maxCapacity', { count: bookingData.venue.capacity })}
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('booking.info.notes')}</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  placeholder={t('booking.info.notes.placeholder')}
                />
              </div>

              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">{t('booking.review.notice')}</p>
                <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    name="reviewAccepted"
                    required
                    checked={formData.reviewAccepted}
                    onChange={handleChange}
                    className="mt-1"
                  />
                  <span>{t('booking.review.approval')}</span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-purple-600 text-white py-3 sm:py-4 rounded-lg font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <Calendar className="size-5" />
                {t('booking.submit')}
              </button>
            </form>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 lg:sticky lg:top-24">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">{t('booking.summary.title')}</h2>

              {bookingData ? (
                <div className="space-y-6">
                  <div className="pb-4 border-b">
                    <div className="flex items-center gap-2 text-purple-600 mb-2">
                      <Calendar className="size-5" />
                      <span className="font-semibold">{t('booking.summary.eventDate')}</span>
                    </div>
                    <p className="text-lg font-medium text-gray-900">
                      {new Date(bookingData.selectedDate + 'T00:00:00').toLocaleDateString(dateLocale, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">{t('booking.summary.venue')}</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="font-medium text-gray-900">{bookingData.venue.name}</p>
                      <p className="text-sm text-gray-600 mt-1">{bookingData.venue.location}</p>
                      <p className="text-purple-600 font-semibold mt-2">${bookingData.venue.price.toLocaleString()}</p>
                    </div>
                  </div>

                  {bookingData.selectedProviders.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">{t('booking.summary.services')}</h3>
                      <div className="space-y-3">
                        {bookingData.selectedProviders.map((item: any, index: number) => (
                          <div key={index} className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm font-medium text-purple-600 uppercase">{item.service.name}</p>
                            <p className="font-medium text-gray-900 mt-1">{item.provider.name}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-sm text-gray-600">{t('booking.summary.rating')}:</span>
                              <span className="text-sm font-medium">{item.provider.rating} *</span>
                            </div>
                            <p className="text-purple-600 font-semibold mt-2">
                              ${item.provider.price.toLocaleString()}
                              {item.service.category === 'catering' && (
                                <span className="text-xs text-gray-500"> {t('venue.perPerson')}</span>
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-6 border-t">
                    {formData.guests && parseInt(formData.guests, 10) > 0 ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-600">{t('booking.summary.subtotal')}</span>
                          <span className="font-semibold">${calculateTotal().toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-gray-600">{t('booking.summary.fee')}</span>
                          <span className="font-semibold">${(calculateTotal() * 0.1).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t">
                          <span className="text-lg font-bold text-gray-900">{t('booking.summary.total')}</span>
                          <span className="text-2xl font-bold text-purple-600">${(calculateTotal() * 1.1).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{t('booking.summary.forGuests', { count: formData.guests })}</p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-600">{t('booking.summary.subtotal')}</span>
                          <span className="font-semibold">${calculateTotal().toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-gray-600">{t('booking.summary.fee')}</span>
                          <span className="font-semibold">${(calculateTotal() * 0.1).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t">
                          <span className="text-lg font-bold text-gray-900">{t('booking.summary.total')}</span>
                          <span className="text-2xl font-bold text-purple-600">${(calculateTotal() * 1.1).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{t('booking.summary.enterGuests')}</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">{t('booking.summary.noData')}</p>
                  <button
                    onClick={() => navigate('/venues')}
                    className="mt-4 text-purple-600 hover:text-purple-700"
                  >
                    {t('booking.summary.browse')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Star, Check } from 'lucide-react';
import type { Service, ServiceProvider } from '../data/mockData';
import { useLanguage } from '../context/LanguageContext';
import { useState } from 'react';

interface ServiceCardProps {
  service: Service;
  selectedProviderIds?: string[];
  onAddToCart?: (serviceId: string, providerId: string) => void;
  onCompleteBooking?: (serviceId: string, providerId: string) => void;
  selectedDate?: string;
}

export function ServiceCard({
  service,
  selectedProviderIds = [],
  onAddToCart,
  onCompleteBooking,
  selectedDate,
}: ServiceCardProps) {
  const { t, language } = useLanguage();
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  
  const isProviderAvailable = (provider: ServiceProvider) => {
    if (!selectedDate) return true;
    return !provider.bookedDates.includes(selectedDate);
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-md">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={service.image} 
          alt={service.name}
          className="w-full h-full object-cover"
        />
      </div>
      
      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{service.name}</h3>
        <p className="text-gray-600 mb-6">{service.description}</p>
        
        <div className="space-y-4">
          {service.providers.map((provider: ServiceProvider) => {
            const available = isProviderAvailable(provider);
            const isAdded = selectedProviderIds.includes(provider.id);
            const showDetails = expandedProviderId === provider.id;
            return (
              <div 
                key={provider.id}
                className={`border rounded-lg p-4 transition-all ${
                  !available 
                    ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' 
                    : isAdded
                      ? 'border-purple-600 bg-purple-50 cursor-pointer' 
                      : 'border-gray-200 hover:border-purple-300 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      {provider.name}
                      {!available && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">
                          {t('venue.booked')}
                        </span>
                      )}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <Star className="size-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">{provider.rating}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        ({provider.reviewCount} {t('venue.reviews')})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-purple-600">
                      ${provider.price.toLocaleString()}
                      {service.category === 'catering' && <span className="text-xs text-gray-500">{t('venue.perPerson')}</span>}
                    </span>
                    {isAdded && (
                      <div className="bg-purple-600 rounded-full p-1">
                        <Check className="size-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mt-3">
                  {provider.specialties.map((specialty, index) => (
                    <span 
                      key={index}
                      className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedProviderId(showDetails ? null : provider.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    {showDetails ? (language === 'de' ? 'Schliessen' : 'Close') : (language === 'de' ? 'Details ansehen' : 'View details')}
                  </button>
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => onAddToCart?.(service.id, provider.id)}
                    className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isAdded
                      ? (language === 'de' ? 'Ausgewaehlt (klicken zum Entfernen)' : 'Selected (click to remove)')
                      : (language === 'de' ? 'Hinzufuegen' : 'Add')}
                  </button>
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => onCompleteBooking?.(service.id, provider.id)}
                    className="rounded-lg border border-purple-300 text-purple-700 px-3 py-1.5 text-sm font-semibold hover:bg-purple-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
                  >
                    {language === 'de' ? 'Buchung abschliessen' : 'Complete booking'}
                  </button>
                </div>

                {showDetails && (
                  <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-gray-700">
                    <p>
                      <span className="font-semibold">{language === 'de' ? 'Anbieter' : 'Provider'}:</span> {provider.name}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">{language === 'de' ? 'Bewertung' : 'Rating'}:</span> {provider.rating} ({provider.reviewCount} {t('venue.reviews')})
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">{language === 'de' ? 'Spezialitaeten' : 'Specialties'}:</span> {provider.specialties.join(', ')}
                    </p>
                    {!available && (
                      <p className="mt-2 text-red-600">{t('venue.booked')}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

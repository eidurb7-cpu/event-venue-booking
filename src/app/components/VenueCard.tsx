import { Link } from 'react-router';
import { MapPin, Users } from 'lucide-react';
import type { Venue } from '../data/mockData';
import { useLanguage } from '../context/LanguageContext';

interface VenueCardProps {
  venue: Venue;
}

export function VenueCard({ venue }: VenueCardProps) {
  const { t } = useLanguage();
  const formattedPrice = new Intl.NumberFormat('de-DE').format(venue.price);
  
  return (
    <Link to={`/venue/${venue.id}`} className="block group">
      <div className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-shadow">
        <div className="relative h-64 overflow-hidden">
          <img 
            src={venue.image} 
            alt={venue.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-4 right-4 bg-purple-600 text-white px-3 py-1 rounded-full text-sm">
            {venue.type}
          </div>
        </div>
        
        <div className="p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{venue.name}</h3>
          <p className="text-gray-600 mb-4 line-clamp-2">{venue.description}</p>
          
          <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <MapPin className="size-4" />
              {venue.location}
            </div>
            <div className="flex items-center gap-1">
              <Users className="size-4" />
              {t('venue.guests', { count: venue.capacity })}
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-2xl font-semibold text-purple-600">
              ab EUR {formattedPrice}
            </span>
            <span className="text-sm text-gray-500">{t('venue.perEvent')}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

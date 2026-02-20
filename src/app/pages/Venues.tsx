import { useState } from 'react';
import { venues } from '../data/mockData';
import { VenueCard } from '../components/VenueCard';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Venues() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [maxCapacity, setMaxCapacity] = useState<number | null>(null);

  const venueTypes = ['all', ...Array.from(new Set(venues.map(v => v.type)))];

  const filteredVenues = venues.filter(venue => {
    const matchesSearch = venue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         venue.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         venue.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'all' || venue.type === selectedType;
    const matchesCapacity = !maxCapacity || venue.capacity >= maxCapacity;
    
    return matchesSearch && matchesType && matchesCapacity;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('venues.title')}</h1>
          <p className="text-gray-600">{t('venues.subtitle')}</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center gap-2 mb-6">
            <SlidersHorizontal className="size-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">{t('venues.filters')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('venues.filter.searchLabel')}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('venues.filter.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('venues.filter.type')}
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              >
                {venueTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'all' ? t('venues.filter.all') : type}
                  </option>
                ))}
              </select>
            </div>

            {/* Capacity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('venues.capacity')}
              </label>
              <input
                type="number"
                placeholder={t('venues.filter.capacityPlaceholder')}
                value={maxCapacity || ''}
                onChange={(e) => setMaxCapacity(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="mb-6">
          <p className="text-gray-600">
            {filteredVenues.length === 1
              ? t('venues.resultsFound.one', { count: filteredVenues.length })
              : t('venues.resultsFound.other', { count: filteredVenues.length })}
          </p>
        </div>

        {/* Venue Grid */}
        {filteredVenues.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredVenues.map(venue => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <p className="text-gray-600 mb-2">{t('venues.notFound')}</p>
            <p className="text-gray-500 text-sm">{t('venues.notFound.desc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

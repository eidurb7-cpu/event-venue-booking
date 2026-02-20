import { Link } from 'react-router';
import { ArrowRight, MapPin, Users, Music, Utensils, Sparkles, Palette, Camera } from 'lucide-react';
import { venues } from '../data/mockData';
import { VenueCard } from '../components/VenueCard';
import { useLanguage } from '../context/LanguageContext';

export default function Home() {
  const featuredVenues = venues.slice(0, 3);
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-purple-600 to-purple-900 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-bold mb-6">
              {t('home.hero.title')}
            </h1>
            <p className="text-xl mb-8 text-purple-100">
              {t('home.hero.subtitle')}
            </p>
            <Link 
              to="/venues" 
              className="inline-flex items-center gap-2 bg-white text-purple-600 px-8 py-4 rounded-lg font-semibold hover:bg-purple-50 transition-colors"
            >
              {t('home.hero.cta')}
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="py-16 container mx-auto px-4">
        <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
          {t('home.services.title')}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="size-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.services.venues')}</h3>
            <p className="text-gray-600 text-sm">{t('home.services.venues.desc')}</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Music className="size-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.services.djs')}</h3>
            <p className="text-gray-600 text-sm">{t('home.services.djs.desc')}</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Utensils className="size-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.services.catering')}</h3>
            <p className="text-gray-600 text-sm">{t('home.services.catering.desc')}</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="size-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.services.makeup')}</h3>
            <p className="text-gray-600 text-sm">{t('home.services.makeup.desc')}</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="size-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.services.photography')}</h3>
            <p className="text-gray-600 text-sm">{t('home.services.photography.desc')}</p>
          </div>
        </div>
      </section>

      {/* Featured Venues */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              {t('home.featured.title')}
            </h2>
            <Link 
              to="/venues" 
              className="text-purple-600 hover:text-purple-700 flex items-center gap-2"
            >
              {t('home.featured.viewAll')}
              <ArrowRight className="size-5" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredVenues.map(venue => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-purple-600 to-purple-900 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6">{t('home.cta.title')}</h2>
          <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
            {t('home.cta.subtitle')}
          </p>
          <Link 
            to="/venues" 
            className="inline-flex items-center gap-2 bg-white text-purple-600 px-8 py-4 rounded-lg font-semibold hover:bg-purple-50 transition-colors"
          >
            {t('home.cta.button')}
            <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

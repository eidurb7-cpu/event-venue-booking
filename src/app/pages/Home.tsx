import { Link } from 'react-router';
import { ArrowRight, Sparkles, Shield, Calendar, Music, Utensils, Palette, Camera } from 'lucide-react';
import { venues } from '../data/mockData';
import { VenueCard } from '../components/VenueCard';
import { useLanguage } from '../context/LanguageContext';
import { getCurrentUser } from '../utils/auth';

export default function Home() {
  const featuredVenues = venues.slice(0, 3);
  const { t } = useLanguage();
  const currentUser = getCurrentUser();
  const dashboardLink =
    currentUser?.role === 'admin'
      ? '/admin'
      : currentUser?.role === 'vendor'
        ? '/vendor-portfolio'
        : '/customer-portfolio';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white py-16 sm:py-24 lg:py-28">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,#d8b4fe_0%,transparent_32%),radial-gradient(circle_at_80%_10%,#c4b5fd_0%,transparent_30%),radial-gradient(circle_at_50%_100%,#ddd6fe_0%,transparent_35%)]" />
        </div>
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-4 sm:mb-6">
              {t('home.hero.title')}
            </h1>
            <p className="text-base sm:text-xl mb-7 sm:mb-9 text-slate-600">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/venues"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-white font-semibold hover:bg-slate-700 transition-colors"
              >
                {t('home.hero.cta')}
                <ArrowRight className="size-5" />
              </Link>
              <Link
                to={currentUser ? dashboardLink : '/signup'}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
              >
                {currentUser ? 'Zum Dashboard' : 'Als Vendor starten'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 sm:mb-12 text-center">
            Explore Categories
          </h2>
          <p className="text-center text-slate-600 max-w-xl mx-auto -mt-6 mb-10">
            Find trusted partners for each part of your event, from music and visuals to food and decoration.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-slate-50 border border-slate-200 p-5 sm:p-7 rounded-2xl text-center hover:border-purple-300 transition-colors">
              <div className="bg-purple-100 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Music className="size-7 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">DJs & Music</h3>
              <p className="text-slate-500 text-sm">120+ vendors</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-5 sm:p-7 rounded-2xl text-center hover:border-purple-300 transition-colors">
              <div className="bg-purple-100 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Camera className="size-7 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Photography</h3>
              <p className="text-slate-500 text-sm">85+ vendors</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-5 sm:p-7 rounded-2xl text-center hover:border-purple-300 transition-colors">
              <div className="bg-purple-100 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Utensils className="size-7 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Catering</h3>
              <p className="text-slate-500 text-sm">60+ vendors</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-5 sm:p-7 rounded-2xl text-center hover:border-purple-300 transition-colors">
              <div className="bg-purple-100 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Palette className="size-7 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Decoration</h3>
              <p className="text-slate-500 text-sm">45+ vendors</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose */}
      <section className="py-12 sm:py-16">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center">Why Choose EventVenue</h2>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <Sparkles className="size-7 text-purple-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900">Curated Vendors</h3>
              <p className="text-sm text-slate-600 mt-2">Every vendor is reviewed before approval to keep quality high.</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <Shield className="size-7 text-purple-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900">Secure Payments</h3>
              <p className="text-sm text-slate-600 mt-2">Payments run through Stripe with platform-first security.</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <Calendar className="size-7 text-purple-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900">Structured Booking</h3>
              <p className="text-sm text-slate-600 mt-2">Negotiate offers in-platform and pay only after final agreement.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Venues */}
      <section className="py-10 sm:py-16 bg-white">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
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
      <section className="py-12 sm:py-20 bg-gradient-to-br from-slate-900 to-purple-900 text-white">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-6">{t('home.cta.title')}</h2>
          <p className="text-base sm:text-xl text-purple-100 mb-6 sm:mb-8 max-w-2xl mx-auto">
            {t('home.cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/venues"
              className="inline-flex items-center justify-center gap-2 bg-white text-purple-700 px-5 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold hover:bg-purple-50 transition-colors"
            >
              {t('home.cta.button')}
              <ArrowRight className="size-5" />
            </Link>
            <Link
              to="/request"
              className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-5 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              Anfrage erstellen
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        © 2026 EventVenue. All rights reserved.
      </footer>
    </div>
  );
}

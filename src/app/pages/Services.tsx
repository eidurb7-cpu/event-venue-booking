import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Camera, Music, Palette, Search, ShoppingCart, SlidersHorizontal, Sparkles, Trash2, Utensils } from 'lucide-react';
import { services, type Service } from '../data/mockData';
import { useLanguage } from '../context/LanguageContext';
import { PublicVendorPost, createRequest, getPublicVendorPosts } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

type ServiceCategory = Service['category'];
type CategoryFilter = 'all' | ServiceCategory;
type SortBy = 'highest-rated' | 'lowest-price' | 'highest-price';

type ProviderRow = {
  serviceId: string;
  serviceName: string;
  serviceCategory: ServiceCategory;
  providerId: string;
  providerName: string;
  providerRating: number;
  providerReviews: number;
  providerPrice: number;
  specialties: string[];
};

type ServiceCartItem = {
  row: ProviderRow;
  quantity: number;
};

const SERVICE_CART_STORAGE_KEY = 'servicesCart:v1';

const categoryConfig: Array<{
  id: CategoryFilter;
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
}> = [
  { id: 'all', icon: Sparkles, labelKey: 'services.tabs.all' },
  { id: 'dj', icon: Music, labelKey: 'services.tabs.dj' },
  { id: 'catering', icon: Utensils, labelKey: 'services.tabs.catering' },
  { id: 'makeup', icon: Sparkles, labelKey: 'services.tabs.makeup' },
  { id: 'decorations', icon: Palette, labelKey: 'services.tabs.decorations' },
  { id: 'photography', icon: Camera, labelKey: 'services.tabs.photography' },
];

export default function Services() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('highest-rated');
  const [showFilters, setShowFilters] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderRow | null>(null);
  const [dialogMode, setDialogMode] = useState<'details' | 'offer' | null>(null);
  const [offerName, setOfferName] = useState('');
  const [offerEmail, setOfferEmail] = useState('');
  const [offerPhone, setOfferPhone] = useState('');
  const [offerDate, setOfferDate] = useState('');
  const [offerGuests, setOfferGuests] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerSubmitted, setOfferSubmitted] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [offerSaving, setOfferSaving] = useState(false);
  const [publicPosts, setPublicPosts] = useState<PublicVendorPost[]>([]);
  const [cartItems, setCartItems] = useState<ServiceCartItem[]>([]);
  const cartSectionRef = useRef<HTMLElement | null>(null);
  const currentUser = getCurrentUser();
  const isVendorViewOnly = currentUser?.role === 'vendor';
  const isBookingBlockedForRole = currentUser?.role === 'vendor' || currentUser?.role === 'admin';

  const providers = useMemo<ProviderRow[]>(() => {
    return services.flatMap((service) =>
      service.providers.map((provider) => ({
        serviceId: service.id,
        serviceName: service.name,
        serviceCategory: service.category,
        providerId: provider.id,
        providerName: provider.name,
        providerRating: provider.rating,
        providerReviews: provider.reviewCount,
        providerPrice: provider.price,
        specialties: provider.specialties,
      })),
    );
  }, []);

  const maxProviderPrice = useMemo(() => {
    return Math.max(...providers.map((p) => p.providerPrice), 0);
  }, [providers]);

  const safeMaxPrice = Math.max(maxProviderPrice, 1);
  const [maxPrice, setMaxPrice] = useState(safeMaxPrice);

  useEffect(() => {
    getPublicVendorPosts()
      .then((data) => setPublicPosts(data.posts))
      .catch(() => setPublicPosts([]));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SERVICE_CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ServiceCartItem[];
      if (!Array.isArray(parsed)) return;
      const validItems = parsed.filter(
        (item) =>
          item &&
          item.row &&
          typeof item.row.providerId === 'string' &&
          typeof item.row.serviceId === 'string' &&
          Number.isFinite(item.quantity)
      );
      setCartItems(validItems.map((item) => ({ ...item, quantity: Math.max(1, Math.min(20, item.quantity)) })));
    } catch {
      // Ignore invalid saved cart.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SERVICE_CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    setMaxPrice((prev) => {
      if (prev < 0) return safeMaxPrice;
      if (prev > safeMaxPrice) return safeMaxPrice;
      return prev;
    });
  }, [safeMaxPrice]);

  const filteredProviders = useMemo(() => {
    let data = providers.filter((row) => {
      const matchesCategory = category === 'all' || row.serviceCategory === category;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        row.providerName.toLowerCase().includes(query) ||
        row.serviceName.toLowerCase().includes(query) ||
        row.specialties.some((s) => s.toLowerCase().includes(query));
      const matchesRating = row.providerRating >= minRating;
      const matchesPrice = row.providerPrice <= maxPrice;
      return matchesCategory && matchesSearch && matchesRating && matchesPrice;
    });

    data = [...data].sort((a, b) => {
      if (sortBy === 'highest-rated') return b.providerRating - a.providerRating;
      if (sortBy === 'lowest-price') return a.providerPrice - b.providerPrice;
      return b.providerPrice - a.providerPrice;
    });

    return data;
  }, [providers, category, search, minRating, maxPrice, sortBy]);

  const handleOpenDetails = (row: ProviderRow) => {
    setActiveProvider(row);
    setDialogMode('details');
    setOfferSubmitted(false);
  };

  const handleOpenOffer = (row: ProviderRow) => {
    setActiveProvider(row);
    setDialogMode('offer');
    setOfferName('');
    setOfferEmail('');
    setOfferPhone('');
    setOfferDate('');
    setOfferGuests('');
    setOfferAmount(String(row.providerPrice));
    setOfferMessage('');
    setOfferSubmitted(false);
    setOfferError('');
  };

  const handleCloseProvider = () => {
    setActiveProvider(null);
    setDialogMode(null);
    setOfferSubmitted(false);
    setOfferError('');
    setOfferSaving(false);
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsGuestCount =
      activeProvider?.serviceCategory === 'catering' || activeProvider?.serviceCategory === 'decorations';

    if (
      !offerName.trim() ||
      !offerEmail.trim() ||
      !offerPhone.trim() ||
      !offerDate ||
      (needsGuestCount && (!offerGuests || Number(offerGuests) <= 0)) ||
      !offerAmount ||
      Number(offerAmount) <= 0
    ) {
      return;
    }
    const current = getCurrentUser();
    if (!current || current.role !== 'customer' || !current.user.email) {
      setOfferError('Bitte zuerst als Kunde einloggen.');
      return;
    }
    if (!activeProvider) return;

    setOfferSaving(true);
    setOfferError('');
    try {
      const requestPayload = {
        customerName: current.user.name || offerName.trim(),
        customerEmail: current.user.email,
        customerPhone: offerPhone.trim() || undefined,
        selectedServices: [activeProvider.serviceCategory],
        budget: Number(offerAmount),
        eventDate: offerDate || undefined,
        notes: `Provider: ${activeProvider.providerName} | Message: ${offerMessage || '-'} | Guests: ${offerGuests || '-'}`,
      };
      await createRequest(requestPayload);
      setOfferSubmitted(true);
      setTimeout(() => {
        navigate('/customer-portfolio');
      }, 900);
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : 'Anfrage konnte nicht gesendet werden.');
    } finally {
      setOfferSaving(false);
    }
  };

  const handleAddToCart = (row: ProviderRow) => {
    setCartItems((prev) => {
      const index = prev.findIndex((item) => item.row.providerId === row.providerId && item.row.serviceId === row.serviceId);
      if (index >= 0) {
        return prev.map((item, i) => (i === index ? { ...item, quantity: Math.min(item.quantity + 1, 20) } : item));
      }
      return [...prev, { row, quantity: 1 }];
    });
  };

  const handleRemoveFromCart = (providerId: string, serviceId: string) => {
    setCartItems((prev) => prev.filter((item) => !(item.row.providerId === providerId && item.row.serviceId === serviceId)));
  };

  const handleChangeQuantity = (providerId: string, serviceId: string, quantity: number) => {
    const safeQty = Number.isFinite(quantity) ? Math.max(1, Math.min(20, quantity)) : 1;
    setCartItems((prev) =>
      prev.map((item) =>
        item.row.providerId === providerId && item.row.serviceId === serviceId ? { ...item, quantity: safeQty } : item
      )
    );
  };

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const qty = item.row.serviceCategory === 'catering' ? 1 : item.quantity;
      return sum + item.row.providerPrice * qty;
    }, 0);
  }, [cartItems]);

  const handleCompleteServiceBooking = () => {
    if (isBookingBlockedForRole) return;
    if (cartItems.length === 0) return;

    const selectedCategories = Array.from(new Set(cartItems.map((item) => item.row.serviceCategory)));
    const lines = cartItems.map((item) => {
      const qty = item.row.serviceCategory === 'catering' ? 'per-person' : `qty ${item.quantity}`;
      return `${item.row.serviceName}: ${item.row.providerName} (${qty})`;
    });

    const draft = {
      selectedServices: selectedCategories,
      budget: String(cartTotal),
      notes: `Selected service cart:\n${lines.join('\n')}`,
    };

    sessionStorage.setItem('serviceRequestDraft', JSON.stringify(draft));
    navigate('/request');
  };

  const scrollToCart = () => {
    cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleQuickCompleteFromCard = (row: ProviderRow) => {
    handleAddToCart(row);
    setTimeout(scrollToCart, 50);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <section className="relative mb-20">
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white px-6 py-10 md:px-10 md:py-14">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">{t('services.title')}</h1>
            <p className="text-slate-200">{t('services.subtitle')}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {categoryConfig.map((tab) => {
                const Icon = tab.icon;
                const isActive = category === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategory(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-md'
                        : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <Icon className="size-4" />
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="absolute left-0 right-0 -bottom-12 px-3 md:px-8">
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 md:p-5">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('services.search.placeholder')}
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-gray-700"
                >
                  <SlidersHorizontal className="size-4" />
                  {showFilters ? t('services.filter.hide') : t('services.filter.show')}
                </button>
              </div>

              {showFilters && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('services.filter.rating')}</label>
                    <select
                      value={String(minRating)}
                      onChange={(e) => setMinRating(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    >
                      <option value="0">{t('services.rating.all')}</option>
                      <option value="4">4+ {t('services.rating.stars')}</option>
                      <option value="4.5">4.5+ {t('services.rating.stars')}</option>
                      <option value="4.8">4.8+ {t('services.rating.stars')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      {t('services.filter.maxPrice', { price: maxPrice.toLocaleString() })}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={safeMaxPrice}
                      step={50}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                      onInput={(e) => setMaxPrice(Number((e.target as HTMLInputElement).value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('services.filter.sortBy')}</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    >
                      <option value="highest-rated">{t('services.sort.highestRated')}</option>
                      <option value="lowest-price">{t('services.sort.lowestPrice')}</option>
                      <option value="highest-price">{t('services.sort.highestPrice')}</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <p className="text-sm text-gray-600 mb-6">
          {t('services.results.showing', { count: filteredProviders.length })}
        </p>

        <section ref={cartSectionRef} className="mb-6 rounded-xl border border-purple-200 bg-white shadow-sm">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-purple-700" />
              <p className="text-sm font-semibold text-gray-900">Services Cart ({cartItems.length})</p>
            </div>
            <p className="text-sm font-bold text-purple-700">EUR {cartTotal.toLocaleString()}</p>
          </div>
          {cartItems.length === 0 ? (
            <p className="p-3 text-sm text-gray-600">Add services from the list below.</p>
          ) : (
            <div className="max-h-52 overflow-auto p-3 space-y-2">
              {cartItems.map((item) => (
                <div key={`${item.row.serviceId}-${item.row.providerId}`} className="rounded-lg border border-gray-200 p-2.5">
                  <p className="text-sm font-medium text-gray-900">{item.row.providerName}</p>
                  <p className="text-xs text-gray-600">{item.row.serviceName}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {item.row.serviceCategory === 'catering' ? (
                      <p className="text-xs text-gray-500">Catering uses guests on request form.</p>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={item.quantity}
                        onChange={(e) =>
                          handleChangeQuantity(
                            item.row.providerId,
                            item.row.serviceId,
                            Number.parseInt(e.target.value || '1', 10)
                          )
                        }
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(item.row.providerId, item.row.serviceId)}
                      className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="p-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleCompleteServiceBooking}
              disabled={cartItems.length === 0 || isBookingBlockedForRole}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 text-white py-2.5 text-sm font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isBookingBlockedForRole ? 'Customers only' : 'Complete booking'}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </section>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={scrollToCart}
            className="rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50"
          >
            Go to cart
          </button>
        </div>

        {filteredProviders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProviders.map((row) => (
              <div key={row.providerId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs uppercase font-semibold text-purple-600">{row.serviceName}</p>
                <h3 className="text-lg font-semibold text-gray-900 mt-1">{row.providerName}</h3>
                <div className="mt-2 text-sm text-gray-600">
                  {row.providerRating} * ({row.providerReviews} {t('venue.reviews')})
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-900">
                  ${row.providerPrice.toLocaleString()}
                  {row.serviceCategory === 'catering' && (
                    <span className="ml-1 text-xs font-medium text-gray-500">{t('venue.perPerson')}</span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.specialties.slice(0, 3).map((specialty) => (
                    <span key={specialty} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {specialty}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetails(row)}
                    className="rounded-lg border border-gray-300 text-gray-800 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    {t('services.card.detailsButton')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddToCart(row)}
                    disabled={isBookingBlockedForRole}
                    className="rounded-lg bg-purple-600 text-white py-2.5 text-sm font-medium hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isBookingBlockedForRole ? 'Nur Ansicht (Vendor/Admin)' : 'Add to cart'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickCompleteFromCard(row)}
                    disabled={isBookingBlockedForRole}
                    className="rounded-lg border border-purple-300 text-purple-700 py-2.5 text-sm font-medium hover:bg-purple-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
                  >
                    {isBookingBlockedForRole ? 'Customers only' : 'Complete booking'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenOffer(row)}
                  disabled={isVendorViewOnly}
                  className="mt-2 w-full rounded-lg border border-purple-300 text-purple-700 py-2 text-sm font-medium hover:bg-purple-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {isVendorViewOnly ? 'Offer disabled for vendor' : t('services.card.offerButton')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-gray-200 p-12 text-center text-gray-600">
            {t('services.results.empty')}
          </div>
        )}

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Vendor Posts</h2>
          <p className="text-sm text-gray-600 mb-4">Aktive Posts aus dem Vendor Dashboard (approved + aktiviert).</p>
          {publicPosts.length === 0 ? (
            <div className="rounded-xl bg-white border border-gray-200 p-6 text-sm text-gray-600">
              Noch keine aktiven Vendor Posts.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {publicPosts.map((post) => (
                <article key={post.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase font-semibold text-purple-600">{post.serviceName}</p>
                  <h3 className="text-lg font-semibold text-gray-900 mt-1">{post.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">von {post.vendorName}</p>
                  {post.city && <p className="text-sm text-gray-500 mt-1">{post.city}</p>}
                  {post.description && <p className="text-sm text-gray-700 mt-3 line-clamp-3">{post.description}</p>}
                  <p className="mt-3 text-sm font-semibold text-gray-900">
                    {post.basePrice ? `EUR ${post.basePrice.toLocaleString()}` : 'Preis auf Anfrage'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(activeProvider)} onOpenChange={(open) => !open && handleCloseProvider()}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {activeProvider && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialogMode === 'offer' ? t('services.dialog.offerTitle') : t('services.dialog.title')}
                </DialogTitle>
                <DialogDescription>
                  {t('services.dialog.description', {
                    provider: activeProvider.providerName,
                    service: activeProvider.serviceName,
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-gray-500">{t('services.dialog.basePrice')}</p>
                    <p className="font-semibold text-gray-900">${activeProvider.providerPrice.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-gray-500">{t('services.dialog.rating')}</p>
                    <p className="font-semibold text-gray-900">
                      {activeProvider.providerRating} * ({activeProvider.providerReviews} {t('venue.reviews')})
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm text-gray-500 mb-2">{t('services.dialog.specialties')}</p>
                  <div className="flex flex-wrap gap-2">
                    {activeProvider.specialties.map((specialty) => (
                      <span key={specialty} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>

                {dialogMode === 'offer' && (
                  <form onSubmit={handleSubmitOffer} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.form.name')}</label>
                        <input
                          type="text"
                          required
                          value={offerName}
                          onChange={(e) => setOfferName(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.form.email')}</label>
                        <input
                          type="email"
                          required
                          value={offerEmail}
                          onChange={(e) => setOfferEmail(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.form.phone')}</label>
                        <input
                          type="tel"
                          required
                          value={offerPhone}
                          onChange={(e) => setOfferPhone(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.form.date')}</label>
                        <input
                          type="date"
                          required
                          value={offerDate}
                          onChange={(e) => setOfferDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(activeProvider.serviceCategory === 'catering' ||
                        activeProvider.serviceCategory === 'decorations') && (
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.form.guests')}</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={offerGuests}
                            onChange={(e) => setOfferGuests(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.offerLabel')}</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          required
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">{t('services.dialog.form.message')}</label>
                        <input
                          type="text"
                          value={offerMessage}
                          onChange={(e) => setOfferMessage(e.target.value)}
                          placeholder={t('services.dialog.form.messagePlaceholder')}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {offerSubmitted && (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                        {t('services.dialog.offerSent')}
                      </div>
                    )}
                    {offerError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {offerError}
                      </div>
                    )}

                    <DialogFooter className="sticky bottom-0 bg-white pt-2">
                      <button
                        type="submit"
                        disabled={offerSaving}
                        className="w-full sm:w-auto rounded-lg bg-purple-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-purple-700 transition-colors"
                      >
                        {offerSaving ? 'Wird gesendet...' : t('services.dialog.submitOffer')}
                      </button>
                    </DialogFooter>
                  </form>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

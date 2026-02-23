import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ServiceRequest,
  VendorCompliance,
  VendorContractSignature,
  StripeConnectStatus,
  VendorApplication,
  VendorOfferWithRequest,
  VendorPost,
  acceptVendorContract,
  applyVendorOffer,
  createStripeConnectOnboarding,
  createVendorPost,
  declineVendorRequest,
  getVendorCompliance,
  getStripeConnectStatus,
  getOpenRequests,
  getVendorInquiries,
  getVendorOffers,
  getVendorPosts,
  getVendorProfile,
  sendVendorInquiry,
  updateVendorProfile,
  updateVendorOffer,
  updateVendorPost,
  uploadFileToPublicStorage,
} from '../utils/api';
import { clearCurrentUser, getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

const SERVICE_CATEGORY_HINTS: Record<string, string[]> = {
  dj: ['dj', 'music', 'sound', 'audio', 'band'],
  catering: ['catering', 'food', 'chef', 'drinks', 'bar'],
  decor: ['decor', 'deco', 'decoration', 'flower', 'styling'],
  media: ['photo', 'video', 'camera', 'filming'],
  venue: ['venue', 'location', 'hall', 'space'],
};

function normalizeMatchText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .trim();
}

function textMatchesVendor(text: string, keywordSet: Set<string>, categorySet: Set<string>) {
  const normalized = normalizeMatchText(text);
  if (!normalized) return false;
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.length >= 3 && keywordSet.has(word)) return true;
  }
  for (const [category, hints] of Object.entries(SERVICE_CATEGORY_HINTS)) {
    if (!categorySet.has(category)) continue;
    if (hints.some((hint) => normalized.includes(hint))) return true;
  }
  return false;
}

function getVendorVisibleNote(rawNote: string) {
  const text = String(rawNote || '').trim();
  if (!text) return '';
  const blockedPatterns = ['client email', 'selected services subtotal', 'venue selected', 'subtotal: eur'];
  const lower = text.toLowerCase();
  if (blockedPatterns.some((pattern) => lower.includes(pattern))) return '';
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

function isUnauthorizedError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /unauthorized|401/i.test(msg);
}

type AvailabilityMap = Record<string, boolean>;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toLocalIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAvailability(value: unknown): AvailabilityMap {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const normalized: AvailabilityMap = {};
  Object.entries(input).forEach(([key, raw]) => {
    if (typeof raw !== 'boolean') return;
    const date = parseIsoDate(key);
    if (!date) return;
    normalized[toLocalIsoDate(date)] = raw;
  });
  return normalized;
}

function shiftMonth(base: Date, amount: number) {
  return new Date(base.getFullYear(), base.getMonth() + amount, 1);
}

function buildMonthGrid(month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const startWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - startWeekday);
  return Array.from({ length: totalCells }).map((_, index) => {
    const date = new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index);
    return {
      iso: toLocalIsoDate(date),
      label: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function AvailabilityCalendar({
  value,
  onChange,
  title,
}: {
  value: AvailabilityMap;
  onChange: (next: AvailabilityMap) => void;
  title: string;
}) {
  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const monthGrid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

  const selectedCount = useMemo(() => Object.keys(value).length, [value]);
  const availableCount = useMemo(
    () => Object.values(value).filter((entry) => entry === true).length,
    [value],
  );
  const blockedCount = selectedCount - availableCount;

  const toggleDay = (iso: string) => {
    const current = value[iso];
    const next: AvailabilityMap = { ...value, [iso]: current === true ? false : true };
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3 mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthCursor((month) => shiftMonth(month, -1))}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          >
            Prev
          </button>
          <p className="text-sm font-medium min-w-[120px] text-center">
            {MONTH_LABELS[monthCursor.getMonth()]} {monthCursor.getFullYear()}
          </p>
          <button
            type="button"
            onClick={() => setMonthCursor((month) => shiftMonth(month, 1))}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-[11px] font-semibold text-gray-500 text-center py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGrid.map((day) => {
          const state = value[day.iso];
          const stateClasses =
            state === true
              ? 'bg-green-100 border-green-400 text-green-900'
              : state === false
                ? 'bg-red-100 border-red-400 text-red-900'
                : 'bg-white border-gray-200 text-gray-800';
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => toggleDay(day.iso)}
              className={`h-9 rounded border text-xs ${stateClasses} ${day.inMonth ? '' : 'opacity-45'}`}
              title={`${day.iso}${state === true ? ' available' : state === false ? ' blocked' : ''}`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-gray-700">
          <span className="inline-block w-3 h-3 rounded-sm border border-green-400 bg-green-100" />
          Available: {availableCount}
        </span>
        <span className="inline-flex items-center gap-1 text-gray-700">
          <span className="inline-block w-3 h-3 rounded-sm border border-red-400 bg-red-100" />
          Blocked: {blockedCount}
        </span>
        <button
          type="button"
          onClick={() => onChange({})}
          className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50"
        >
          Clear
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Click a day once for green (available). Click again for red (blocked/booked).
      </p>
    </div>
  );
}

export default function VendorPortfolio() {
  const { language } = useLanguage();
  const isDe = language === 'de';
  const tx = {
    loginRequired: isDe ? 'Vendor Login erforderlich' : 'Vendor login required',
    loginPrompt: isDe ? 'Bitte melde dich als Vendor an, um dein Dashboard zu sehen.' : 'Please sign in as a vendor to view your dashboard.',
    toLogin: isDe ? 'Zum Login' : 'Go to login',
    signup: isDe ? 'Vendor registrieren' : 'Register as vendor',
    dashboard: isDe ? 'Vendor Dashboard' : 'Vendor Dashboard',
    pendingInfo: isDe ? 'Bitte warten, bis Admin deine Bewerbung freigibt.' : 'Please wait until admin reviews your application.',
    rejectedInfo: isDe ? 'Deine Bewerbung wurde abgelehnt. Bitte Admin kontaktieren.' : 'Your application was rejected. Please contact admin.',
    statusApproved: isDe ? 'Du kannst jetzt Angebote senden und deine Services verwalten.' : 'You can now send offers and manage your services.',
    statusGated: isDe ? 'Veroeffentlichen/Antworten ist erst nach Vertrag + Training + Admin-Freigabe aktiv.' : 'Publishing/responding is enabled only after contract + training + admin approval.',
    account: isDe ? 'Mein Account' : 'My account',
    sendToAdmin: isDe ? 'Anfrage an Admin senden' : 'Send inquiry to admin',
    servicePosts: isDe ? 'Meine Service-Posts & Verfuegbarkeit' : 'My service posts and availability',
    openRequests: isDe ? 'Offene Kundenanfragen' : 'Open customer requests',
    myOffers: isDe ? 'Meine gesendeten Angebote' : 'My sent offers',
    requestFlowHint: isDe
      ? 'Flow: Sende ein Angebot. Der Kunde kann annehmen oder ablehnen. Nach Annahme ist Zahlung moeglich.'
      : 'Flow: Send an offer. Customer can accept or decline. After acceptance, payment is enabled.',
    loadingOpenRequests: isDe ? 'Offene Anfragen werden geladen...' : 'Loading open requests...',
    noOpenRequests: isDe ? 'Keine offenen Anfragen vorhanden.' : 'No open requests available.',
    customer: isDe ? 'Kunde' : 'Customer',
    phone: isDe ? 'Telefon' : 'Phone',
    deadline: isDe ? 'Frist bis' : 'Deadline',
    servicesLabel: isDe ? 'Services' : 'Services',
    budgetLabel: isDe ? 'Budget' : 'Budget',
    yourPrice: isDe ? 'Dein Preis (EUR)' : 'Your price (EUR)',
    optionalMessage: isDe ? 'Nachricht (optional)' : 'Message (optional)',
    sendOffer: isDe ? 'Angebot senden' : 'Send offer',
    declineRequest: isDe ? 'Anfrage ablehnen' : 'Decline request',
    declining: isDe ? 'Wird abgelehnt...' : 'Declining...',
    loadingOffers: isDe ? 'Deine Angebote werden geladen...' : 'Loading your offers...',
    noOffersYet: isDe ? 'Noch keine gesendeten Angebote gefunden.' : 'No sent offers yet.',
    requestStatus: isDe ? 'Anfrage-Status' : 'Request status',
    yourPriceLabel: isDe ? 'Dein Preis' : 'Your price',
    payment: isDe ? 'Zahlung' : 'Payment',
    customerCanPay: isDe ? 'Kunde hat angenommen: Zahlung ist jetzt moeglich.' : 'Customer accepted: payment is now enabled.',
    waitingCustomerDecision: isDe ? 'Warte auf Kundenentscheidung (annehmen/ablehnen).' : 'Waiting for customer decision (accept/decline).',
    matchedForYou: isDe ? 'Passend für dich' : 'Matched for you',
    otherRequested: isDe ? 'Weitere angefragte Services' : 'Other requested services',
    requestDetails: isDe ? 'Anfrage-Details' : 'Request details',
    note: isDe ? 'Hinweis' : 'Note',
    noSpecificMatch: isDe ? 'Passender Service erkannt' : 'Relevant service detected',
    replies: isDe ? 'Admin-Antworten' : 'Admin replies',
    noReplies: isDe ? 'Noch keine Antworten vom Admin.' : 'No admin replies yet.',
    editOffer: isDe ? 'Angebot bearbeiten' : 'Edit offer',
    save: isDe ? 'Speichern' : 'Save',
    cancel: isDe ? 'Abbrechen' : 'Cancel',
    saving: isDe ? 'Speichert...' : 'Saving...',
  };
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [vendorProfile, setVendorProfile] = useState<VendorApplication | null>(null);
  const [profileForm, setProfileForm] = useState({
    contactName: '',
    city: '',
    address: '',
    websiteUrl: '',
    portfolioUrl: '',
    businessIntro: '',
    profileImageUrl: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [vendorCompliance, setVendorCompliance] = useState<VendorCompliance | null>(null);
  const [contractSignature, setContractSignature] = useState<VendorContractSignature | null>(null);
  const [openRequests, setOpenRequests] = useState<ServiceRequest[]>([]);
  const [myOffers, setMyOffers] = useState<VendorOfferWithRequest[]>([]);
  const [posts, setPosts] = useState<VendorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [error, setError] = useState('');
  const [postSuccess, setPostSuccess] = useState('');
  const [priceByRequest, setPriceByRequest] = useState<Record<string, string>>({});
  const [messageByRequest, setMessageByRequest] = useState<Record<string, string>>({});
  const [decliningRequestId, setDecliningRequestId] = useState('');
  const [editingOfferId, setEditingOfferId] = useState('');
  const [editOfferPrice, setEditOfferPrice] = useState('');
  const [editOfferMessage, setEditOfferMessage] = useState('');
  const [savingOfferId, setSavingOfferId] = useState('');
  const [inquirySubject, setInquirySubject] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [vendorInquiries, setVendorInquiries] = useState<
    Array<{
      id: string;
      subject: string;
      message: string;
      adminReply?: string | null;
      adminReplyAttachments?: string[];
      status: string;
      createdAt: string;
    }>
  >([]);
  const [postForm, setPostForm] = useState({
    title: '',
    serviceName: '',
    description: '',
    city: '',
    basePrice: '',
  });
  const [postAvailability, setPostAvailability] = useState<AvailabilityMap>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostForm, setEditPostForm] = useState({
    title: '',
    serviceName: '',
    description: '',
    city: '',
    basePrice: '',
  });
  const [editPostAvailability, setEditPostAvailability] = useState<AvailabilityMap>({});
  const navigate = useNavigate();
  const vendorInitial = String(vendorName || vendorEmail || 'V').trim().charAt(0).toUpperCase() || 'V';

  useEffect(() => {
    if (!vendorProfile) return;
    setProfileForm({
      contactName: vendorProfile.contactName || '',
      city: vendorProfile.city || '',
      address: vendorProfile.address || '',
      websiteUrl: vendorProfile.websiteUrl || '',
      portfolioUrl: vendorProfile.portfolioUrl || '',
      businessIntro: vendorProfile.businessIntro || '',
      profileImageUrl: vendorProfile.profileImageUrl || '',
    });
  }, [vendorProfile]);

  const loadVendorProfile = async (email: string) => {
    if (!email.trim()) return null;
    try {
      const data = await getVendorProfile(email);
      setVendorProfile(data.vendor);
      setVendorCompliance(data.vendor.compliance || null);
      setVendorName(data.vendor.businessName || '');
      return data.vendor;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Vendor-Profils.');
      return null;
    }
  };

  const openDashboard = async (email: string, name?: string) => {
    if (!email.trim()) {
      setError('Bitte Vendor-E-Mail eingeben.');
      return;
    }
    setVendorEmail(email.trim());
    if (name?.trim()) setVendorName(name.trim());
    setError('');
    setLoading(true);
    const vendor = await loadVendorProfile(email.trim());
    if (vendor) {
      await Promise.all([loadMyOffers(email.trim()), loadVendorComplianceStatus(email.trim())]);
      await loadStripeStatus(email.trim());
      await loadVendorInquiries();
      if (vendor.compliance?.canPublish) {
        await Promise.all([loadOpenRequests(), loadPosts(email.trim())]);
      }
    }
    setLoading(false);
  };

  const loadVendorComplianceStatus = async (email: string) => {
    if (!email.trim()) {
      setVendorCompliance(null);
      setContractSignature(null);
      return;
    }
    try {
      const data = await getVendorCompliance(email.trim());
      setVendorCompliance(data.compliance);
      setContractSignature(data.signature || null);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        // Keep checklist usable after token expiration by falling back to profile payload.
        try {
          const profile = await getVendorProfile(email.trim());
          setVendorCompliance(profile.vendor.compliance || null);
        } catch {
          // ignore fallback errors
        }
        setError('Session expired. Please log in again to refresh protected actions.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Compliance-Status.');
    }
  };

  const loadOpenRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOpenRequests();
      setOpenRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der offenen Anfragen.');
    } finally {
      setLoading(false);
    }
  };

  const loadMyOffers = async (email: string) => {
    if (!email.trim()) {
      setMyOffers([]);
      return;
    }
    setOffersLoading(true);
    setError('');
    try {
      const data = await getVendorOffers(email.trim());
      setMyOffers(data.offers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden deiner Angebote.');
    } finally {
      setOffersLoading(false);
    }
  };

  const loadPosts = async (email: string) => {
    if (!email.trim()) {
      setPosts([]);
      return;
    }
    try {
      const data = await getVendorPosts(email.trim());
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden deiner Posts.');
    }
  };

  const loadStripeStatus = async (email: string) => {
    if (!email.trim()) {
      setStripeStatus(null);
      return;
    }
    try {
      const data = await getStripeConnectStatus(email.trim());
      setStripeStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Stripe-Status.');
    }
  };

  const loadVendorInquiries = async () => {
    try {
      const data = await getVendorInquiries();
      setVendorInquiries(data.inquiries || []);
    } catch {
      // Non-blocking; vendor dashboard should still work if this fails.
    }
  };

  useEffect(() => {
    const current = getCurrentUser();
    if (!current || current.role !== 'vendor' || !current.user.email) {
      setLoading(false);
      return;
    }
    setManualEmail(current.user.email);
    setManualName(current.user.name || '');
    openDashboard(current.user.email, current.user.name || '');
  }, []);

  const applyOffer = async (requestId: string) => {
    if (!vendorCompliance?.canPublish) {
      setError('Responding is blocked until admin approval, contract acceptance, and training completion.');
      return;
    }
    const price = Number(priceByRequest[requestId] || 0);
    if (!vendorName.trim() || price <= 0 || !vendorEmail.trim()) return;
    setError('');
    try {
      await applyVendorOffer(requestId, {
        vendorName: vendorName.trim(),
        vendorEmail: vendorEmail.trim(),
        price,
        message: messageByRequest[requestId] || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden des Angebots.');
      return;
    }

    setPriceByRequest((p) => ({ ...p, [requestId]: '' }));
    setMessageByRequest((p) => ({ ...p, [requestId]: '' }));
    await Promise.all([loadOpenRequests(), loadMyOffers(vendorEmail)]);
  };

  const getOfferStatusLabel = (status: string) => {
    if (status === 'accepted') return isDe ? 'Angenommen' : 'Accepted';
    if (status === 'declined') return isDe ? 'Abgelehnt' : 'Declined';
    if (status === 'ignored') return isDe ? 'Ignoriert' : 'Ignored';
    if (status === 'pending') return isDe ? 'Ausstehend' : 'Pending';
    return status;
  };

  const getPaymentStatusLabel = (status: string) => {
    if (status === 'paid') return isDe ? 'Bezahlt' : 'Paid';
    if (status === 'pending') return isDe ? 'Ausstehend' : 'Pending';
    if (status === 'failed') return isDe ? 'Fehlgeschlagen' : 'Failed';
    return isDe ? 'Unbezahlt' : 'Unpaid';
  };

  const vendorMatchProfile = useMemo(() => {
    const keywords = new Set<string>();
    const categories = new Set<string>();
    const provided = Array.isArray(vendorProfile?.providedServices) ? vendorProfile.providedServices : [];
    const source = [
      vendorName,
      vendorProfile?.businessName || '',
      ...provided,
      ...(posts || []).map((post) => `${post.serviceName || ''} ${post.title || ''} ${post.description || ''}`),
    ]
      .join(' ')
      .trim();
    const normalized = normalizeMatchText(source);
    for (const token of normalized.split(/\s+/)) {
      if (token.length >= 3) keywords.add(token);
    }
    for (const [category, hints] of Object.entries(SERVICE_CATEGORY_HINTS)) {
      if (hints.some((hint) => normalized.includes(hint))) categories.add(category);
    }
    return { keywords, categories };
  }, [posts, vendorName, vendorProfile?.businessName, vendorProfile?.providedServices]);

  const vendorServices = useMemo(() => {
    const all = [
      ...(Array.isArray(vendorProfile?.providedServices) ? vendorProfile.providedServices : []),
      ...posts.map((post) => post.serviceName || ''),
    ];
    return Array.from(new Set(all.map((item) => String(item || '').trim()).filter(Boolean)));
  }, [posts, vendorProfile?.providedServices]);

  const requestHighlightsById = useMemo(() => {
    const byId: Record<string, { matched: string[]; others: string[] }> = {};
    for (const request of openRequests) {
      const selected = Array.isArray(request.selectedServices) ? request.selectedServices : [];
      const matched = selected.filter((service) =>
        textMatchesVendor(service, vendorMatchProfile.keywords, vendorMatchProfile.categories),
      );
      byId[request.id] = {
        matched,
        others: selected.filter((service) => !matched.includes(service)),
      };
    }
    return byId;
  }, [openRequests, vendorMatchProfile.categories, vendorMatchProfile.keywords]);

  const visibleOpenRequests = useMemo(() => {
    if (vendorServices.length === 0) return openRequests;
    return openRequests.filter((request) => (requestHighlightsById[request.id]?.matched || []).length > 0);
  }, [openRequests, requestHighlightsById, vendorServices.length]);

  const declineRequest = async (requestId: string) => {
    if (!vendorCompliance?.canPublish) {
      setError('Publishing is blocked until admin approval, contract acceptance, and training completion.');
      return;
    }
    if (!vendorEmail.trim()) return;
    setDecliningRequestId(requestId);
    setError('');
    try {
      await declineVendorRequest(requestId, {
        vendorName: vendorName.trim() || undefined,
        message: messageByRequest[requestId] || undefined,
      });
      setPriceByRequest((p) => ({ ...p, [requestId]: '' }));
      setMessageByRequest((p) => ({ ...p, [requestId]: '' }));
      await Promise.all([loadOpenRequests(), loadMyOffers(vendorEmail)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ablehnen der Anfrage.');
    } finally {
      setDecliningRequestId('');
    }
  };

  const startEditOffer = (offer: VendorOfferWithRequest) => {
    setEditingOfferId(offer.id);
    setEditOfferPrice(String(offer.price || ''));
    setEditOfferMessage(offer.message || '');
  };

  const cancelEditOffer = () => {
    setEditingOfferId('');
    setEditOfferPrice('');
    setEditOfferMessage('');
  };

  const saveEditedOffer = async (offerId: string) => {
    const price = Number(editOfferPrice || 0);
    if (!Number.isFinite(price) || price <= 0) {
      setError(isDe ? 'Bitte gültigen Preis eingeben.' : 'Please enter a valid price.');
      return;
    }
    setSavingOfferId(offerId);
    setError('');
    try {
      await updateVendorOffer(offerId, { price, message: editOfferMessage || '' });
      cancelEditOffer();
      await Promise.all([loadMyOffers(vendorEmail), loadOpenRequests()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isDe ? 'Angebot konnte nicht aktualisiert werden.' : 'Failed to update offer.'));
    } finally {
      setSavingOfferId('');
    }
  };

  const submitInquiry = async () => {
    if (!vendorEmail.trim() || !inquirySubject.trim() || !inquiryMessage.trim()) return;
    setError('');
    try {
      await sendVendorInquiry({
        vendorEmail: vendorEmail.trim(),
        subject: inquirySubject.trim(),
        message: inquiryMessage.trim(),
      });
      setInquirySubject('');
      setInquiryMessage('');
      await loadVendorInquiries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden der Anfrage an Admin.');
    }
  };

  const saveProfileDetails = async () => {
    if (!vendorEmail.trim()) return;
    setProfileSaving(true);
    setError('');
    try {
      const data = await updateVendorProfile({
        vendorEmail: vendorEmail.trim(),
        contactName: profileForm.contactName.trim(),
        city: profileForm.city.trim(),
        address: profileForm.address.trim(),
        websiteUrl: profileForm.websiteUrl.trim(),
        portfolioUrl: profileForm.portfolioUrl.trim(),
        businessIntro: profileForm.businessIntro.trim(),
        profileImageUrl: profileForm.profileImageUrl.trim(),
      });
      setVendorProfile(data.vendor);
      setVendorName(data.vendor.businessName || vendorName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const uploadVendorProfileImage = async (file: File | null) => {
    if (!file) return;
    setProfileUploading(true);
    setError('');
    try {
      const uploaded = await uploadFileToPublicStorage(file);
      setProfileForm((prev) => ({ ...prev, profileImageUrl: uploaded.publicUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setProfileUploading(false);
    }
  };

  const startStripeOnboarding = async () => {
    if (!vendorEmail.trim()) return;
    setStripeLoading(true);
    setError('');
    try {
      const data = await createStripeConnectOnboarding({
        vendorEmail: vendorEmail.trim(),
        country: 'DE',
      });
      window.location.href = data.onboardingUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Starten von Stripe Connect.');
      setStripeLoading(false);
    }
  };

  const createPost = async () => {
    if (!vendorCompliance?.canPublish) {
      setError('Publishing is blocked until admin approval, contract acceptance, and training completion.');
      return;
    }
    if (!vendorEmail.trim() || !postForm.title.trim() || !postForm.serviceName.trim()) return;
    setError('');
    setPostSuccess('');
    try {
      await createVendorPost({
        vendorEmail: vendorEmail.trim(),
        title: postForm.title.trim(),
        serviceName: postForm.serviceName.trim(),
        description: postForm.description.trim() || undefined,
        city: postForm.city.trim() || undefined,
        basePrice: postForm.basePrice ? Number(postForm.basePrice) : undefined,
        availability: postAvailability,
      });
      setPostForm({ title: '', serviceName: '', description: '', city: '', basePrice: '' });
      setPostAvailability({});
      await Promise.all([loadPosts(vendorEmail), loadVendorProfile(vendorEmail)]);
      setPostSuccess('Post erstellt. Er erscheint auf der Services-Seite, wenn dein Vendor-Konto approved ist und der Post aktiv bleibt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Posts.');
    }
  };

  const togglePostActive = async (post: VendorPost) => {
    if (!vendorCompliance?.canPublish) {
      setError('Publishing is blocked until admin approval, contract acceptance, and training completion.');
      return;
    }
    try {
      await updateVendorPost(post.id, { vendorEmail, isActive: !post.isActive });
      await loadPosts(vendorEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Posts.');
    }
  };

  const startEditPost = (post: VendorPost) => {
    setEditingPostId(post.id);
    setEditPostForm({
      title: post.title || '',
      serviceName: post.serviceName || '',
      description: post.description || '',
      city: post.city || '',
      basePrice: post.basePrice ? String(post.basePrice) : '',
    });
    setEditPostAvailability(normalizeAvailability(post.availability || {}));
  };

  const savePostEdit = async (postId: string) => {
    if (!vendorCompliance?.canPublish) {
      setError('Publishing is blocked until admin approval, contract acceptance, and training completion.');
      return;
    }
    if (!editPostForm.title.trim() || !editPostForm.serviceName.trim()) {
      setError('Titel und Service sind Pflichtfelder.');
      return;
    }
    try {
      await updateVendorPost(postId, {
        vendorEmail,
        title: editPostForm.title.trim(),
        serviceName: editPostForm.serviceName.trim(),
        description: editPostForm.description.trim(),
        city: editPostForm.city.trim(),
        basePrice: editPostForm.basePrice ? Number(editPostForm.basePrice) : undefined,
        availability: editPostAvailability,
      });
      setEditingPostId(null);
      setEditPostAvailability({});
      setError('');
      await loadPosts(vendorEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern des Posts.');
    }
  };

  if (!vendorEmail && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{tx.loginRequired}</h1>
            <p className="text-gray-600 mb-4">{tx.loginPrompt}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-lg bg-purple-600 text-white px-4 py-2.5 hover:bg-purple-700"
              >
                {tx.toLogin}
              </button>
              <Link to="/signup" className="rounded-lg border border-gray-300 px-4 py-2.5 hover:bg-gray-50">
                {tx.signup}
              </Link>
            </div>
            {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (vendorProfile && vendorProfile.status !== 'approved') {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-white rounded-xl border border-yellow-200 bg-yellow-50 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{tx.dashboard}</h1>
            <p className="text-gray-800">
              {isDe ? 'Dein Konto ist aktuell ' : 'Your account status is '}<strong>{vendorProfile?.status || 'pending_review'}</strong>. {tx.pendingInfo}
            </p>
            <div className="mt-4 rounded-lg border border-yellow-200 bg-white p-4 text-sm text-gray-700 space-y-1">
              <p><strong>Business:</strong> {vendorProfile.businessName}</p>
              <p><strong>Kontakt:</strong> {vendorProfile.contactName}</p>
              <p><strong>E-Mail:</strong> {vendorProfile.email}</p>
              {vendorProfile.city && <p><strong>Stadt:</strong> {vendorProfile.city}</p>}
              {vendorProfile.documentUrl && (
                <p>
                  <strong>Dokument:</strong>{' '}
                  <a href={vendorProfile.documentUrl} target="_blank" rel="noreferrer" className="text-purple-600 hover:text-purple-700">
                    ansehen
                  </a>
                </p>
              )}
            </div>
            {vendorProfile.status === 'rejected' && (
              <p className="text-gray-700 mt-2">{tx.rejectedInfo}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-6xl space-y-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{tx.dashboard}</h1>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <div className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold">
              {vendorInitial}
            </div>
            <div className="leading-tight">
              <p className="font-medium">{vendorName || vendorEmail}</p>
              <p className="text-xs">{vendorEmail}</p>
            </div>
          </div>
          <p className="text-gray-600">Status: approved. {tx.statusApproved}</p>
          <p className="text-xs text-gray-500 mt-1">{tx.statusGated}</p>
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">{isDe ? 'Aktivierungs-Checkliste' : 'Activation checklist'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className={`rounded-lg border px-3 py-2 ${vendorCompliance?.adminApproved ? 'border-green-200 bg-green-50 text-green-700' : 'border-yellow-200 bg-yellow-50 text-yellow-800'}`}>
              {vendorCompliance?.adminApproved ? 'Admin approved' : 'Admin approval pending'}
            </div>
            <div className={`rounded-lg border px-3 py-2 ${vendorCompliance?.contractAccepted ? 'border-green-200 bg-green-50 text-green-700' : 'border-yellow-200 bg-yellow-50 text-yellow-800'}`}>
              {vendorCompliance?.contractAccepted ? `Contract accepted (${vendorCompliance.contractVersion || 'v1.0'})` : 'Vendor contract not accepted'}
            </div>
            <div className={`rounded-lg border px-3 py-2 ${contractSignature?.status === 'completed' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
              {contractSignature
                ? `E-sign status: ${contractSignature.status}${contractSignature.provider ? ` (${contractSignature.provider})` : ''}`
                : 'E-sign status: not started'}
            </div>
            <div className={`rounded-lg border px-3 py-2 ${vendorCompliance?.trainingCompleted ? 'border-green-200 bg-green-50 text-green-700' : 'border-yellow-200 bg-yellow-50 text-yellow-800'}`}>
              {vendorCompliance?.trainingCompleted ? 'Training completed' : 'Training not completed'}
            </div>
            <div className={`rounded-lg border px-3 py-2 ${vendorCompliance?.canPublish ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
              {vendorCompliance?.canPublish ? 'Vendor ACTIVE: publishing/responding unlocked' : 'Vendor not active yet'}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/vendor-terms" className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
              Open Vendor Agreement
            </Link>
            <button
              type="button"
              disabled={Boolean(vendorCompliance?.contractAccepted) || complianceLoading || !vendorEmail}
              onClick={async () => {
                if (!vendorEmail.trim()) return;
                setComplianceLoading(true);
                setError('');
                try {
                  const data = await acceptVendorContract({ vendorEmail: vendorEmail.trim(), contractVersion: 'v1.0' });
                  setVendorCompliance(data.compliance);
                  if (data.compliance.canPublish) {
                    await Promise.all([loadOpenRequests(), loadPosts(vendorEmail.trim())]);
                  }
                } catch (err) {
                  if (isUnauthorizedError(err)) {
                    clearCurrentUser();
                    navigate('/login');
                    return;
                  }
                  setError(err instanceof Error ? err.message : 'Failed to accept contract.');
                } finally {
                  setComplianceLoading(false);
                }
              }}
              className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {vendorCompliance?.contractAccepted ? 'Contract accepted' : (complianceLoading ? 'Saving...' : 'Accept contract')}
            </button>
            {contractSignature?.signingUrl && (
              <a
                href={contractSignature.signingUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Open e-sign link
              </a>
            )}
            <button
              type="button"
              disabled={true}
              onClick={() => {}}
              className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm hover:bg-black disabled:opacity-60"
              title="Training is confirmed by admin only"
            >
              {vendorCompliance?.trainingCompleted ? 'Training confirmed by admin' : 'Waiting for admin training confirmation'}
            </button>
            <button
              type="button"
              onClick={() => loadVendorComplianceStatus(vendorEmail)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Refresh checklist
            </button>
          </div>
          {!vendorCompliance?.canPublish && (
            <p className="mt-3 text-xs text-amber-700">
              You cannot publish listings or respond to requests until checklist items are complete and payout setup is ready.
            </p>
          )}
        </div>

        {vendorProfile && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{tx.account}</h2>
            <div className="mb-4 flex items-center gap-3">
              {profileForm.profileImageUrl ? (
                <img
                  src={profileForm.profileImageUrl}
                  alt="Vendor profile"
                  className="h-14 w-14 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold text-lg">
                  {vendorInitial}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs text-gray-600 block">
                  Profile image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadVendorProfileImage(e.target.files?.[0] || null)}
                    className="mt-1 block text-xs"
                  />
                </label>
                {profileUploading && <p className="text-xs text-gray-500">Uploading image...</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
              <p><strong>Status:</strong> {vendorProfile.status}</p>
              <p><strong>Business:</strong> {vendorProfile.businessName}</p>
              <p><strong>Kontakt:</strong> {vendorProfile.contactName}</p>
              <p><strong>E-Mail:</strong> {vendorProfile.email}</p>
              {vendorProfile.city && <p><strong>Stadt:</strong> {vendorProfile.city}</p>}
              {vendorProfile.address && <p><strong>Address:</strong> {vendorProfile.address}</p>}
              {vendorProfile.websiteUrl && <p><strong>Website:</strong> {vendorProfile.websiteUrl}</p>}
              {vendorProfile.portfolioUrl && <p><strong>Portfolio URL:</strong> {vendorProfile.portfolioUrl}</p>}
              <p><strong>Stripe Connect:</strong> {vendorProfile.stripeAccountId || 'Nicht verbunden'}</p>
              <p><strong>Payout readiness:</strong> {vendorProfile.payoutReadiness?.ready ? 'Ready' : `Not ready${vendorProfile.payoutReadiness?.reason ? ` (${vendorProfile.payoutReadiness.reason})` : ''}`}</p>
              {stripeStatus && (
                <>
                  <p><strong>Stripe charges_enabled:</strong> {stripeStatus.chargesEnabled ? 'Ja' : 'Nein'}</p>
                  <p><strong>Stripe payouts_enabled:</strong> {stripeStatus.payoutsEnabled ? 'Ja' : 'Nein'}</p>
                  <p><strong>Stripe details_submitted:</strong> {stripeStatus.detailsSubmitted ? 'Ja' : 'Nein'}</p>
                </>
              )}
            </div>
            <div className="mt-4 rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Services you provide</p>
              <div className="flex flex-wrap gap-2">
                {vendorServices.length > 0 ? vendorServices.map((service) => (
                  <span key={service} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
                    {service}
                  </span>
                )) : <span className="text-xs text-gray-500">No services posted yet.</span>}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Edit profile details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Contact person"
                  value={profileForm.contactName}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, contactName: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5"
                />
                <input
                  type="text"
                  placeholder="City"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 md:col-span-2"
                />
                <input
                  type="url"
                  placeholder="Website URL"
                  value={profileForm.websiteUrl}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5"
                />
                <input
                  type="url"
                  placeholder="Portfolio URL"
                  value={profileForm.portfolioUrl}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, portfolioUrl: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5"
                />
              </div>
              <textarea
                rows={3}
                placeholder="Business intro"
                value={profileForm.businessIntro}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, businessIntro: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveProfileDetails}
                  disabled={profileSaving}
                  className="rounded-lg bg-purple-600 text-white px-4 py-2.5 disabled:opacity-60"
                >
                  {profileSaving ? 'Saving profile...' : 'Save profile details'}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startStripeOnboarding}
                disabled={stripeLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {stripeLoading ? 'Stripe Link wird erstellt...' : vendorProfile.stripeAccountId ? 'Stripe Connect fortsetzen' : 'Stripe Connect starten'}
              </button>
              <button
                type="button"
                onClick={() => loadStripeStatus(vendorEmail)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Stripe Status aktualisieren
              </button>
            </div>
            {!vendorProfile.stripeAccountId && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Keine Stripe Connect ID hinterlegt. Zahlungen gehen an die Plattform, Vendor-Auszahlung braucht `acct_...`.
              </div>
            )}
            {stripeStatus?.pendingRequirements?.length ? (
              <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                Fehlende Stripe Angaben: {stripeStatus.pendingRequirements.join(', ')}
              </div>
            ) : null}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.sendToAdmin}</h2>
          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              placeholder="Betreff"
              value={inquirySubject}
              onChange={(e) => setInquirySubject(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5"
            />
            <textarea
              rows={3}
              placeholder="Deine Nachricht an Admin"
              value={inquiryMessage}
              onChange={(e) => setInquiryMessage(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5"
            />
            <button type="button" onClick={submitInquiry} className="rounded-lg bg-gray-900 text-white px-4 py-2.5 w-fit">
              Anfrage senden
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.replies}</h2>
          {vendorInquiries.length === 0 && (
            <p className="text-sm text-gray-600">{tx.noReplies}</p>
          )}
          <div className="space-y-3">
            {vendorInquiries.map((inquiry) => (
              <div key={inquiry.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900">{inquiry.subject}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{inquiry.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{new Date(inquiry.createdAt).toLocaleString()}</p>
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{inquiry.message}</p>
                {inquiry.adminReply && (
                  <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      {isDe ? 'Admin Antwort' : 'Admin reply'}
                    </p>
                    <p className="text-sm text-indigo-900 whitespace-pre-wrap mt-1">{inquiry.adminReply}</p>
                    {(inquiry.adminReplyAttachments || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(inquiry.adminReplyAttachments || []).map((url, idx) => (
                          <a
                            key={`${inquiry.id}-attachment-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 break-all"
                          >
                            {isDe ? 'Datei oeffnen' : 'Open file'}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.servicePosts}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input
              type="text"
              placeholder="Titel"
              value={postForm.title}
              onChange={(e) => setPostForm((p) => ({ ...p, title: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2.5"
            />
            <input
              type="text"
              placeholder="Service (z. B. DJ)"
              value={postForm.serviceName}
              onChange={(e) => setPostForm((p) => ({ ...p, serviceName: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2.5"
            />
            <input
              type="text"
              placeholder="Stadt"
              value={postForm.city}
              onChange={(e) => setPostForm((p) => ({ ...p, city: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2.5"
            />
            <input
              type="number"
              placeholder="Basispreis (EUR)"
              value={postForm.basePrice}
              onChange={(e) => setPostForm((p) => ({ ...p, basePrice: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>
          <AvailabilityCalendar
            value={postAvailability}
            onChange={setPostAvailability}
            title="Availability calendar"
          />
          <textarea
            rows={2}
            placeholder="Beschreibung"
            value={postForm.description}
            onChange={(e) => setPostForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 mb-3"
          />
          <button type="button" onClick={createPost} className="rounded-lg bg-purple-600 text-white px-4 py-2.5">
            Post erstellen
          </button>
          {postSuccess && (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {postSuccess}
            </div>
          )}
          <div className="mt-4 space-y-3">
            {posts.length === 0 && <div className="text-sm text-gray-600">Noch keine Posts vorhanden.</div>}
            {posts.map((post) => (
              <div key={post.id} className="rounded-lg border border-gray-200 p-4">
                {editingPostId === post.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editPostForm.title}
                      onChange={(e) => setEditPostForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                      placeholder="Titel"
                    />
                    <input
                      type="text"
                      value={editPostForm.serviceName}
                      onChange={(e) => setEditPostForm((p) => ({ ...p, serviceName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                      placeholder="Service"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={editPostForm.city}
                        onChange={(e) => setEditPostForm((p) => ({ ...p, city: e.target.value }))}
                        className="rounded-lg border border-gray-300 px-3 py-2.5"
                        placeholder="Stadt"
                      />
                      <input
                        type="number"
                        value={editPostForm.basePrice}
                        onChange={(e) => setEditPostForm((p) => ({ ...p, basePrice: e.target.value }))}
                        className="rounded-lg border border-gray-300 px-3 py-2.5"
                        placeholder="Basispreis (EUR)"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={editPostForm.description}
                      onChange={(e) => setEditPostForm((p) => ({ ...p, description: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                      placeholder="Beschreibung"
                    />
                    <AvailabilityCalendar
                      value={editPostAvailability}
                      onChange={setEditPostAvailability}
                      title="Availability calendar"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => savePostEdit(post.id)}
                        className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm"
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPostId(null);
                          setEditPostAvailability({});
                        }}
                        className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{post.title}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditPost(post)}
                          className="rounded-lg bg-purple-100 text-purple-700 px-3 py-1.5 text-sm"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePostActive(post)}
                          className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm"
                        >
                          {post.isActive ? 'Deaktivieren' : 'Aktivieren'}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">{post.serviceName} | {post.city || '-'} | EUR {post.basePrice || 0}</p>
                    {post.description && <p className="text-sm text-gray-600 mt-1">{post.description}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      Availability days: {Object.keys(normalizeAvailability(post.availability || {})).length}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900">{tx.openRequests}</h2>
          <p className="text-sm text-gray-600">{tx.requestFlowHint}</p>
          {loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
              {tx.loadingOpenRequests}
            </div>
          )}
          {!loading && visibleOpenRequests.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
              {vendorServices.length > 0 ? 'No requests matched to your posted services yet.' : tx.noOpenRequests}
            </div>
          )}

          {visibleOpenRequests.map((request) => (
            <div key={request.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{request.id}</h2>
                  <p className="text-xs text-gray-500 mt-1">{tx.requestDetails}</p>
                </div>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700">
                  {tx.budgetLabel}: EUR {request.budget.toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-2">{tx.customer}: {request.customerName} ({request.customerEmail})</p>
              {request.customerPhone && <p className="text-sm text-gray-600 mt-1">{tx.phone}: {request.customerPhone}</p>}
              <p className="text-sm text-orange-700 mt-1 font-medium">{tx.deadline}: {new Date(request.expiresAt).toLocaleString()}</p>
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">{tx.matchedForYou}</p>
                {(requestHighlightsById[request.id]?.matched || []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(requestHighlightsById[request.id]?.matched || []).map((service, index) => (
                      <span key={`${request.id}-match-${index}`} className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                        {service}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-green-700">{tx.noSpecificMatch}</p>
                )}
              </div>
              {(requestHighlightsById[request.id]?.others || []).length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tx.otherRequested}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(requestHighlightsById[request.id]?.others || []).map((service, index) => (
                      <span key={`${request.id}-other-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-600">
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {getVendorVisibleNote(request.notes || '') && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{tx.note}</p>
                  <p className="text-sm text-gray-700">{getVendorVisibleNote(request.notes || '')}</p>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="number"
                  min={1}
                  placeholder={tx.yourPrice}
                  value={priceByRequest[request.id] || ''}
                  onChange={(e) => setPriceByRequest((p) => ({ ...p, [request.id]: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5"
                />
                <input
                  type="text"
                  placeholder={tx.optionalMessage}
                  value={messageByRequest[request.id] || ''}
                  onChange={(e) => setMessageByRequest((p) => ({ ...p, [request.id]: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 md:col-span-2"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyOffer(request.id)}
                  className="rounded-lg bg-purple-600 text-white px-4 py-2.5 hover:bg-purple-700"
                >
                  {tx.sendOffer}
                </button>
                <button
                  type="button"
                  onClick={() => declineRequest(request.id)}
                  disabled={decliningRequestId === request.id}
                  className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-2.5 hover:bg-red-100 disabled:opacity-60"
                >
                  {decliningRequestId === request.id ? tx.declining : tx.declineRequest}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900">{tx.myOffers}</h2>
          {offersLoading && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-600">{tx.loadingOffers}</div>
          )}
          {!offersLoading && myOffers.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-600">{tx.noOffersYet}</div>
          )}
          {myOffers.map((offer) => (
            <div key={offer.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-medium text-gray-900">{offer.request.id}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{getOfferStatusLabel(offer.status)}</span>
              </div>
              {editingOfferId === offer.id ? (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="number"
                    min={1}
                    value={editOfferPrice}
                    onChange={(e) => setEditOfferPrice(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2.5"
                    placeholder={tx.yourPrice}
                  />
                  <input
                    type="text"
                    value={editOfferMessage}
                    onChange={(e) => setEditOfferMessage(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2.5 md:col-span-2"
                    placeholder={tx.optionalMessage}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-700 mt-2">
                  {tx.requestStatus}: {offer.request.status} | {tx.yourPriceLabel}: EUR {offer.price.toLocaleString()}
                </p>
              )}
              <p className="text-sm text-gray-600 mt-1">{tx.payment}: {getPaymentStatusLabel(offer.paymentStatus)}</p>
              {offer.status === 'accepted' ? (
                <p className="mt-2 text-xs text-green-700">{tx.customerCanPay}</p>
              ) : (
                <p className="mt-2 text-xs text-gray-600">{tx.waitingCustomerDecision}</p>
              )}
              {offer.status === 'pending' && offer.paymentStatus !== 'paid' && (
                <div className="mt-3 flex items-center gap-2">
                  {editingOfferId === offer.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveEditedOffer(offer.id)}
                        disabled={savingOfferId === offer.id}
                        className="rounded-lg bg-purple-600 text-white px-3 py-2 text-sm hover:bg-purple-700 disabled:opacity-60"
                      >
                        {savingOfferId === offer.id ? tx.saving : tx.save}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditOffer}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {tx.cancel}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditOffer(offer)}
                      className="rounded-lg border border-purple-300 text-purple-700 px-3 py-2 text-sm hover:bg-purple-50"
                    >
                      {tx.editOffer}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  completeVendorTraining,
  createStripeConnectOnboarding,
  createVendorPost,
  declineVendorRequest,
  getVendorCompliance,
  getStripeConnectStatus,
  getOpenRequests,
  getVendorOffers,
  getVendorPosts,
  getVendorProfile,
  sendVendorInquiry,
  updateVendorOffer,
  updateVendorPost,
} from '../utils/api';
import { getCurrentUser } from '../utils/auth';
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
  const [postForm, setPostForm] = useState({
    title: '',
    serviceName: '',
    description: '',
    city: '',
    basePrice: '',
    availabilityJson: '{}',
  });
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostForm, setEditPostForm] = useState({
    title: '',
    serviceName: '',
    description: '',
    city: '',
    basePrice: '',
    availabilityJson: '{}',
  });
  const navigate = useNavigate();

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
    const source = [
      vendorName,
      vendorProfile?.businessName || '',
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
  }, [posts, vendorName, vendorProfile?.businessName]);

  const requestHighlightsById = useMemo(() => {
    const byId: Record<string, { matched: string[]; others: string[] }> = {};
    for (const request of openRequests) {
      const selected = Array.isArray(request.selectedServices) ? request.selectedServices : [];
      const matched = selected.filter((service) =>
        textMatchesVendor(service, vendorMatchProfile.keywords, vendorMatchProfile.categories),
      );
      byId[request.id] = {
        matched: matched.length > 0 ? matched : selected.slice(0, 1),
        others: selected.filter((service) => !matched.includes(service)),
      };
    }
    return byId;
  }, [openRequests, vendorMatchProfile.categories, vendorMatchProfile.keywords]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden der Anfrage an Admin.');
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
        availability: (() => {
          try {
            const parsed = JSON.parse(postForm.availabilityJson || '{}');
            return typeof parsed === 'object' && parsed ? parsed : {};
          } catch {
            return {};
          }
        })(),
      });
      setPostForm({ title: '', serviceName: '', description: '', city: '', basePrice: '', availabilityJson: '{}' });
      await loadPosts(vendorEmail);
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
      availabilityJson: JSON.stringify(post.availability || {}, null, 2),
    });
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
    let availability: Record<string, boolean> | undefined = undefined;
    try {
      const parsed = JSON.parse(editPostForm.availabilityJson || '{}');
      if (typeof parsed === 'object' && parsed) {
        availability = parsed as Record<string, boolean>;
      }
    } catch {
      setError('Verfuegbarkeit muss gueltiges JSON sein.');
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
        availability,
      });
      setEditingPostId(null);
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
              disabled={Boolean(vendorCompliance?.trainingCompleted) || complianceLoading || !vendorEmail}
              onClick={async () => {
                if (!vendorEmail.trim()) return;
                setComplianceLoading(true);
                setError('');
                try {
                  const data = await completeVendorTraining({ vendorEmail: vendorEmail.trim() });
                  setVendorCompliance(data.compliance);
                  if (data.compliance.canPublish) {
                    await Promise.all([loadOpenRequests(), loadPosts(vendorEmail.trim())]);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to complete training.');
                } finally {
                  setComplianceLoading(false);
                }
              }}
              className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm hover:bg-black disabled:opacity-60"
            >
              {vendorCompliance?.trainingCompleted ? 'Training completed' : (complianceLoading ? 'Saving...' : 'Mark training complete')}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
              <p><strong>Status:</strong> {vendorProfile.status}</p>
              <p><strong>Business:</strong> {vendorProfile.businessName}</p>
              <p><strong>Kontakt:</strong> {vendorProfile.contactName}</p>
              <p><strong>E-Mail:</strong> {vendorProfile.email}</p>
              {vendorProfile.city && <p><strong>Stadt:</strong> {vendorProfile.city}</p>}
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
          <textarea
            rows={2}
            placeholder='Verfuegbarkeit als JSON, z. B. {"2026-03-10": true}'
            value={postForm.availabilityJson}
            onChange={(e) => setPostForm((p) => ({ ...p, availabilityJson: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 mb-3"
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
                    <textarea
                      rows={3}
                      value={editPostForm.availabilityJson}
                      onChange={(e) => setEditPostForm((p) => ({ ...p, availabilityJson: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-xs"
                      placeholder='{"2026-03-10": true}'
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
                        onClick={() => setEditingPostId(null)}
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
          {!loading && openRequests.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
              {tx.noOpenRequests}
            </div>
          )}

          {openRequests.map((request) => (
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {(requestHighlightsById[request.id]?.matched || []).map((service, index) => (
                    <span key={`${request.id}-match-${index}`} className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                      {service}
                    </span>
                  ))}
                </div>
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
              {request.notes && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{tx.note}</p>
                  <p className="text-sm text-gray-700">{request.notes}</p>
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

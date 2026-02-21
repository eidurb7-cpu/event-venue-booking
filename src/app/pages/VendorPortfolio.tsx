import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ServiceRequest,
  VendorCompliance,
  StripeConnectStatus,
  VendorApplication,
  VendorOfferWithRequest,
  VendorPost,
  acceptVendorContract,
  applyVendorOffer,
  completeVendorTraining,
  createStripeConnectOnboarding,
  createVendorPost,
  getVendorCompliance,
  getStripeConnectStatus,
  getOpenRequests,
  getVendorOffers,
  getVendorPosts,
  getVendorProfile,
  sendVendorInquiry,
  updateVendorPost,
} from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

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
  };
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [vendorProfile, setVendorProfile] = useState<VendorApplication | null>(null);
  const [vendorCompliance, setVendorCompliance] = useState<VendorCompliance | null>(null);
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
      return;
    }
    try {
      const data = await getVendorCompliance(email.trim());
      setVendorCompliance(data.compliance);
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
              You cannot publish listings or respond to requests until all checklist items are complete.
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
          {loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
              Lade offene Anfragen...
            </div>
          )}
          {!loading && openRequests.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
              Keine offenen Anfragen vorhanden.
            </div>
          )}

          {openRequests.map((request) => (
            <div key={request.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{request.id}</h2>
                <span className="text-sm text-gray-600">Budget: EUR {request.budget.toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Kunde: {request.customerName} ({request.customerEmail})</p>
              {request.customerPhone && <p className="text-sm text-gray-600 mt-1">Telefon: {request.customerPhone}</p>}
              <p className="text-sm text-orange-700 mt-1">Frist bis: {new Date(request.expiresAt).toLocaleString()}</p>
              <p className="text-sm text-gray-700 mt-2">Services: {request.selectedServices.join(', ')}</p>
              {request.notes && <p className="text-sm text-gray-600 mt-2">{request.notes}</p>}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="number"
                  min={1}
                  placeholder="Dein Preis (EUR)"
                  value={priceByRequest[request.id] || ''}
                  onChange={(e) => setPriceByRequest((p) => ({ ...p, [request.id]: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5"
                />
                <input
                  type="text"
                  placeholder="Nachricht (optional)"
                  value={messageByRequest[request.id] || ''}
                  onChange={(e) => setMessageByRequest((p) => ({ ...p, [request.id]: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 md:col-span-2"
                />
              </div>

              <button
                type="button"
                onClick={() => applyOffer(request.id)}
                className="mt-3 rounded-lg bg-purple-600 text-white px-4 py-2.5 hover:bg-purple-700"
              >
                Auf Anfrage bewerben
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900">{tx.myOffers}</h2>
          {offersLoading && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-600">Lade deine Angebote...</div>
          )}
          {!offersLoading && myOffers.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-600">Noch keine gesendeten Angebote gefunden.</div>
          )}
          {myOffers.map((offer) => (
            <div key={offer.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-medium text-gray-900">{offer.request.id}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{offer.status}</span>
              </div>
              <p className="text-sm text-gray-700 mt-2">
                Anfrage-Status: {offer.request.status} | Dein Preis: EUR {offer.price.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">Zahlung: {offer.paymentStatus}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ServiceRequest,
  VendorApplication,
  VendorOfferWithRequest,
  VendorPost,
  applyVendorOffer,
  createVendorPost,
  getOpenRequests,
  getVendorOffers,
  getVendorPosts,
  getVendorProfile,
  sendVendorInquiry,
  updateVendorPost,
} from '../utils/api';
import { getCurrentUser } from '../utils/auth';

export default function VendorPortfolio() {
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [vendorProfile, setVendorProfile] = useState<VendorApplication | null>(null);
  const [openRequests, setOpenRequests] = useState<ServiceRequest[]>([]);
  const [myOffers, setMyOffers] = useState<VendorOfferWithRequest[]>([]);
  const [posts, setPosts] = useState<VendorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(false);
  const [error, setError] = useState('');
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
      await loadMyOffers(email.trim());
      if (vendor.status === 'approved') {
        await Promise.all([loadOpenRequests(), loadPosts(email.trim())]);
      }
    }
    setLoading(false);
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

  const createPost = async () => {
    if (!vendorEmail.trim() || !postForm.title.trim() || !postForm.serviceName.trim()) return;
    setError('');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Posts.');
    }
  };

  const togglePostActive = async (post: VendorPost) => {
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Vendor Login erforderlich</h1>
            <p className="text-gray-600 mb-4">Bitte melde dich als Vendor an, um dein Dashboard zu sehen.</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-lg bg-purple-600 text-white px-4 py-2.5 hover:bg-purple-700"
              >
                Zum Login
              </button>
              <Link to="/signup" className="rounded-lg border border-gray-300 px-4 py-2.5 hover:bg-gray-50">
                Vendor registrieren
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Vendor Dashboard</h1>
            <p className="text-gray-800">
              Dein Konto ist aktuell <strong>{vendorProfile?.status || 'pending_review'}</strong>. Bitte warten, bis Admin deine Bewerbung freigibt.
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
              <p className="text-gray-700 mt-2">Deine Bewerbung wurde abgelehnt. Bitte Admin kontaktieren.</p>
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendor Dashboard</h1>
          <p className="text-gray-600">Status: approved. Du kannst jetzt Angebote senden und deine Services verwalten.</p>
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        {vendorProfile && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Mein Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
              <p><strong>Status:</strong> {vendorProfile.status}</p>
              <p><strong>Business:</strong> {vendorProfile.businessName}</p>
              <p><strong>Kontakt:</strong> {vendorProfile.contactName}</p>
              <p><strong>E-Mail:</strong> {vendorProfile.email}</p>
              {vendorProfile.city && <p><strong>Stadt:</strong> {vendorProfile.city}</p>}
              {vendorProfile.websiteUrl && <p><strong>Website:</strong> {vendorProfile.websiteUrl}</p>}
              {vendorProfile.portfolioUrl && <p><strong>Portfolio URL:</strong> {vendorProfile.portfolioUrl}</p>}
              <p><strong>Stripe Connect:</strong> {vendorProfile.stripeAccountId || 'Nicht verbunden'}</p>
            </div>
            {!vendorProfile.stripeAccountId && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Keine Stripe Connect ID hinterlegt. Zahlungen gehen an die Plattform, Vendor-Auszahlung braucht `acct_...`.
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Anfrage an Admin senden</h2>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Meine Service-Posts & Verfuegbarkeit</h2>
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
          <h2 className="text-2xl font-semibold text-gray-900">Offene Kundenanfragen</h2>
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
          <h2 className="text-2xl font-semibold text-gray-900">Meine gesendeten Angebote</h2>
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

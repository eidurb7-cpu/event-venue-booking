import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, LineChart, Line } from 'recharts';
import { toast } from 'sonner';
import {
  AdminAuditLogRow,
  AdminPayoutRow,
  AdminVendorComplianceRow,
  ServiceRequest,
  VendorApplication,
  adminLogin,
  backfillAdminVendorCompliance,
  getAdminAuditLogs,
  getAdminPayouts,
  getAdminInquiries,
  getAdminOverview,
  getAdminRequests,
  getAdminVendorCompliance,
  getAdminVendorApplications,
  seedAdminServices,
  seedAdminVendors,
  setOfferStatus,
  releaseAdminPayout,
  updateVendorApplicationStatus,
} from '../utils/api';
import { clearAdminSession, getAdminToken, getAdminUser, setAdminSession } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

type Overview = {
  customers: number;
  vendorApplications: number;
  openRequests: number;
  closedRequests: number;
  expiredRequests: number;
  totalOffers: number;
};

export default function AdminDashboard() {
  const { language } = useLanguage();
  const isDe = language === 'de';
  const tx = {
    title: isDe ? 'Admin Dashboard' : 'Admin Dashboard',
    loginPrompt: isDe ? 'Bitte als Admin einloggen, um Backend-Daten zu verwalten.' : 'Please sign in as admin to manage backend data.',
    loginEmail: isDe ? 'Admin E-Mail' : 'Admin email',
    loginPassword: isDe ? 'Admin Passwort' : 'Admin password',
    wait: isDe ? 'Bitte warten...' : 'Please wait...',
    login: isDe ? 'Admin Login' : 'Admin login',
    refresh: isDe ? 'Aktualisieren' : 'Refresh',
    seedServices: isDe ? 'Services seeden' : 'Seed services',
    seedVendors: isDe ? 'Demo Vendors seeden' : 'Seed demo vendors',
    openApplications: isDe ? 'Bewerbungen oeffnen' : 'Open applications',
    openProposals: isDe ? 'Proposals oeffnen' : 'Open proposals',
    logout: isDe ? 'Logout' : 'Logout',
    analytics: isDe ? 'Algorithmische Analysen' : 'Algorithmic Analytics',
    applications: isDe ? 'Vendor-Bewerbungen' : 'Vendor Applications',
    requests: isDe ? 'Requests und Offers' : 'Requests and Offers',
    inquiries: isDe ? 'Vendor Inquiries an Admin' : 'Vendor inquiries to admin',
    approve: isDe ? 'Freigeben' : 'Approve',
    reject: isDe ? 'Ablehnen' : 'Reject',
    backToPending: isDe ? 'Zurueck auf Pending' : 'Back to pending',
  };
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [adminName, setAdminName] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inquiries, setInquiries] = useState<
    Array<{ id: string; vendorEmail: string; subject: string; message: string; status: string; createdAt: string }>
  >([]);
  const [openApplicationIds, setOpenApplicationIds] = useState<Record<string, boolean>>({});
  const [openRequestIds, setOpenRequestIds] = useState<Record<string, boolean>>({});
  const [selectedApplication, setSelectedApplication] = useState<VendorApplication | null>(null);
  const [compliances, setCompliances] = useState<AdminVendorComplianceRow[]>([]);
  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([]);
  const [releasingPayoutId, setReleasingPayoutId] = useState('');
  const [backfillingCompliance, setBackfillingCompliance] = useState(false);
  const appStatusByEmail = Object.fromEntries(applications.map((app) => [String(app.email || '').toLowerCase(), app.status]));

  const statusChartData = [
    { name: 'Open', value: requests.filter((r) => r.status === 'open').length },
    { name: 'Closed', value: requests.filter((r) => r.status === 'closed').length },
    { name: 'Expired', value: requests.filter((r) => r.status === 'expired').length },
  ];

  const offerCoverage = requests.length
    ? Math.round((requests.filter((r) => r.offers.length > 0).length / requests.length) * 100)
    : 0;
  const expiredRate = requests.length
    ? requests.filter((r) => r.status === 'expired').length / requests.length
    : 0;
  const pendingVendorRate = applications.length
    ? applications.filter((a) => a.status === 'pending_review').length / applications.length
    : 0;
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - expiredRate * 45 - pendingVendorRate * 25 - (100 - offerCoverage) * 0.3),
    ),
  );

  const dayMap: Record<string, { day: string; requests: number; inquiries: number; applications: number }> = {};
  for (const r of requests) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { day, requests: 0, inquiries: 0, applications: 0 };
    dayMap[day].requests += 1;
  }
  for (const i of inquiries) {
    const day = new Date(i.createdAt).toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { day, requests: 0, inquiries: 0, applications: 0 };
    dayMap[day].inquiries += 1;
  }
  for (const a of applications) {
    const day = new Date(a.createdAt).toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { day, requests: 0, inquiries: 0, applications: 0 };
    dayMap[day].applications += 1;
  }
  const activityTrendData = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day)).slice(-14);

  useEffect(() => {
    const savedToken = getAdminToken();
    const savedUser = getAdminUser();
    if (savedToken) {
      setAdminToken(savedToken);
      if (savedUser?.name) {
        setAdminName(savedUser.name);
        if (savedUser.email) setAdminSession(savedToken, savedUser);
      }
      loadDashboard(savedToken);
    }
  }, []);

  const loadDashboard = async (token = adminToken) => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      const [overviewData, applicationsData, requestsData, inquiriesData, payoutData, auditData] = await Promise.all([
        getAdminOverview(token),
        getAdminVendorApplications(token),
        getAdminRequests(token),
        getAdminInquiries(token),
        getAdminPayouts(token).catch(() => ({ payouts: [] as AdminPayoutRow[] })),
        getAdminAuditLogs(token).catch(() => ({ logs: [] as AdminAuditLogRow[] })),
      ]);
      const complianceData = await getAdminVendorCompliance(token).catch(() => ({ compliances: [] as AdminVendorComplianceRow[] }));
      setOverview(overviewData.overview);
      setApplications(applicationsData.applications);
      setRequests(requestsData.requests);
      setInquiries(inquiriesData.inquiries);
      setCompliances(complianceData.compliances || []);
      setPayouts(payoutData.payouts || []);
      setAuditLogs(auditData.logs || []);
      setAdminToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Admin Dashboards.');
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setError('Bitte Admin E-Mail und Passwort eingeben.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await adminLogin({ email: adminEmail, password: adminPassword });
      setAdminToken(data.token);
      setAdminName(data.admin.name);
      setAdminSession(data.token, data.admin);
      await loadDashboard(data.token);
      setAdminPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin-Login fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAdminSession();
    setAdminToken('');
    setAdminName('');
    setAdminEmail('');
    setAdminPassword('');
    setOverview(null);
    setApplications([]);
    setRequests([]);
    setPayouts([]);
    setAuditLogs([]);
    setError('');
  };

  const retryPayoutRelease = async (payoutId: string) => {
    setError('');
    setReleasingPayoutId(payoutId);
    try {
      const result = await releaseAdminPayout(adminToken, payoutId);
      if (!result.released && result.reason) {
        setError(result.reason);
      }
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release payout.');
    } finally {
      setReleasingPayoutId('');
    }
  };

  const updateApplication = async (applicationId: string, status: 'approved' | 'rejected' | 'pending_review') => {
    setError('');
    try {
      const reviewNote =
        status === 'rejected'
          ? window.prompt('Optional review note for vendor (shown in database):', '') || undefined
          : undefined;
      const result = await updateVendorApplicationStatus(adminToken, applicationId, status, reviewNote);
      setApplications((prev) => prev.map((app) => (app.id === applicationId ? result.application : app)));
      setSelectedApplication((prev) => (prev && prev.id === applicationId ? result.application : prev));
      // Refresh related sections in background, but do not block immediate UI update.
      void loadDashboard();
      if (status === 'approved') toast.success(isDe ? 'Vendor freigegeben.' : 'Vendor approved.');
      if (status === 'rejected') toast.success(isDe ? 'Vendor abgelehnt.' : 'Vendor rejected.');
      if (status === 'pending_review') toast.success(isDe ? 'Vendor auf Pending gesetzt.' : 'Vendor moved to pending.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Aktualisieren der Vendor-Anfrage.';
      setError(message);
      toast.error(message);
    }
  };

  const updateOffer = async (requestId: string, offerId: string, status: 'accepted' | 'declined' | 'ignored') => {
    setError('');
    try {
      await setOfferStatus(requestId, offerId, status, { adminToken });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Angebots.');
    }
  };

  const seedServices = async () => {
    setError('');
    try {
      await seedAdminServices(adminToken);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Seed von Services.');
    }
  };

  const seedVendors = async () => {
    setError('');
    try {
      await seedAdminVendors(adminToken);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Seed von Demo-Vendors.');
    }
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const runComplianceBackfill = async () => {
    setBackfillingCompliance(true);
    setError('');
    try {
      const result = await backfillAdminVendorCompliance(adminToken);
      await loadDashboard();
      alert(`Compliance backfill finished: ${result.migrated}/${result.total}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compliance backfill failed.');
    } finally {
      setBackfillingCompliance(false);
    }
  };

  const toggleApplication = (id: string) => {
    setOpenApplicationIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openApplicationDetails = (app: VendorApplication) => {
    setSelectedApplication(app);
  };

  const closeApplicationDetails = () => {
    setSelectedApplication(null);
  };

  const toggleRequest = (id: string) => {
    setOpenRequestIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-white rounded-xl shadow-md p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600 mb-6">{tx.loginPrompt}</p>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                login();
              }}
            >
              <input
                type="email"
                placeholder={tx.loginEmail}
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <input
                type="password"
                placeholder={tx.loginPassword}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-purple-600 text-white py-2.5 font-medium hover:bg-purple-700"
              >
                {loading ? tx.wait : tx.login}
              </button>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-7xl space-y-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{tx.title}</h1>
              <p className="text-gray-600 mt-1">{isDe ? 'Backend Uebersicht, Vendor-Freigaben und Offer-Management.' : 'Backend overview, vendor approvals, and offer management.'} {adminName ? `${isDe ? 'Eingeloggt als' : 'Signed in as'} ${adminName}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadDashboard()}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50"
              >
                {tx.refresh}
              </button>
              <button
                type="button"
                onClick={seedServices}
                className="rounded-lg border border-purple-300 text-purple-700 px-4 py-2.5 text-sm hover:bg-purple-50"
              >
                {tx.seedServices}
              </button>
              <button
                type="button"
                onClick={seedVendors}
                className="rounded-lg border border-green-300 text-green-700 px-4 py-2.5 text-sm hover:bg-green-50"
              >
                {tx.seedVendors}
              </button>
              <button
                type="button"
                onClick={() => jumpTo('admin-applications')}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50"
              >
                {tx.openApplications}
              </button>
              <button
                type="button"
                onClick={() => jumpTo('admin-requests')}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50"
              >
                {tx.openProposals}
              </button>
              <button
                type="button"
                onClick={() => jumpTo('admin-compliance')}
                className="rounded-lg border border-indigo-300 text-indigo-700 px-4 py-2.5 text-sm hover:bg-indigo-50"
              >
                Compliance
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm hover:bg-black"
              >
                {tx.logout}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Kunden" value={overview.customers} />
            <StatCard title="Vendor-Anfragen" value={overview.vendorApplications} />
            <StatCard title="Offene Requests" value={overview.openRequests} />
            <StatCard title="Geschlossene Requests" value={overview.closedRequests} />
            <StatCard title="Abgelaufene Requests" value={overview.expiredRequests} />
            <StatCard title="Gesamte Offers" value={overview.totalOffers} />
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.analytics}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-600">Platform Health Score</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{healthScore}/100</p>
              <p className="text-xs text-gray-500 mt-1">Based on expiry rate, pending vendors, and offer coverage.</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-600">Offer Coverage</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{offerCoverage}%</p>
              <p className="text-xs text-gray-500 mt-1">Requests that received at least one offer.</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-600">Risk Flag</p>
              <p className="text-3xl font-bold mt-1">{healthScore < 55 ? 'High' : healthScore < 75 ? 'Medium' : 'Low'}</p>
              <p className="text-xs text-gray-500 mt-1">Auto-classified operational risk level.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Request Status Distribution</p>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="name" outerRadius={90}>
                    <Cell fill="#2563eb" />
                    <Cell fill="#16a34a" />
                    <Cell fill="#dc2626" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="h-72 rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Activity Trend (14 Days)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activityTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="requests" stroke="#2563eb" strokeWidth={2} />
                  <Line dataKey="applications" stroke="#16a34a" strokeWidth={2} />
                  <Line dataKey="inquiries" stroke="#9333ea" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 h-72 rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Daily Workload Mix</p>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="requests" fill="#2563eb" />
                <Bar dataKey="applications" fill="#16a34a" />
                <Bar dataKey="inquiries" fill="#9333ea" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div id="admin-applications" className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.applications}</h2>
          {loading && <p className="text-gray-600">Lade Daten...</p>}
          {!loading && applications.length === 0 && <p className="text-gray-600">Keine Vendor-Bewerbungen gefunden.</p>}
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-medium text-gray-900">{app.businessName}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleApplication(app.id)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      {openApplicationIds[app.id] ? 'Schliessen' : 'Oeffnen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openApplicationDetails(app)}
                      className="rounded-lg border border-purple-300 px-2 py-1 text-xs text-purple-700 hover:bg-purple-50"
                    >
                      Vollansicht
                    </button>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        app.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : app.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  Kontakt: {app.contactName} | {app.email}
                </p>
                {app.city && <p className="text-sm text-gray-600 mt-1">Stadt: {app.city}</p>}
                {app.compliance && (
                  <p className="text-xs text-gray-600 mt-1">
                    Compliance: admin={app.compliance.adminApproved ? 'yes' : 'no'}, contract={app.compliance.contractAccepted ? 'yes' : 'no'}, training={app.compliance.trainingCompleted ? 'yes' : 'no'}, active={app.compliance.canPublish ? 'yes' : 'no'}
                  </p>
                )}
                {openApplicationIds[app.id] && (
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
                    {app.websiteUrl && <p>Website: {app.websiteUrl}</p>}
                    {app.portfolioUrl && <p>Portfolio: {app.portfolioUrl}</p>}
                    {app.businessIntro && <p>Intro: {app.businessIntro}</p>}
                    {app.documentUrl && (
                      <p>
                        Dokument: <a className="text-purple-700 underline" href={app.documentUrl} target="_blank" rel="noreferrer">Datei oeffnen</a>
                      </p>
                    )}
                    {app.documentName && <p>Dateiname: {app.documentName}</p>}
                    {app.stripeAccountId && <p>Stripe Connect: {app.stripeAccountId}</p>}
                    {app.compliance && <p>Contract accepted: {app.compliance.contractAccepted ? 'yes' : 'no'}</p>}
                    {app.compliance && app.compliance.contractAcceptedAt && <p>Contract accepted at: {new Date(app.compliance.contractAcceptedAt).toLocaleString()}</p>}
                    {app.compliance && <p>Training completed: {app.compliance.trainingCompleted ? 'yes' : 'no'}</p>}
                    {app.compliance && app.compliance.trainingCompletedAt && <p>Training completed at: {new Date(app.compliance.trainingCompletedAt).toLocaleString()}</p>}
                    {app.reviewNote && <p>Review Note: {app.reviewNote}</p>}
                    {app.reviewedAt && <p>Reviewed At: {new Date(app.reviewedAt).toLocaleString()}</p>}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => updateApplication(app.id, 'approved')}
                    className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm hover:bg-green-700"
                  >
                    {tx.approve}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateApplication(app.id, 'rejected')}
                    className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm hover:bg-red-200"
                  >
                    {tx.reject}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateApplication(app.id, 'pending_review')}
                    className="rounded-lg bg-gray-200 text-gray-800 px-3 py-2 text-sm hover:bg-gray-300"
                  >
                    {tx.backToPending}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div id="admin-requests" className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.requests}</h2>
          {loading && <p className="text-gray-600">Lade Daten...</p>}
          {!loading && requests.length === 0 && <p className="text-gray-600">Keine Requests gefunden.</p>}
          <div className="space-y-5">
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-medium text-gray-900">{request.id}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRequest(request.id)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      {openRequestIds[request.id] ? 'Schliessen' : 'Oeffnen'}
                    </button>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        request.status === 'open'
                          ? 'bg-blue-100 text-blue-700'
                          : request.status === 'closed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  Kunde: {request.customerName} ({request.customerEmail}) | Budget: EUR {request.budget.toLocaleString()}
                </p>
                {request.customerPhone && <p className="text-sm text-gray-600 mt-1">Telefon: {request.customerPhone}</p>}
                <p className="text-sm text-gray-600 mt-1">Frist bis: {new Date(request.expiresAt).toLocaleString()}</p>
                {openRequestIds[request.id] && (
                <div className="mt-3 space-y-2">
                  {request.offers.length === 0 && <p className="text-sm text-gray-500">Keine Offers</p>}
                  {request.offers.map((offer) => (
                    <div key={offer.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {offer.vendorName} | EUR {offer.price.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              offer.status === 'accepted'
                                ? 'bg-green-100 text-green-700'
                                : offer.status === 'declined'
                                  ? 'bg-red-100 text-red-700'
                                  : offer.status === 'ignored'
                                    ? 'bg-gray-100 text-gray-700'
                                    : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {offer.status}
                          </span>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              offer.paymentStatus === 'paid'
                                ? 'bg-green-100 text-green-700'
                                : offer.paymentStatus === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : offer.paymentStatus === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            payment: {offer.paymentStatus}
                          </span>
                        </div>
                      </div>
                      {request.status === 'open' && offer.status === 'pending' && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => updateOffer(request.id, offer.id, 'accepted')}
                            className="rounded-lg bg-green-600 text-white px-3 py-2 text-xs hover:bg-green-700"
                          >
                            Akzeptieren
                          </button>
                          <button
                            type="button"
                            onClick={() => updateOffer(request.id, offer.id, 'declined')}
                            className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-xs hover:bg-red-200"
                          >
                            Ablehnen
                          </button>
                          <button
                            type="button"
                            onClick={() => updateOffer(request.id, offer.id, 'ignored')}
                            className="rounded-lg bg-gray-200 text-gray-800 px-3 py-2 text-xs hover:bg-gray-300"
                          >
                            Ignorieren
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div id="admin-compliance" className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Vendor Compliance (DB)</h2>
            <button
              type="button"
              onClick={runComplianceBackfill}
              disabled={backfillingCompliance}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {backfillingCompliance ? 'Backfilling...' : 'Backfill from legacy JSON'}
            </button>
          </div>
          {compliances.length === 0 ? (
            <p className="text-sm text-gray-600">No compliance rows found yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-3">Vendor</th>
                    <th className="py-2 pr-3">Admin</th>
                    <th className="py-2 pr-3">Contract</th>
                    <th className="py-2 pr-3">Training</th>
                    <th className="py-2 pr-3">Connect</th>
                    <th className="py-2 pr-3">Payouts</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {compliances.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{row.vendorName || '-'}</div>
                        <div className="text-xs text-gray-500">{row.vendorEmail}</div>
                      </td>
                      <td className="py-2 pr-3">{appStatusByEmail[String(row.vendorEmail || '').toLowerCase()] === 'approved' ? 'yes' : 'pending'}</td>
                      <td className="py-2 pr-3">{row.contractAccepted ? 'yes' : 'no'}</td>
                      <td className="py-2 pr-3">{row.trainingCompleted ? 'yes' : 'no'}</td>
                      <td className="py-2 pr-3">{row.connectOnboardingStatus || 'NOT_STARTED'}</td>
                      <td className="py-2 pr-3">{row.payoutsEnabled ? 'enabled' : 'disabled'}</td>
                      <td className="py-2 pr-3">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Payout Transfers</h2>
            <p className="text-xs text-gray-500">Last {payouts.length} payout rows</p>
          </div>
          {payouts.length === 0 ? (
            <p className="text-sm text-gray-600">No payout rows found yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-3">Vendor</th>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Amounts (EUR)</th>
                    <th className="py-2 pr-3">Transfer</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{row.vendorName || '-'}</div>
                        <div className="text-xs text-gray-500">{row.vendorEmail || '-'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs">{row.bookingId}</div>
                        <div className="text-xs text-gray-500">{row.bookingStatus || '-'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs">{row.invoiceId || '-'}</div>
                        <div className="text-xs text-gray-500">{row.invoiceStatus || '-'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div>Gross: {(Number(row.grossAmount || 0) / 100).toFixed(2)}</div>
                        <div>Fee: {(Number(row.platformFee || 0) / 100).toFixed(2)}</div>
                        <div>Vendor: {(Number(row.vendorNetAmount || 0) / 100).toFixed(2)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs break-all">{row.stripeTransferId || '-'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          row.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : row.status === 'failed'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}>{row.status}</span>
                      </td>
                      <td className="py-2 pr-3">
                        {row.status !== 'paid' ? (
                          <button
                            type="button"
                            onClick={() => retryPayoutRelease(row.id)}
                            disabled={releasingPayoutId === row.id}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                          >
                            {releasingPayoutId === row.id ? 'Releasing...' : 'Retry release'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Admin Audit Log</h2>
            <p className="text-xs text-gray-500">Last {auditLogs.length} entries</p>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-gray-600">No audit entries found.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Admin</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.adminId}</td>
                      <td className="py-2 pr-3">{row.action}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.targetId || '-'}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{row.metaJson || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{tx.inquiries}</h2>
          {inquiries.length === 0 && <p className="text-gray-600">Keine Vendor-Anfragen vorhanden.</p>}
          <div className="space-y-3">
            {inquiries.map((inq) => (
              <div key={inq.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-medium text-gray-900">{inq.subject}</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{inq.status}</span>
                </div>
                <p className="text-sm text-gray-700 mt-1">Von: {inq.vendorEmail}</p>
                <p className="text-sm text-gray-600 mt-1">{inq.message}</p>
              </div>
            ))}
          </div>
        </div>

        {selectedApplication && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{selectedApplication.businessName}</h3>
                  <p className="text-sm text-gray-600">Vendor-Bewerbung: {selectedApplication.id}</p>
                </div>
                <button
                  type="button"
                  onClick={closeApplicationDetails}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Schliessen
                </button>
              </div>

              <div className="space-y-4 px-5 py-4 text-sm text-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <p><strong>Status:</strong> {selectedApplication.status}</p>
                  <p><strong>Kontaktperson:</strong> {selectedApplication.contactName}</p>
                  <p><strong>E-Mail:</strong> {selectedApplication.email}</p>
                  <p><strong>Stadt:</strong> {selectedApplication.city || '-'}</p>
                  <p><strong>Erstellt:</strong> {new Date(selectedApplication.createdAt).toLocaleString()}</p>
                  <p><strong>Geprueft:</strong> {selectedApplication.reviewedAt ? new Date(selectedApplication.reviewedAt).toLocaleString() : '-'}</p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <p><strong>Website:</strong> {selectedApplication.websiteUrl || '-'}</p>
                  <p><strong>Portfolio:</strong> {selectedApplication.portfolioUrl || '-'}</p>
                  <p><strong>Stripe Connect:</strong> {selectedApplication.stripeAccountId || '-'}</p>
                  <p><strong>Contract accepted:</strong> {selectedApplication.compliance?.contractAccepted ? 'yes' : 'no'}</p>
                  <p><strong>Training completed:</strong> {selectedApplication.compliance?.trainingCompleted ? 'yes' : 'no'}</p>
                  <p><strong>Can publish:</strong> {selectedApplication.compliance?.canPublish ? 'yes' : 'no'}</p>
                  <p><strong>Dokumentname:</strong> {selectedApplication.documentName || '-'}</p>
                  {selectedApplication.documentUrl ? (
                    <p>
                      <strong>Dokument:</strong>{' '}
                      <a
                        className="text-purple-700 underline break-all"
                        href={selectedApplication.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Datei oeffnen
                      </a>
                    </p>
                  ) : (
                    <p><strong>Dokument:</strong> -</p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="font-medium text-gray-900 mb-1">Business Intro</p>
                  <p className="whitespace-pre-wrap break-words text-gray-700">
                    {selectedApplication.businessIntro || '-'}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="font-medium text-gray-900 mb-1">Review Note</p>
                  <p className="whitespace-pre-wrap break-words text-gray-700">
                    {selectedApplication.reviewNote || '-'}
                  </p>
                </div>
              </div>

              <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-gray-200 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={async () => {
                    await updateApplication(selectedApplication.id, 'approved');
                    closeApplicationDetails();
                  }}
                  className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm hover:bg-green-700"
                >
                  {tx.approve}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateApplication(selectedApplication.id, 'rejected');
                    closeApplicationDetails();
                  }}
                  className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm hover:bg-red-200"
                >
                  {tx.reject}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateApplication(selectedApplication.id, 'pending_review');
                    closeApplicationDetails();
                  }}
                  className="rounded-lg bg-gray-200 text-gray-800 px-3 py-2 text-sm hover:bg-gray-300"
                >
                  {tx.backToPending}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value.toLocaleString()}</p>
    </div>
  );
}

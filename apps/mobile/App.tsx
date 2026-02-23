import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import {
  adminLogin,
  confirmVendorCompliance,
  createVendorPost,
  getAdminOverview,
  getAdminVendorApplications,
  getCustomerRequestsByEmail,
  getPublicVendorPosts,
  getVendorCompliance,
  getVendorPosts,
  getVendorProfile,
  vendorLogin,
} from './src/api';
import { clearSession, loadCustomerPlan, loadSession, MobilePlannedService, saveCustomerPlan, saveSession } from './src/storage';
import type { AdminVendorApplication, PublicVendorPost, ServiceRequest, VendorPost } from './src/types';

type Mode = 'home' | 'customer' | 'vendor' | 'admin';

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function availabilityStatus(post: { availability?: Record<string, boolean> }, date: string) {
  if (!date) return 'none';
  const map = post.availability || {};
  if (!Object.prototype.hasOwnProperty.call(map, date)) return 'unknown';
  return map[date] ? 'available' : 'blocked';
}

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [publicPosts, setPublicPosts] = useState<PublicVendorPost[]>([]);
  const [postDateById, setPostDateById] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<MobilePlannedService[]>([]);

  const [vendorProfile, setVendorProfile] = useState<any>(null);
  const [vendorCompliance, setVendorCompliance] = useState<any>(null);
  const [vendorPosts, setVendorPosts] = useState<VendorPost[]>([]);
  const [vendorPostForm, setVendorPostForm] = useState({
    title: '',
    serviceName: '',
    city: '',
    basePrice: '',
    date: '',
    dateState: 'available' as 'available' | 'blocked',
    availability: {} as Record<string, boolean>,
  });

  const [adminOverview, setAdminOverview] = useState<any>(null);
  const [adminApplications, setAdminApplications] = useState<AdminVendorApplication[]>([]);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      const savedPlan = await loadCustomerPlan();
      setPlan(savedPlan);
      if (!session.token || !session.role) return;
      setToken(session.token);
      setEmail(session.email);
      if (session.role === 'vendor') setMode('vendor');
      if (session.role === 'admin') setMode('admin');
    })();
  }, []);

  useEffect(() => {
    void saveCustomerPlan(plan);
  }, [plan]);

  const headerTitle = useMemo(() => {
    if (mode === 'customer') return 'Customer Mobile';
    if (mode === 'vendor') return 'Vendor Mobile';
    if (mode === 'admin') return 'Admin Mobile';
    return 'EventVenue Mobile';
  }, [mode]);

  const doVendorLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const login = await vendorLogin(email.trim(), password);
      setToken(login.token);
      await saveSession(login.token, 'vendor', login.user.email);
      setMode('vendor');
      setEmail(login.user.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vendor login failed');
    } finally {
      setLoading(false);
    }
  };

  const doAdminLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const login = await adminLogin(email.trim(), password);
      setToken(login.token);
      await saveSession(login.token, 'admin', login.admin.email);
      setMode('admin');
      setEmail(login.admin.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerData = async () => {
    setLoading(true);
    setError('');
    try {
      const [reqs, posts] = await Promise.all([
        getCustomerRequestsByEmail(email.trim()),
        getPublicVendorPosts(),
      ]);
      setRequests(reqs.requests || []);
      setPublicPosts(posts.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customer data');
    } finally {
      setLoading(false);
    }
  };

  const addPostToPlan = (post: PublicVendorPost) => {
    const date = String(postDateById[post.id] || '').trim();
    if (!date) {
      setError('Choose a date for this post first.');
      return;
    }
    const state = availabilityStatus(post, date);
    if (state === 'blocked') {
      setError('Selected date is blocked for this vendor post.');
      return;
    }
    const id = `post:${post.id}`;
    const item: MobilePlannedService = {
      id,
      title: post.title,
      vendorName: post.vendorName,
      serviceName: post.serviceName,
      date,
      availability: post.availability || {},
      basePrice: post.basePrice ?? null,
    };
    setPlan((prev) => {
      const filtered = prev.filter((entry) => entry.id !== id);
      return [item, ...filtered];
    });
    setError('');
  };

  const updatePlanDate = (id: string, date: string) => {
    setPlan((prev) => prev.map((item) => (item.id === id ? { ...item, date } : item)));
  };

  const removePlanItem = (id: string) => {
    setPlan((prev) => prev.filter((item) => item.id !== id));
  };

  const loadVendorData = async () => {
    if (!token || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const [profile, compliance, posts] = await Promise.all([
        getVendorProfile(email.trim()),
        getVendorCompliance(email.trim(), token),
        getVendorPosts(email.trim(), token),
      ]);
      setVendorProfile(profile.vendor);
      setVendorCompliance(compliance.compliance);
      setVendorPosts(posts.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load vendor dashboard');
    } finally {
      setLoading(false);
    }
  };

  const addPostDateRule = () => {
    if (!vendorPostForm.date) return;
    setVendorPostForm((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [prev.date]: prev.dateState === 'available',
      },
      date: '',
    }));
  };

  const saveVendorPost = async () => {
    if (!token || !email.trim()) return;
    if (!vendorPostForm.title.trim() || !vendorPostForm.serviceName.trim()) {
      setError('Title and service name are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createVendorPost(token, {
        vendorEmail: email.trim(),
        title: vendorPostForm.title.trim(),
        serviceName: vendorPostForm.serviceName.trim(),
        city: vendorPostForm.city.trim() || undefined,
        basePrice: vendorPostForm.basePrice ? Number(vendorPostForm.basePrice) : undefined,
        availability: vendorPostForm.availability,
      });
      setVendorPostForm({
        title: '',
        serviceName: '',
        city: '',
        basePrice: '',
        date: '',
        dateState: 'available',
        availability: {},
      });
      await loadVendorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create vendor post');
    } finally {
      setLoading(false);
    }
  };

  const loadAdminData = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [overview, applications] = await Promise.all([
        getAdminOverview(token),
        getAdminVendorApplications(token),
      ]);
      setAdminOverview(overview.overview);
      setAdminApplications(applications.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  };

  const adminConfirm = async (applicationId: string, field: 'contract' | 'training') => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await confirmVendorCompliance(token, applicationId, field);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm compliance');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    setToken('');
    setPassword('');
    setMode('home');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', marginBottom: 14 }}>{headerTitle}</Text>
        {error ? (
          <View style={{ backgroundColor: '#fee2e2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <Text style={{ color: '#b91c1c' }}>{error}</Text>
          </View>
        ) : null}
        {loading ? <ActivityIndicator size="small" color="#6d28d9" style={{ marginBottom: 12 }} /> : null}

        {mode === 'home' && (
          <SectionCard title="Choose Role">
            <Pressable onPress={() => setMode('customer')} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Customer</Text>
            </Pressable>
            <Pressable onPress={() => setMode('vendor')} style={{ backgroundColor: '#1f2937', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Vendor</Text>
            </Pressable>
            <Pressable onPress={() => setMode('admin')} style={{ backgroundColor: '#065f46', borderRadius: 10, padding: 12 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Admin</Text>
            </Pressable>
          </SectionCard>
        )}

        {mode === 'customer' && (
          <>
            <SectionCard title="Customer Portfolio">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Customer email"
                autoCapitalize="none"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}
              />
              <Pressable onPress={loadCustomerData} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Refresh Customer Data</Text>
              </Pressable>
              <Text style={{ marginTop: 10, fontWeight: '700' }}>Requests: {requests.length}</Text>
            </SectionCard>

            <SectionCard title="Vendor Posts - Choose Date">
              {publicPosts.map((post) => {
                const date = postDateById[post.id] || '';
                const state = availabilityStatus(post, date);
                return (
                  <View key={post.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{post.title}</Text>
                    <Text>{post.vendorName} | {post.serviceName}</Text>
                    <Text>{post.basePrice ? `EUR ${post.basePrice}` : 'Price on request'}</Text>
                    <TextInput
                      value={date}
                      onChangeText={(value) => setPostDateById((prev) => ({ ...prev, [post.id]: value }))}
                      placeholder="YYYY-MM-DD"
                      style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginTop: 8 }}
                    />
                    <Text style={{ marginTop: 6, color: state === 'available' ? '#15803d' : state === 'blocked' ? '#b91c1c' : '#4b5563' }}>
                      {state === 'available' ? 'Available on selected date' : state === 'blocked' ? 'Blocked on selected date' : 'No explicit rule for this date'}
                    </Text>
                    <Pressable onPress={() => addPostToPlan(post)} style={{ marginTop: 8, borderWidth: 1, borderColor: '#7c3aed', borderRadius: 8, padding: 8 }}>
                      <Text style={{ textAlign: 'center', color: '#6d28d9', fontWeight: '700' }}>Save to planner</Text>
                    </Pressable>
                  </View>
                );
              })}
            </SectionCard>

            <SectionCard title="My Service Date Planner">
              {plan.length === 0 ? <Text>No planned services yet.</Text> : null}
              {plan.map((item) => {
                const state = availabilityStatus({ availability: item.availability }, item.date);
                return (
                  <View key={item.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{item.title}</Text>
                    <Text>{item.vendorName}</Text>
                    <TextInput
                      value={item.date}
                      onChangeText={(value) => updatePlanDate(item.id, value)}
                      placeholder="YYYY-MM-DD"
                      style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginTop: 8 }}
                    />
                    <Text style={{ marginTop: 6, color: state === 'available' ? '#15803d' : state === 'blocked' ? '#b91c1c' : '#4b5563' }}>
                      {state === 'available' ? 'Available' : state === 'blocked' ? 'Blocked' : 'No explicit rule'}
                    </Text>
                    <Pressable onPress={() => removePlanItem(item.id)} style={{ marginTop: 8, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, padding: 8 }}>
                      <Text style={{ textAlign: 'center', color: '#b91c1c', fontWeight: '700' }}>Remove</Text>
                    </Pressable>
                  </View>
                );
              })}
              <Pressable onPress={() => setMode('home')} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10 }}>
                <Text style={{ textAlign: 'center' }}>Back</Text>
              </Pressable>
            </SectionCard>
          </>
        )}

        {mode === 'vendor' && (
          <SectionCard title="Vendor Dashboard + Post Calendar">
            {!token ? (
              <>
                <TextInput value={email} onChangeText={setEmail} placeholder="Vendor email" autoCapitalize="none" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }} />
                <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }} />
                <Pressable onPress={doVendorLogin} style={{ backgroundColor: '#1f2937', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Vendor Login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={loadVendorData} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Refresh Vendor Data</Text>
                </Pressable>
                {vendorProfile ? <Text style={{ marginBottom: 6, fontWeight: '700' }}>{vendorProfile.businessName} ({vendorProfile.status})</Text> : null}
                {vendorCompliance ? (
                  <Text style={{ marginBottom: 10 }}>
                    Contract: {String(vendorCompliance.contractAccepted)} | Training: {String(vendorCompliance.trainingCompleted)} | Active: {String(vendorCompliance.canPublish)}
                  </Text>
                ) : null}

                <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ fontWeight: '700', marginBottom: 8 }}>Create Post</Text>
                  <TextInput value={vendorPostForm.title} onChangeText={(value) => setVendorPostForm((p) => ({ ...p, title: value }))} placeholder="Title" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginBottom: 6 }} />
                  <TextInput value={vendorPostForm.serviceName} onChangeText={(value) => setVendorPostForm((p) => ({ ...p, serviceName: value }))} placeholder="Service name" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginBottom: 6 }} />
                  <TextInput value={vendorPostForm.city} onChangeText={(value) => setVendorPostForm((p) => ({ ...p, city: value }))} placeholder="City" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginBottom: 6 }} />
                  <TextInput value={vendorPostForm.basePrice} onChangeText={(value) => setVendorPostForm((p) => ({ ...p, basePrice: value }))} placeholder="Base price EUR" keyboardType="numeric" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginBottom: 6 }} />
                  <TextInput value={vendorPostForm.date} onChangeText={(value) => setVendorPostForm((p) => ({ ...p, date: value }))} placeholder="Date rule YYYY-MM-DD" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, marginBottom: 6 }} />
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <Pressable onPress={() => setVendorPostForm((p) => ({ ...p, dateState: 'available' }))} style={{ flex: 1, borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, padding: 8, backgroundColor: vendorPostForm.dateState === 'available' ? '#dcfce7' : '#fff' }}>
                      <Text style={{ textAlign: 'center', color: '#166534' }}>Green</Text>
                    </Pressable>
                    <Pressable onPress={() => setVendorPostForm((p) => ({ ...p, dateState: 'blocked' }))} style={{ flex: 1, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, padding: 8, backgroundColor: vendorPostForm.dateState === 'blocked' ? '#fee2e2' : '#fff' }}>
                      <Text style={{ textAlign: 'center', color: '#991b1b' }}>Red</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={addPostDateRule} style={{ borderWidth: 1, borderColor: '#6d28d9', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    <Text style={{ textAlign: 'center', color: '#6d28d9', fontWeight: '700' }}>Add date rule</Text>
                  </Pressable>
                  {Object.entries(vendorPostForm.availability).map(([date, state]) => (
                    <Text key={date} style={{ fontSize: 12 }}>{date}: {state ? 'green available' : 'red blocked'}</Text>
                  ))}
                  <Pressable onPress={saveVendorPost} style={{ backgroundColor: '#111827', borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '700' }}>Create Vendor Post</Text>
                  </Pressable>
                </View>

                <Text style={{ fontWeight: '700', marginBottom: 6 }}>Posts: {vendorPosts.length}</Text>
              </>
            )}
            <Pressable onPress={token ? signOut : () => setMode('home')} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10 }}>
              <Text style={{ textAlign: 'center' }}>{token ? 'Sign out' : 'Back'}</Text>
            </Pressable>
          </SectionCard>
        )}

        {mode === 'admin' && (
          <SectionCard title="Admin Overview + Compliance">
            {!token ? (
              <>
                <TextInput value={email} onChangeText={setEmail} placeholder="Admin email" autoCapitalize="none" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }} />
                <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }} />
                <Pressable onPress={doAdminLogin} style={{ backgroundColor: '#065f46', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Admin Login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={loadAdminData} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Refresh Admin Data</Text>
                </Pressable>
                {adminOverview ? (
                  <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text>Customers: {adminOverview.customers}</Text>
                    <Text>Vendor applications: {adminOverview.vendorApplications}</Text>
                    <Text>Open requests: {adminOverview.openRequests}</Text>
                  </View>
                ) : null}
                {adminApplications.map((app) => (
                  <View key={app.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{app.businessName}</Text>
                    <Text>{app.email} | {app.status}</Text>
                    <Text>Contract: {String(app.compliance?.contractAccepted)}</Text>
                    <Text>Training: {String(app.compliance?.trainingCompleted)}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pressable onPress={() => adminConfirm(app.id, 'contract')} style={{ flex: 1, borderWidth: 1, borderColor: '#6d28d9', borderRadius: 8, padding: 8 }}>
                        <Text style={{ textAlign: 'center', color: '#6d28d9' }}>Confirm Contract</Text>
                      </Pressable>
                      <Pressable onPress={() => adminConfirm(app.id, 'training')} style={{ flex: 1, borderWidth: 1, borderColor: '#111827', borderRadius: 8, padding: 8 }}>
                        <Text style={{ textAlign: 'center', color: '#111827' }}>Confirm Training</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            )}
            <Pressable onPress={token ? signOut : () => setMode('home')} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10 }}>
              <Text style={{ textAlign: 'center' }}>{token ? 'Sign out' : 'Back'}</Text>
            </Pressable>
          </SectionCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


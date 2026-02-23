import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import {
  adminLogin,
  getAdminOverview,
  getCustomerRequestsByEmail,
  getVendorCompliance,
  getVendorPosts,
  getVendorProfile,
  vendorLogin,
} from './src/api';
import { clearSession, loadSession, saveSession } from './src/storage';
import type { ServiceRequest } from './src/types';

type Mode = 'home' | 'customer' | 'vendor' | 'admin';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [vendorProfile, setVendorProfile] = useState<any>(null);
  const [vendorCompliance, setVendorCompliance] = useState<any>(null);
  const [vendorPosts, setVendorPosts] = useState<any[]>([]);
  const [adminOverview, setAdminOverview] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (!session.token || !session.role) return;
      setToken(session.token);
      setEmail(session.email);
      if (session.role === 'vendor') setMode('vendor');
      if (session.role === 'admin') setMode('admin');
    })();
  }, []);

  const headerTitle = useMemo(() => {
    if (mode === 'customer') return 'Customer App';
    if (mode === 'vendor') return 'Vendor App';
    if (mode === 'admin') return 'Admin App';
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
      const data = await getCustomerRequestsByEmail(email.trim());
      setRequests(data.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customer requests');
    } finally {
      setLoading(false);
    }
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

  const loadAdminData = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminOverview(token);
      setAdminOverview(data.overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin overview');
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
          <SectionCard title="Customer Requests">
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Customer email"
              autoCapitalize="none"
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: '#fff' }}
            />
            <Pressable onPress={loadCustomerData} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Load Requests</Text>
            </Pressable>
            {requests.map((req) => (
              <View key={req.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <Text style={{ fontWeight: '700' }}>{req.id}</Text>
                <Text>Status: {req.status}</Text>
                <Text>Services: {req.selectedServices.join(', ')}</Text>
                <Text>Budget: EUR {req.budget}</Text>
                <Text>Offers: {req.offers.length}</Text>
              </View>
            ))}
            <Pressable onPress={() => setMode('home')} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10 }}>
              <Text style={{ textAlign: 'center' }}>Back</Text>
            </Pressable>
          </SectionCard>
        )}

        {mode === 'vendor' && (
          <SectionCard title="Vendor Dashboard">
            {!token ? (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Vendor email"
                  autoCapitalize="none"
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}
                />
                <Pressable onPress={doVendorLogin} style={{ backgroundColor: '#1f2937', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Vendor Login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={loadVendorData} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Refresh Dashboard</Text>
                </Pressable>
                {vendorProfile ? (
                  <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{vendorProfile.businessName}</Text>
                    <Text>Status: {vendorProfile.status}</Text>
                    <Text>Contact: {vendorProfile.contactName}</Text>
                    <Text>City: {vendorProfile.city || '-'}</Text>
                  </View>
                ) : null}
                {vendorCompliance ? (
                  <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700' }}>Compliance</Text>
                    <Text>Admin approved: {String(vendorCompliance.adminApproved)}</Text>
                    <Text>Contract: {String(vendorCompliance.contractAccepted)}</Text>
                    <Text>Training: {String(vendorCompliance.trainingCompleted)}</Text>
                    <Text>Can publish: {String(vendorCompliance.canPublish)}</Text>
                  </View>
                ) : null}
                <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ fontWeight: '700' }}>Posts: {vendorPosts.length}</Text>
                </View>
                <Pressable onPress={signOut} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ textAlign: 'center' }}>Sign out</Text>
                </Pressable>
              </>
            )}
            <Pressable onPress={() => setMode('home')} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10 }}>
              <Text style={{ textAlign: 'center' }}>Back</Text>
            </Pressable>
          </SectionCard>
        )}

        {mode === 'admin' && (
          <SectionCard title="Admin Overview">
            {!token ? (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Admin email"
                  autoCapitalize="none"
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}
                />
                <Pressable onPress={doAdminLogin} style={{ backgroundColor: '#065f46', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Admin Login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={loadAdminData} style={{ backgroundColor: '#7c3aed', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Refresh Overview</Text>
                </Pressable>
                {adminOverview ? (
                  <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text>Customers: {adminOverview.customers}</Text>
                    <Text>Vendor applications: {adminOverview.vendorApplications}</Text>
                    <Text>Open requests: {adminOverview.openRequests}</Text>
                    <Text>Total offers: {adminOverview.totalOffers}</Text>
                  </View>
                ) : null}
                <Pressable onPress={signOut} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ textAlign: 'center' }}>Sign out</Text>
                </Pressable>
              </>
            )}
            <Pressable onPress={() => setMode('home')} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10 }}>
              <Text style={{ textAlign: 'center' }}>Back</Text>
            </Pressable>
          </SectionCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  adminLogin,
  confirmVendorCompliance,
  createVendorPost,
  getAdminOverview,
  getAdminVendorApplications,
  getCustomerProfile,
  getCustomerRequestsByEmail,
  getPublicVendorPosts,
  getVendorCompliance,
  getVendorInquiries,
  getVendorOffers,
  getVendorPosts,
  getVendorProfile,
  login,
  sendVendorInquiry,
  updateCustomerProfile,
  updateVendorProfile,
  uploadFileToPublicStorage,
  vendorLogin,
} from './src/api';
import {
  clearSession,
  loadCustomerPlan,
  loadSession,
  MobilePlannedService,
  MobileRole,
  saveCustomerPlan,
  saveSession,
} from './src/storage';
import type {
  AdminVendorApplication,
  CustomerProfileDetails,
  PublicVendorPost,
  ServiceRequest,
  VendorApplication,
  VendorInquiry,
  VendorOfferWithRequest,
  VendorPost,
} from './src/types';

type Mode = 'home' | 'customer' | 'vendor' | 'admin';

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function Field(props: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      autoCapitalize="none"
      secureTextEntry={props.secureTextEntry}
      multiline={props.multiline}
      keyboardType={props.keyboardType}
      style={{
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        minHeight: props.multiline ? 88 : undefined,
      }}
    />
  );
}

function ActionButton(props: {
  title: string;
  onPress: () => void;
  bg?: string;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        backgroundColor: props.disabled ? '#d1d5db' : props.bg || '#7c3aed',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: props.color || '#fff', textAlign: 'center', fontWeight: '700' }}>{props.title}</Text>
    </Pressable>
  );
}

function availabilityStatus(availability: Record<string, boolean> | undefined, date: string) {
  if (!date) return 'none';
  const map = availability || {};
  if (!Object.prototype.hasOwnProperty.call(map, date)) return 'unknown';
  return map[date] ? 'available' : 'blocked';
}

function addDays(baseDate: string, dayOffset: number) {
  const dt = new Date(`${baseDate}T00:00:00`);
  dt.setDate(dt.getDate() + dayOffset);
  return dt.toISOString().slice(0, 10);
}

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [sessionRole, setSessionRole] = useState<MobileRole>('');

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfileDetails | null>(null);
  const [customerProfileDraft, setCustomerProfileDraft] = useState({ name: '', phone: '', address: '' });
  const [publicPosts, setPublicPosts] = useState<PublicVendorPost[]>([]);
  const [postDateById, setPostDateById] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<MobilePlannedService[]>([]);

  const [vendorProfile, setVendorProfile] = useState<VendorApplication | null>(null);
  const [vendorCompliance, setVendorCompliance] = useState<VendorApplication['compliance'] | null>(null);
  const [vendorPosts, setVendorPosts] = useState<VendorPost[]>([]);
  const [vendorOffers, setVendorOffers] = useState<VendorOfferWithRequest[]>([]);
  const [vendorInquiries, setVendorInquiries] = useState<VendorInquiry[]>([]);
  const [vendorProfileDraft, setVendorProfileDraft] = useState({
    contactName: '',
    city: '',
    address: '',
    websiteUrl: '',
    portfolioUrl: '',
    businessIntro: '',
    profileImageUrl: '',
    profileGalleryUrls: [] as string[],
  });
  const [vendorInquiryDraft, setVendorInquiryDraft] = useState({ subject: '', message: '' });
  const [vendorPostForm, setVendorPostForm] = useState({
    title: '',
    serviceName: '',
    city: '',
    basePrice: '',
    description: '',
    date: '',
    dateState: 'available' as 'available' | 'blocked',
    availability: {} as Record<string, boolean>,
    bulkStartDate: '',
    bulkDays: '30',
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
      setSessionRole(session.role);
      if (session.role === 'customer') setMode('customer');
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

  const withLoading = async (job: () => Promise<void>) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    setToken('');
    setPassword('');
    setSessionRole('');
    setMode('home');
    setCustomerProfile(null);
    setVendorProfile(null);
    setVendorCompliance(null);
    setAdminOverview(null);
  };

  const handleRoleLogin = async (targetMode: Mode) => {
    await withLoading(async () => {
      if (!email.trim() || !password.trim()) throw new Error('Enter email and password');
      if (targetMode === 'vendor') {
        const result = await vendorLogin(email.trim(), password);
        setToken(result.token);
        setEmail(result.user.email);
        setSessionRole('vendor');
        await saveSession(result.token, 'vendor', result.user.email);
        setMode('vendor');
        return;
      }
      if (targetMode === 'admin') {
        const result = await adminLogin(email.trim(), password);
        setToken(result.token);
        setEmail(result.admin.email);
        setSessionRole('admin');
        await saveSession(result.token, 'admin', result.admin.email);
        setMode('admin');
        return;
      }
      const result = await login(email.trim(), password);
      const role = result.role === 'customer' ? 'customer' : 'customer';
      setToken(result.token);
      setEmail(result.user.email);
      setSessionRole(role);
      await saveSession(result.token, role, result.user.email);
      setMode('customer');
    });
  };
  const loadCustomerData = async () => {
    if (!token || !email.trim()) return;
    await withLoading(async () => {
      const [profileData, reqData, postsData] = await Promise.all([
        getCustomerProfile(token),
        getCustomerRequestsByEmail(email.trim()),
        getPublicVendorPosts(),
      ]);
      setCustomerProfile(profileData.profile);
      setCustomerProfileDraft({
        name: profileData.profile.name || '',
        phone: profileData.profile.phone || '',
        address: profileData.profile.address || '',
      });
      setRequests(reqData.requests || []);
      setPublicPosts(postsData.posts || []);
      setNotice('Customer data refreshed');
    });
  };

  const saveCustomerProfileHandler = async () => {
    if (!token) return;
    await withLoading(async () => {
      const payload = {
        name: customerProfileDraft.name.trim(),
        phone: customerProfileDraft.phone.trim() || undefined,
        address: customerProfileDraft.address.trim() || undefined,
      };
      if (!payload.name) throw new Error('Customer name is required');
      const saved = await updateCustomerProfile(token, payload);
      setCustomerProfile(saved.profile);
      setNotice('Customer profile saved');
    });
  };

  const addPostToPlan = (post: PublicVendorPost) => {
    const date = String(postDateById[post.id] || '').trim();
    if (!date) {
      setError('Choose a service date first');
      return;
    }
    const state = availabilityStatus(post.availability, date);
    if (state === 'blocked') {
      setError('Selected date is blocked for this vendor post');
      return;
    }
    const item: MobilePlannedService = {
      id: `post:${post.id}`,
      title: post.title,
      vendorName: post.vendorName,
      serviceName: post.serviceName,
      date,
      availability: post.availability || {},
      basePrice: post.basePrice ?? null,
    };
    setPlan((prev) => [item, ...prev.filter((entry) => entry.id !== item.id)]);
    setError('');
  };

  const loadVendorData = async () => {
    if (!token || !email.trim()) return;
    await withLoading(async () => {
      const [profileRes, complianceRes, postsRes, offersRes, inquiriesRes] = await Promise.all([
        getVendorProfile(email.trim()),
        getVendorCompliance(email.trim(), token),
        getVendorPosts(email.trim(), token),
        getVendorOffers(token, email.trim()),
        getVendorInquiries(token),
      ]);
      const vendor = profileRes.vendor;
      setVendorProfile(vendor);
      setVendorCompliance(complianceRes.compliance || null);
      setVendorPosts(postsRes.posts || []);
      setVendorOffers(offersRes.offers || []);
      setVendorInquiries(inquiriesRes.inquiries || []);
      setVendorProfileDraft({
        contactName: vendor.contactName || '',
        city: vendor.city || '',
        address: vendor.address || '',
        websiteUrl: vendor.websiteUrl || '',
        portfolioUrl: vendor.portfolioUrl || '',
        businessIntro: vendor.businessIntro || '',
        profileImageUrl: vendor.profileImageUrl || '',
        profileGalleryUrls: vendor.profileGalleryUrls || [],
      });
      setNotice('Vendor data refreshed');
    });
  };

  const saveVendorProfileHandler = async () => {
    if (!token || !email.trim()) return;
    await withLoading(async () => {
      const payload = {
        vendorEmail: email.trim(),
        contactName: vendorProfileDraft.contactName.trim() || undefined,
        city: vendorProfileDraft.city.trim() || undefined,
        address: vendorProfileDraft.address.trim() || undefined,
        websiteUrl: vendorProfileDraft.websiteUrl.trim() || undefined,
        portfolioUrl: vendorProfileDraft.portfolioUrl.trim() || undefined,
        businessIntro: vendorProfileDraft.businessIntro.trim() || undefined,
        profileImageUrl: vendorProfileDraft.profileImageUrl.trim() || undefined,
        profileGalleryUrls: vendorProfileDraft.profileGalleryUrls,
      };
      const saved = await updateVendorProfile(token, payload);
      setVendorProfile(saved.vendor);
      setNotice('Vendor profile saved');
    });
  };

  const uploadProfileImage = async () => {
    if (!token) return;
    await withLoading(async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Media permission denied');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const upload = await uploadFileToPublicStorage(token, {
        uri: asset.uri,
        name: asset.fileName || `profile-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
      setVendorProfileDraft((prev) => ({ ...prev, profileImageUrl: upload.publicUrl }));
      setNotice('Profile image uploaded');
    });
  };

  const uploadGalleryFiles = async () => {
    if (!token) return;
    await withLoading(async () => {
      const selected = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: ['image/*'],
      });
      if (selected.canceled || !selected.assets?.length) return;
      const uploaded: string[] = [];
      for (const asset of selected.assets) {
        const info = await uploadFileToPublicStorage(token, {
          uri: asset.uri,
          name: asset.name || `gallery-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
        });
        uploaded.push(info.publicUrl);
      }
      setVendorProfileDraft((prev) => ({
        ...prev,
        profileGalleryUrls: [...prev.profileGalleryUrls, ...uploaded].slice(0, 20),
      }));
      setNotice(`${uploaded.length} gallery file(s) uploaded`);
    });
  };

  const submitVendorInquiry = async () => {
    if (!token || !email.trim()) return;
    await withLoading(async () => {
      if (!vendorInquiryDraft.subject.trim() || !vendorInquiryDraft.message.trim()) {
        throw new Error('Subject and message are required');
      }
      await sendVendorInquiry(token, {
        vendorEmail: email.trim(),
        subject: vendorInquiryDraft.subject.trim(),
        message: vendorInquiryDraft.message.trim(),
      });
      setVendorInquiryDraft({ subject: '', message: '' });
      await loadVendorData();
      setNotice('Inquiry sent to admin');
    });
  };

  const addSingleDateRule = () => {
    if (!vendorPostForm.date) {
      setError('Choose date first');
      return;
    }
    setVendorPostForm((prev) => ({
      ...prev,
      date: '',
      availability: {
        ...prev.availability,
        [prev.date]: prev.dateState === 'available',
      },
    }));
    setError('');
  };

  const applyBulkRule = (state: 'available' | 'blocked') => {
    if (!vendorPostForm.bulkStartDate) {
      setError('Choose bulk start date');
      return;
    }
    const days = Math.max(1, Math.min(365, Number(vendorPostForm.bulkDays) || 30));
    const value = state === 'available';
    const patch: Record<string, boolean> = {};
    for (let i = 0; i < days; i += 1) {
      patch[addDays(vendorPostForm.bulkStartDate, i)] = value;
    }
    setVendorPostForm((prev) => ({
      ...prev,
      availability: { ...prev.availability, ...patch },
    }));
    setError('');
  };

  const saveVendorPost = async () => {
    if (!token || !email.trim()) return;
    await withLoading(async () => {
      if (!vendorPostForm.title.trim() || !vendorPostForm.serviceName.trim()) {
        throw new Error('Post title and service name are required');
      }
      await createVendorPost(token, {
        vendorEmail: email.trim(),
        title: vendorPostForm.title.trim(),
        serviceName: vendorPostForm.serviceName.trim(),
        city: vendorPostForm.city.trim() || undefined,
        basePrice: vendorPostForm.basePrice ? Number(vendorPostForm.basePrice) : undefined,
        description: vendorPostForm.description.trim() || undefined,
        availability: vendorPostForm.availability,
      });
      setVendorPostForm({
        title: '',
        serviceName: '',
        city: '',
        basePrice: '',
        description: '',
        date: '',
        dateState: 'available',
        availability: {},
        bulkStartDate: '',
        bulkDays: '30',
      });
      await loadVendorData();
      setNotice('Vendor post created');
    });
  };

  const loadAdminData = async () => {
    if (!token) return;
    await withLoading(async () => {
      const [overview, applications] = await Promise.all([
        getAdminOverview(token),
        getAdminVendorApplications(token),
      ]);
      setAdminOverview(overview.overview);
      setAdminApplications(applications.applications || []);
      setNotice('Admin data refreshed');
    });
  };

  const adminConfirm = async (applicationId: string, field: 'contract' | 'training') => {
    if (!token) return;
    await withLoading(async () => {
      await confirmVendorCompliance(token, applicationId, field);
      await loadAdminData();
      setNotice(`${field} confirmed`);
    });
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
        {notice ? (
          <View style={{ backgroundColor: '#dcfce7', borderColor: '#86efac', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <Text style={{ color: '#166534' }}>{notice}</Text>
          </View>
        ) : null}
        {loading ? <ActivityIndicator size="small" color="#6d28d9" style={{ marginBottom: 12 }} /> : null}

        {mode === 'home' && (
          <SectionCard title="Choose Role">
            <ActionButton title="Customer" onPress={() => setMode('customer')} />
            <ActionButton title="Vendor" bg="#1f2937" onPress={() => setMode('vendor')} />
            <ActionButton title="Admin" bg="#065f46" onPress={() => setMode('admin')} />
          </SectionCard>
        )}
        {mode === 'customer' && (
          <>
            {!token || sessionRole !== 'customer' ? (
              <SectionCard title="Customer Login">
                <Field value={email} onChangeText={setEmail} placeholder="Customer email" keyboardType="email-address" />
                <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
                <ActionButton title="Login as customer" onPress={() => handleRoleLogin('customer')} />
                <ActionButton title="Back" bg="#e5e7eb" color="#111827" onPress={() => setMode('home')} />
              </SectionCard>
            ) : (
              <>
                <SectionCard title="Customer Dashboard">
                  <ActionButton title="Refresh customer data" onPress={loadCustomerData} />
                  <Text style={{ fontWeight: '700' }}>Requests: {requests.length}</Text>
                  <Text style={{ fontSize: 12, color: '#4b5563' }}>
                    {customerProfile ? `Signed in as ${customerProfile.email}` : 'No customer profile loaded yet'}
                  </Text>
                </SectionCard>

                <SectionCard title="My Profile">
                  <Field value={customerProfileDraft.name} onChangeText={(v) => setCustomerProfileDraft((p) => ({ ...p, name: v }))} placeholder="Name" />
                  <Field value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
                  <Field value={customerProfileDraft.phone} onChangeText={(v) => setCustomerProfileDraft((p) => ({ ...p, phone: v }))} placeholder="Phone" />
                  <Field value={customerProfileDraft.address} onChangeText={(v) => setCustomerProfileDraft((p) => ({ ...p, address: v }))} placeholder="Address" />
                  <ActionButton title="Save profile" onPress={saveCustomerProfileHandler} />
                </SectionCard>

                <SectionCard title="Service Posts - Choose Date">
                  {publicPosts.length === 0 ? <Text>No service posts yet.</Text> : null}
                  {publicPosts.map((post) => {
                    const date = postDateById[post.id] || '';
                    const state = availabilityStatus(post.availability, date);
                    return (
                      <View key={post.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <Text style={{ fontWeight: '700' }}>{post.title}</Text>
                        <Text>{post.vendorName} | {post.serviceName}</Text>
                        <Text>{post.basePrice ? `EUR ${post.basePrice}` : 'Price on request'}</Text>
                        <Field
                          value={date}
                          onChangeText={(value) => setPostDateById((prev) => ({ ...prev, [post.id]: value }))}
                          placeholder="Choose date YYYY-MM-DD"
                        />
                        <Text style={{ color: state === 'available' ? '#15803d' : state === 'blocked' ? '#b91c1c' : '#4b5563' }}>
                          {state === 'available' ? 'Available on selected date' : state === 'blocked' ? 'Booked on selected date' : 'No explicit rule'}
                        </Text>
                        <ActionButton title="Save to planner" onPress={() => addPostToPlan(post)} />
                      </View>
                    );
                  })}
                </SectionCard>

                <SectionCard title="My Service Date Planner">
                  {plan.length === 0 ? <Text>No planned services yet.</Text> : null}
                  {plan.map((item) => {
                    const state = availabilityStatus(item.availability, item.date);
                    return (
                      <View key={item.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <Text style={{ fontWeight: '700' }}>{item.title}</Text>
                        <Text>{item.vendorName}</Text>
                        <Field
                          value={item.date}
                          onChangeText={(value) => {
                            setPlan((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, date: value } : entry)));
                          }}
                          placeholder="Service date YYYY-MM-DD"
                        />
                        <Text style={{ color: state === 'available' ? '#15803d' : state === 'blocked' ? '#b91c1c' : '#4b5563' }}>
                          {state === 'available' ? 'Available' : state === 'blocked' ? 'Blocked' : 'No explicit rule'}
                        </Text>
                        <ActionButton
                          title="Remove"
                          bg="#ef4444"
                          onPress={() => setPlan((prev) => prev.filter((entry) => entry.id !== item.id))}
                        />
                      </View>
                    );
                  })}
                </SectionCard>

                <ActionButton title="Sign out" bg="#e5e7eb" color="#111827" onPress={signOut} />
              </>
            )}
          </>
        )}

        {mode === 'vendor' && (
          <>
            {!token || sessionRole !== 'vendor' ? (
              <SectionCard title="Vendor Login">
                <Field value={email} onChangeText={setEmail} placeholder="Vendor email" keyboardType="email-address" />
                <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
                <ActionButton title="Login as vendor" bg="#1f2937" onPress={() => handleRoleLogin('vendor')} />
                <ActionButton title="Back" bg="#e5e7eb" color="#111827" onPress={() => setMode('home')} />
              </SectionCard>
            ) : (
              <>
                <SectionCard title="Vendor Dashboard">
                  <ActionButton title="Refresh vendor data" onPress={loadVendorData} />
                  {vendorProfile ? (
                    <Text style={{ marginBottom: 8, fontWeight: '700' }}>
                      {vendorProfile.businessName} ({vendorProfile.status})
                    </Text>
                  ) : null}
                  <Text>
                    Contract: {String(vendorCompliance?.contractAccepted)} | Training: {String(vendorCompliance?.trainingCompleted)} | Active: {String(vendorCompliance?.canPublish)}
                  </Text>
                </SectionCard>

                <SectionCard title="Vendor Profile">
                  <Field value={vendorProfileDraft.contactName} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, contactName: v }))} placeholder="Contact name" />
                  <Field value={vendorProfileDraft.city} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, city: v }))} placeholder="City" />
                  <Field value={vendorProfileDraft.address} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, address: v }))} placeholder="Address" />
                  <Field value={vendorProfileDraft.websiteUrl} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, websiteUrl: v }))} placeholder="Website URL" />
                  <Field value={vendorProfileDraft.portfolioUrl} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, portfolioUrl: v }))} placeholder="Portfolio URL" />
                  <Field value={vendorProfileDraft.businessIntro} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, businessIntro: v }))} placeholder="Business intro" multiline />
                  <Text style={{ fontWeight: '700', marginBottom: 6 }}>Profile image URL</Text>
                  <Field value={vendorProfileDraft.profileImageUrl} onChangeText={(v) => setVendorProfileDraft((p) => ({ ...p, profileImageUrl: v }))} placeholder="Auto-filled from upload" />
                  <ActionButton title="Upload real profile image" onPress={uploadProfileImage} />
                  <ActionButton title="Upload gallery images" onPress={uploadGalleryFiles} />
                  <Text style={{ fontSize: 12, color: '#4b5563', marginBottom: 8 }}>
                    Gallery files: {vendorProfileDraft.profileGalleryUrls.length}
                  </Text>
                  <ActionButton title="Save vendor profile" bg="#111827" onPress={saveVendorProfileHandler} />
                </SectionCard>

                <SectionCard title="Create Service Post + Availability Calendar">
                  <Field value={vendorPostForm.title} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, title: v }))} placeholder="Post title" />
                  <Field value={vendorPostForm.serviceName} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, serviceName: v }))} placeholder="Service name" />
                  <Field value={vendorPostForm.city} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, city: v }))} placeholder="City" />
                  <Field value={vendorPostForm.basePrice} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, basePrice: v }))} placeholder="Base price EUR" keyboardType="numeric" />
                  <Field value={vendorPostForm.description} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, description: v }))} placeholder="Description" multiline />

                  <Text style={{ fontWeight: '700', marginBottom: 6 }}>Single date rule</Text>
                  <Field value={vendorPostForm.date} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, date: v }))} placeholder="YYYY-MM-DD" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => setVendorPostForm((p) => ({ ...p, dateState: 'available' }))}
                      style={{ flex: 1, borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, padding: 8, backgroundColor: vendorPostForm.dateState === 'available' ? '#dcfce7' : '#fff' }}
                    >
                      <Text style={{ textAlign: 'center', color: '#166534' }}>Green (available)</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setVendorPostForm((p) => ({ ...p, dateState: 'blocked' }))}
                      style={{ flex: 1, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, padding: 8, backgroundColor: vendorPostForm.dateState === 'blocked' ? '#fee2e2' : '#fff' }}
                    >
                      <Text style={{ textAlign: 'center', color: '#991b1b' }}>Red (blocked)</Text>
                    </Pressable>
                  </View>
                  <ActionButton title="Add single date rule" onPress={addSingleDateRule} />

                  <Text style={{ fontWeight: '700', marginBottom: 6 }}>Bulk calendar setup</Text>
                  <Field value={vendorPostForm.bulkStartDate} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, bulkStartDate: v }))} placeholder="Start date YYYY-MM-DD" />
                  <Field value={vendorPostForm.bulkDays} onChangeText={(v) => setVendorPostForm((p) => ({ ...p, bulkDays: v }))} placeholder="Number of days (e.g. 30)" keyboardType="numeric" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => applyBulkRule('available')} style={{ flex: 1, borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, padding: 8 }}>
                      <Text style={{ textAlign: 'center', color: '#166534' }}>Make date range green</Text>
                    </Pressable>
                    <Pressable onPress={() => applyBulkRule('blocked')} style={{ flex: 1, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, padding: 8 }}>
                      <Text style={{ textAlign: 'center', color: '#991b1b' }}>Make date range red</Text>
                    </Pressable>
                  </View>

                  <Text style={{ marginTop: 8, marginBottom: 6, fontWeight: '700' }}>
                    Rules count: {Object.keys(vendorPostForm.availability).length}
                  </Text>
                  <ActionButton title="Create vendor post" bg="#111827" onPress={saveVendorPost} />
                </SectionCard>

                <SectionCard title={`My Offers (${vendorOffers.length})`}>
                  {vendorOffers.slice(0, 10).map((offer) => (
                    <View key={offer.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 8, marginBottom: 6 }}>
                      <Text style={{ fontWeight: '700' }}>{offer.request?.id || offer.id}</Text>
                      <Text>Status: {offer.status} | Payment: {offer.paymentStatus || '-'}</Text>
                      <Text>Price: EUR {offer.price}</Text>
                    </View>
                  ))}
                  {vendorOffers.length === 0 ? <Text>No offers yet.</Text> : null}
                </SectionCard>

                <SectionCard title="Inquiry to Admin">
                  <Field value={vendorInquiryDraft.subject} onChangeText={(v) => setVendorInquiryDraft((p) => ({ ...p, subject: v }))} placeholder="Subject" />
                  <Field value={vendorInquiryDraft.message} onChangeText={(v) => setVendorInquiryDraft((p) => ({ ...p, message: v }))} placeholder="Message" multiline />
                  <ActionButton title="Send inquiry" onPress={submitVendorInquiry} />
                  <Text style={{ fontWeight: '700', marginTop: 8 }}>History</Text>
                  {vendorInquiries.map((entry) => (
                    <View key={entry.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 8, marginTop: 6 }}>
                      <Text style={{ fontWeight: '700' }}>{entry.subject}</Text>
                      <Text>{entry.message}</Text>
                      {entry.adminReply ? <Text style={{ color: '#1d4ed8', marginTop: 4 }}>Admin: {entry.adminReply}</Text> : null}
                    </View>
                  ))}
                </SectionCard>

                <SectionCard title={`My Posts (${vendorPosts.length})`}>
                  {vendorPosts.map((post) => (
                    <View key={post.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 8, marginBottom: 6 }}>
                      <Text style={{ fontWeight: '700' }}>{post.title}</Text>
                      <Text>{post.serviceName} | {post.city || '-'}</Text>
                      <Text>Availability days: {Object.keys(post.availability || {}).length}</Text>
                    </View>
                  ))}
                </SectionCard>

                <ActionButton title="Sign out" bg="#e5e7eb" color="#111827" onPress={signOut} />
              </>
            )}
          </>
        )}

        {mode === 'admin' && (
          <>
            {!token || sessionRole !== 'admin' ? (
              <SectionCard title="Admin Login">
                <Field value={email} onChangeText={setEmail} placeholder="Admin email" keyboardType="email-address" />
                <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
                <ActionButton title="Login as admin" bg="#065f46" onPress={() => handleRoleLogin('admin')} />
                <ActionButton title="Back" bg="#e5e7eb" color="#111827" onPress={() => setMode('home')} />
              </SectionCard>
            ) : (
              <>
                <SectionCard title="Admin Overview">
                  <ActionButton title="Refresh admin data" onPress={loadAdminData} />
                  {adminOverview ? (
                    <>
                      <Text>Customers: {adminOverview.customers}</Text>
                      <Text>Vendor applications: {adminOverview.vendorApplications}</Text>
                      <Text>Open requests: {adminOverview.openRequests}</Text>
                      <Text>Total offers: {adminOverview.totalOffers}</Text>
                    </>
                  ) : (
                    <Text>No overview loaded yet.</Text>
                  )}
                </SectionCard>

                <SectionCard title="Vendor Compliance Confirmation">
                  {adminApplications.length === 0 ? <Text>No applications loaded.</Text> : null}
                  {adminApplications.map((app) => (
                    <View key={app.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                      <Text style={{ fontWeight: '700' }}>{app.businessName}</Text>
                      <Text>{app.email} | {app.status}</Text>
                      <Text>Contract accepted: {app.compliance?.contractAccepted ? 'yes' : 'no'}</Text>
                      <Text>Training completed: {app.compliance?.trainingCompleted ? 'yes' : 'no'}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable onPress={() => adminConfirm(app.id, 'contract')} style={{ flex: 1, borderWidth: 1, borderColor: '#7c3aed', borderRadius: 8, padding: 8 }}>
                          <Text style={{ textAlign: 'center', color: '#6d28d9' }}>Confirm contract</Text>
                        </Pressable>
                        <Pressable onPress={() => adminConfirm(app.id, 'training')} style={{ flex: 1, borderWidth: 1, borderColor: '#111827', borderRadius: 8, padding: 8 }}>
                          <Text style={{ textAlign: 'center', color: '#111827' }}>Confirm training</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </SectionCard>

                <ActionButton title="Sign out" bg="#e5e7eb" color="#111827" onPress={signOut} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

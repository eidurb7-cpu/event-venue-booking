import { createBrowserRouter } from 'react-router';
import Root from './pages/Root';
import Home from './pages/Home';
import Venues from './pages/Venues';
import VenueDetail from './pages/VenueDetail';
import Booking from './pages/Booking';
import Services from './pages/Services';
import RequestPage from './pages/RequestPage';
import VendorPortfolio from './pages/VendorPortfolio';
import CustomerPortfolio from './pages/CustomerPortfolio';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AdminDashboard from './pages/AdminDashboard';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import CookieSettings from './pages/CookieSettings';
import BookingThreadPage from './pages/BookingThread';
import WhyFeatureDetail from './pages/WhyFeatureDetail';
import Impressum from './pages/Impressum';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Terms from './pages/Terms';
import VendorTerms from './pages/VendorTerms';
import RefundPolicy from './pages/RefundPolicy';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import RouteError from './pages/RouteError';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: Home },
      { path: 'venues', Component: Venues },
      { path: 'services', Component: Services },
      { path: 'request', Component: RequestPage },
      { path: 'vendor-portfolio', Component: VendorPortfolio },
      { path: 'customer-portfolio', Component: CustomerPortfolio },
      { path: 'login', Component: Login },
      { path: 'signup', Component: Signup },
      { path: 'admin', Component: AdminDashboard },
      { path: 'invoices', Component: Invoices },
      { path: 'invoice/:invoiceId', Component: InvoiceDetail },
      { path: 'cookies', Component: CookieSettings },
      { path: 'why/:topic', Component: WhyFeatureDetail },
      { path: 'impressum', Component: Impressum },
      { path: 'privacy', Component: PrivacyPolicy },
      { path: 'terms', Component: Terms },
      { path: 'vendor-terms', Component: VendorTerms },
      { path: 'refund-policy', Component: RefundPolicy },
      { path: 'contact', Component: Contact },
      { path: 'booking-thread/:bookingId', Component: BookingThreadPage },
      { path: 'venue/:id', Component: VenueDetail },
      { path: 'booking', Component: Booking },
      { path: '*', Component: NotFound },
    ],
  },
]);

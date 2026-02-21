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
      { path: 'venue/:id', Component: VenueDetail },
      { path: 'booking', Component: Booking },
      { path: '*', Component: NotFound },
    ],
  },
]);

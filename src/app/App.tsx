import { RouterProvider } from 'react-router';
import { router } from './routes';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <LanguageProvider>
      <CartProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors />
      </CartProvider>
    </LanguageProvider>
  );
}

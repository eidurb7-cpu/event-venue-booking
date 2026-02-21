import { RouterProvider } from 'react-router';
import { router } from './routes';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';

export default function App() {
  return (
    <LanguageProvider>
      <CartProvider>
        <RouterProvider router={router} />
      </CartProvider>
    </LanguageProvider>
  );
}

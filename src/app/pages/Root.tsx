import { Outlet } from 'react-router';
import { Header } from '../components/Header';
import { CookieBanner } from '../components/CookieBanner';
import { ConsentScriptLoader } from '../components/ConsentScriptLoader';

export default function Root() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <ConsentScriptLoader />
      <Header />
      <main className="w-full">
        <Outlet />
      </main>
      <CookieBanner />
    </div>
  );
}

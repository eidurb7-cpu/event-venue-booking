import { Outlet } from 'react-router';
import { Header } from '../components/Header';

export default function Root() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <Header />
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  );
}

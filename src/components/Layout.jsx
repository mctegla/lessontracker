import { Outlet, Link, useLocation } from 'react-router-dom';
import { useGcalConnection } from '@/hooks/useGcalConnection';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { loading, connected, reload } = useGcalConnection();
  const loc = useLocation();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await reload();
    setRetrying(false);
  };

  const navClass = (p) => (loc.pathname === p ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="font-heading font-semibold text-lg">Lesson Package Tracker</Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link to="/" className={navClass('/')}>Dashboard</Link>
            <Link to="/insights" className={navClass('/insights')}>Insights</Link>
            <Link to="/settings" className={navClass('/settings')}>Settings</Link>
          </nav>
        </div>
      </header>

      {!loading && !connected && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
          <div className="max-w-5xl mx-auto px-4 py-2.5 text-sm flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Google Calendar isn't connected. Lesson tracking is paused until you reconnect.
            </span>
            <button onClick={retry} disabled={retrying} className="font-medium underline flex items-center gap-1 disabled:opacity-50">
              {retrying ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Retrying</> : 'Retry connection'}
            </button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
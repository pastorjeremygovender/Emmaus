import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { AdminProvider } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  BookOpen,
  Video,
  HeartHandshake,
  Users,
  Settings2,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';

import AdminDashboard from './admin/Dashboard';
import JourneysList from './admin/JourneysList';
import JourneyEditor from './admin/JourneyEditor';
import DayEditor from './admin/DayEditor';
import DayPreview from './admin/DayPreview';
import SermonsList from './admin/SermonsList';
import SermonEditor from './admin/SermonEditor';
import PrayerRequests from './admin/PrayerRequests';
import AdminUsers from './admin/Users';
import AdminSettings from './admin/Settings';

export type AdminSection = 'dashboard' | 'journeys' | 'sermons' | 'prayers' | 'users' | 'settings';
export type AdminNav = {
  section: AdminSection;
  subView?: 'editor' | 'day-editor' | 'preview';
  journeyId?: string;
  day?: number;
  sermonId?: string;
  freshlyGenerated?: boolean;
};

const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'journeys', label: 'Journeys', Icon: BookOpen },
  { id: 'sermons', label: 'Sermons', Icon: Video },
  { id: 'prayers', label: 'Prayer Requests', Icon: HeartHandshake },
  { id: 'users', label: 'Users', Icon: Users },
  { id: 'settings', label: 'Settings', Icon: Settings2 },
];

export default function Admin() {
  const { user, isDemoMode } = useAuth();
  const [, setLocation] = useLocation();
  const [nav, setNav] = useState<AdminNav>({ section: 'dashboard' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => setLocation('/walk')}>Back to Walk</Button>
      </div>
    );
  }

  const navigate = (n: AdminNav) => {
    setNav(n);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  const renderContent = () => {
    const { section, subView, journeyId, day, sermonId } = nav;
    if (section === 'journeys') {
      if (subView === 'day-editor') {
        return (
          <DayEditor
            journeyId={journeyId!}
            day={day ?? null}
            onBack={() => navigate({ section: 'journeys', subView: 'editor', journeyId })}
          />
        );
      }
      if (subView === 'preview' && journeyId && day !== undefined) {
        return (
          <DayPreview
            journeyId={journeyId}
            day={day}
            onBack={() => navigate({ section: 'journeys', subView: 'editor', journeyId })}
          />
        );
      }
      if (subView === 'editor') {
        return (
          <JourneyEditor
            journeyId={journeyId ?? null}
            freshlyGenerated={nav.freshlyGenerated}
            onBack={() => navigate({ section: 'journeys' })}
            onEditDay={(jId, d) => navigate({ section: 'journeys', subView: 'day-editor', journeyId: jId, day: d })}
            onPreviewDay={(jId, d) => navigate({ section: 'journeys', subView: 'preview', journeyId: jId, day: d })}
          />
        );
      }
      return (
        <JourneysList
          onEdit={(id) => navigate({ section: 'journeys', subView: 'editor', journeyId: id })}
          onNew={() => navigate({ section: 'journeys', subView: 'editor' })}
          onPreview={(id, d) => navigate({ section: 'journeys', subView: 'preview', journeyId: id, day: d })}
        />
      );
    }
    if (section === 'sermons') {
      if (subView === 'editor') {
        return (
          <SermonEditor
            sermonId={sermonId ?? null}
            onBack={() => navigate({ section: 'sermons' })}
            onOpenCompanion={(jId, fresh) => navigate({ section: 'journeys', subView: 'editor', journeyId: jId, freshlyGenerated: fresh })}
          />
        );
      }
      return (
        <SermonsList
          onEdit={(id) => navigate({ section: 'sermons', subView: 'editor', sermonId: id })}
          onNew={() => navigate({ section: 'sermons', subView: 'editor' })}
          onOpenCompanion={(jId) => navigate({ section: 'journeys', subView: 'editor', journeyId: jId })}
        />
      );
    }
    if (section === 'prayers') return <PrayerRequests />;
    if (section === 'users') return <AdminUsers />;
    if (section === 'settings') return <AdminSettings />;
    return <AdminDashboard onNavigate={navigate} />;
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={`flex flex-col h-full ${mobile ? '' : 'border-r border-gray-200'} bg-white`}>
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="font-semibold text-[15px] text-gray-900">Emmaus Admin</div>
        <div className="text-[12px] text-gray-400 mt-0.5">Isipingo Community Church</div>
      </div>
      <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = nav.section === id;
          return (
            <button
              key={id}
              onClick={() => navigate({ section: id })}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-left transition-colors ${
                active
                  ? 'bg-teal-50 text-teal-800 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={16} className={active ? 'text-teal-700' : 'text-gray-400'} />
              {label}
            </button>
          );
        })}
      </div>
      <div className="px-3 py-4 border-t border-gray-100 space-y-1">
        {isDemoMode && (
          <div className="mx-3 mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700 font-medium text-center">
            DEMO MODE
          </div>
        )}
        <button
          onClick={() => setLocation('/walk')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-400" />
          Back to App
        </button>
      </div>
    </nav>
  );

  return (
    <AdminProvider>
      <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 flex-col flex-shrink-0">
          <Sidebar />
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="w-56 flex flex-col shadow-xl">
              <Sidebar mobile />
            </div>
            <div
              className="flex-1 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar (mobile) */}
          <header className="md:hidden flex items-center h-12 px-4 bg-white border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 text-gray-500 hover:text-gray-800"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span className="ml-3 font-medium text-[14px] text-gray-800 capitalize">
              {nav.section}
            </span>
          </header>

          <main className="flex-1 overflow-y-auto">
            {renderContent()}
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}

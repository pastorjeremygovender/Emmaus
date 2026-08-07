import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { AdminProvider } from '@/contexts/AdminContext';
import { MediaStudioProvider } from '@/contexts/MediaStudioContext';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  Settings2,
  ArrowLeft,
  Menu,
  PenSquare,
  FlaskConical,
  BookOpen,
  ClipboardList,
  Heart,
  BarChart2,
  ListChecks,
} from 'lucide-react';

import AdminDashboard from './admin/Dashboard';
import PastoralDashboard from './admin/PastoralDashboard';
import AnalyticsCentre from './admin/AnalyticsCentre';
import { PastoralWorkflows } from './admin/PastoralWorkflows';
import AdminSettings from './admin/Settings';
import ContentStudio from './admin/content-studio/ContentStudio';
import People from './admin/People';
import type { PeopleTab } from './admin/People';
import Testing from './admin/Testing';
import UnifiedBibleStudy from './admin/UnifiedBibleStudy';
import AuditLog from './admin/AuditLog';
import type { PersonType } from '@/lib/pastoral-api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminSection =
  | 'dashboard'
  | 'pastoral-dashboard'
  | 'analytics'
  | 'workflows'
  | 'content-studio'
  | 'bible-study'
  | 'people'
  | 'settings'
  | 'testing'
  | 'audit-log';

export type AdminNav = {
  section: AdminSection;
  // Content Studio deep-links
  subView?: 'studio-editor';
  journeyId?: string;
  // People sub-tab
  peopleTab?: PeopleTab;
  // People deep-link — open a specific person's profile directly
  personDeepLink?: { personId: string; personType: PersonType; personName?: string };
};

// ─── Sidebar nav items (4 only) ───────────────────────────────────────────────

const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.ElementType }[] = [
  { id: 'dashboard',           label: 'Dashboard',           Icon: LayoutDashboard },
  { id: 'pastoral-dashboard',  label: 'Pastoral Dashboard',  Icon: Heart },
  { id: 'people',              label: 'People',              Icon: Users },
  { id: 'analytics',           label: 'Analytics',           Icon: BarChart2 },
  { id: 'workflows',           label: 'Workflows',           Icon: ListChecks },
  { id: 'content-studio',      label: 'Content Studio',      Icon: PenSquare },
  { id: 'bible-study',         label: 'Bible Study',         Icon: BookOpen },
  { id: 'settings',            label: 'Settings',            Icon: Settings2 },
  { id: 'audit-log',           label: 'Audit Log',           Icon: ClipboardList },
  { id: 'testing',             label: 'Testing',             Icon: FlaskConical },
];

// ─── Admin shell ──────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, isDemoMode } = useAuth();
  const [, setLocation] = useLocation();
  const [nav, setNav] = useState<AdminNav>({ section: 'dashboard' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Allow both admin and superAdmin roles
  if (!user || (user.role !== 'admin' && user.role !== 'superAdmin')) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => setLocation('/walk')}>Back to Today's Steps</Button>
      </div>
    );
  }

  const navigate = (n: AdminNav) => {
    setNav(n);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  // ─── Section label for mobile header ──────────────────────────────────────

  const sectionLabel: Record<AdminSection, string> = {
    dashboard:             'Dashboard',
    'pastoral-dashboard':  'Pastoral Dashboard',
    analytics:             'Analytics Centre',
    workflows:             'Ministry Workflows',
    'content-studio':      'Content Studio',
    'bible-study':         'Bible Study',
    people:                'People',
    settings:              'Settings',
    'audit-log':           'Audit Log',
    testing:               'Testing',
  };

  // ─── Content renderer ─────────────────────────────────────────────────────

  const renderContent = () => {
    switch (nav.section) {
      case 'content-studio':
        return (
          <ContentStudio
            initialSubView={nav.subView}
            initialJourneyId={nav.journeyId}
            onOpenLegacyEditor={(jId) =>
              navigate({ section: 'content-studio', subView: 'studio-editor', journeyId: jId })
            }
          />
        );
      case 'people':
        return (
          <People
            activeTab={nav.peopleTab ?? 'members'}
            onTabChange={(tab) => navigate({ section: 'people', peopleTab: tab })}
            overridePerson={nav.personDeepLink}
            onOverridePersonBack={
              nav.personDeepLink
                ? () => navigate({ section: 'pastoral-dashboard' })
                : undefined
            }
          />
        );
      case 'settings':
        return <AdminSettings />;
      case 'bible-study':
        return <UnifiedBibleStudy />;
      case 'audit-log':
        return (
          <div className="p-0">
            <AuditLog />
          </div>
        );
      case 'pastoral-dashboard':
        return <PastoralDashboard onNavigate={navigate} />;
      case 'analytics':
        return <AnalyticsCentre onNavigate={navigate} />;
      case 'workflows':
        return <PastoralWorkflows />;
      case 'testing':
        return <Testing />;
      default:
        return <AdminDashboard onNavigate={navigate} />;
    }
  };

  // ─── Sidebar ──────────────────────────────────────────────────────────────

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav
      className={`flex flex-col h-full ${mobile ? '' : 'border-r border-gray-200'} bg-white`}
      aria-label="Admin navigation"
    >
      {/* Logo / church name */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="font-semibold text-[15px] text-gray-900">Emmaus Admin</div>
        <div className="text-[12px] text-gray-400 mt-0.5">Isipingo Community Church</div>
      </div>

      {/* Primary nav */}
      <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = nav.section === id;
          return (
            <button
              key={id}
              onClick={() => navigate({ section: id })}
              aria-current={active ? 'page' : undefined}
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

      {/* Footer */}
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

  // ─── Shell layout ─────────────────────────────────────────────────────────

  return (
    <AdminProvider>
      <MediaStudioProvider>
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
                aria-hidden="true"
              />
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Mobile top bar */}
            <header className="md:hidden flex items-center h-12 px-4 bg-white border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1 text-gray-500 hover:text-gray-800"
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <span className="ml-3 font-medium text-[14px] text-gray-800">
                {sectionLabel[nav.section]}
              </span>
            </header>

            <main className="flex-1 overflow-y-auto">
              {renderContent()}
            </main>
          </div>
        </div>
      </MediaStudioProvider>
    </AdminProvider>
  );
}

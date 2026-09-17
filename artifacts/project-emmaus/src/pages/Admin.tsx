import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { AdminProvider } from '@/contexts/AdminContext';
import { MediaStudioProvider } from '@/contexts/MediaStudioContext';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, BookOpen, ClipboardCheck, ClipboardList, FlaskConical,
  Menu, PenSquare, Settings2, Sun, Users,
} from 'lucide-react';

import PastoralHome from './admin/pastoral/PastoralHome';
import PastoralRegister from './admin/pastoral/PastoralRegister';
import AttendanceSection from './admin/pastoral/AttendanceSection';
import AdminSettings from './admin/Settings';
import ContentStudio from './admin/content-studio/ContentStudio';
import UnifiedBibleStudy from './admin/UnifiedBibleStudy';
import AuditLog from './admin/AuditLog';
import Testing from './admin/Testing';
import PastoralBriefingRules from './admin/pastoral/briefing/PastoralBriefingRules';
import type { PersonType } from '@/lib/pastoral-api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminSection =
  | 'today'
  | 'people'
  | 'attendance'
  // Legacy section identifiers are retained in the type because older,
  // unmounted admin modules still import AdminNav. They are no longer shown.
  | 'dashboard'
  | 'pastoral-dashboard'
  | 'analytics'
  | 'workflows'
  | 'content-studio'
  | 'bible-study'
  | 'settings'
  | 'briefing-rules'
  | 'audit-log'
  | 'testing';

export type AdminNav = {
  section: AdminSection;
  // Kept for legacy dashboard callers while the simplified register owns
  // people navigation directly.
  peopleTab?: 'members' | 'attendance' | 'prayer' | 'signals';
  subView?: 'studio-editor';
  settingsView?: 'briefing-rules';
  journeyId?: string;
  personDeepLink?: { personId: string; personType: PersonType; personName?: string };
};

const PRIMARY_NAV: { id: AdminSection; label: string; Icon: React.ElementType }[] = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'people', label: 'People', Icon: Users },
  { id: 'attendance', label: 'Attendance', Icon: ClipboardCheck },
];

const MINISTRY_TOOLS: { id: AdminSection; label: string; Icon: React.ElementType }[] = [
  { id: 'content-studio', label: 'Content Studio', Icon: PenSquare },
  { id: 'bible-study', label: 'Bible Study', Icon: BookOpen },
];

const SYSTEM_TOOLS: { id: AdminSection; label: string; Icon: React.ElementType }[] = [
  { id: 'settings', label: 'Settings', Icon: Settings2 },
  { id: 'audit-log', label: 'Audit Log', Icon: ClipboardList },
  { id: 'testing', label: 'Testing', Icon: FlaskConical },
];

// ─── Admin shell ──────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, isDemoMode, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [nav, setNav] = useState<AdminNav>({ section: 'today' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Allow both admin and superAdmin roles
  if (!user || (user.role !== 'admin' && user.role !== 'superAdmin')) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => setLocation('/walk')}>Back to My Emmaus</Button>
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
    today: 'Today',
    people: 'People',
    attendance: 'Attendance',
    dashboard: 'Today',
    'pastoral-dashboard': 'Today',
    analytics: 'Today',
    workflows: 'Today',
    'content-studio': 'Content Studio',
    'bible-study': 'Bible Study',
     settings: 'Settings',
     'briefing-rules': 'Pastoral Briefing Rules',
    'audit-log': 'Audit Log',
    testing: 'Testing',
  };

  // ─── Content renderer ─────────────────────────────────────────────────────

  const renderContent = () => {
    switch (nav.section) {
      case 'today':
        return (
          <PastoralHome
            onOpenPeople={() => navigate({ section: 'people' })}
            onOpenAttendance={() => navigate({ section: 'attendance' })}
            onOpenPerson={(personId, personType, personName) =>
              navigate({ section: 'people', personDeepLink: { personId, personType, personName } })
            }
          />
        );
      case 'people':
        return (
          <PastoralRegister
            overridePerson={nav.personDeepLink}
            onClearOverride={() => navigate({ section: 'people' })}
          />
        );
      case 'attendance':
        return <AttendanceSection />;
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
      case 'settings':
        return nav.settingsView === 'briefing-rules'
          ? <PastoralBriefingRules onBack={() => navigate({ section: 'settings' })} />
          : <AdminSettings onOpenBriefingRules={() => navigate({ section: 'settings', settingsView: 'briefing-rules' })} />;
      case 'bible-study':
        return <UnifiedBibleStudy />;
      case 'audit-log':
        return (
          <div className="p-0">
            <AuditLog />
          </div>
        );
      case 'testing':
        return <Testing />;
      default:
        return null;
    }
  };

  const NavButton = ({ id, label, Icon }: { id: AdminSection; label: string; Icon: React.ElementType }) => {
    const active = nav.section === id;
    return (
      <button
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
  };

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

      <div className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {PRIMARY_NAV.map(item => <NavButton key={item.id} {...item} />)}
        </div>

        <div className="mt-6 mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Create and manage content
        </div>
        <div className="space-y-0.5">
          {MINISTRY_TOOLS.map(item => <NavButton key={item.id} {...item} />)}
        </div>

        <details className="mt-6 group">
          <summary className="px-3 py-2 text-[11px] font-medium text-gray-400 cursor-pointer hover:text-gray-600">
            Administration tools
          </summary>
          <div className="space-y-0.5 mt-1">
            {SYSTEM_TOOLS.map(item => <NavButton key={item.id} {...item} />)}
          </div>
        </details>
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
        <button
          onClick={async () => {
            await signOut();
            setLocation('/');
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          Sign out
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
              <div className="w-64 flex flex-col shadow-xl">
                <Sidebar mobile />
              </div>
              <button
                className="flex-1 bg-black/40"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation"
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

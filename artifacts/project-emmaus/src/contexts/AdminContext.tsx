import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Sermon,
  PrayerRequest,
  AdminUser,
  ChurchSettings,
  DEMO_SERMON_RECORD,
  DEMO_PRAYER_REQUESTS,
  DEMO_ADMIN_USERS,
  DEMO_CHURCH_SETTINGS,
} from '../lib/admin-demo-data';

type AdminContextType = {
  sermons: Sermon[];
  addSermon: (sermon: Sermon) => void;
  updateSermon: (sermon: Sermon) => void;
  prayerRequests: PrayerRequest[];
  updatePrayerRequest: (req: PrayerRequest) => void;
  adminUsers: AdminUser[];
  settings: ChurchSettings;
  updateSettings: (s: ChurchSettings) => void;
};

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [adminUsers] = useState<AdminUser[]>(DEMO_ADMIN_USERS);
  const [settings, setSettings] = useState<ChurchSettings>(DEMO_CHURCH_SETTINGS);

  useEffect(() => {
    const s = localStorage.getItem('emmaus_admin_sermons');
    setSermons(s ? JSON.parse(s) : [DEMO_SERMON_RECORD]);

    const p = localStorage.getItem('emmaus_admin_prayers');
    setPrayerRequests(p ? JSON.parse(p) : DEMO_PRAYER_REQUESTS);

    const cfg = localStorage.getItem('emmaus_admin_settings');
    if (cfg) setSettings(JSON.parse(cfg));
  }, []);

  const addSermon = (sermon: Sermon) => {
    const next = [...sermons, sermon];
    setSermons(next);
    localStorage.setItem('emmaus_admin_sermons', JSON.stringify(next));
  };

  const updateSermon = (sermon: Sermon) => {
    const next = sermons.map(s => (s.id === sermon.id ? sermon : s));
    setSermons(next);
    localStorage.setItem('emmaus_admin_sermons', JSON.stringify(next));
  };

  const updatePrayerRequest = (req: PrayerRequest) => {
    const next = prayerRequests.map(p => (p.id === req.id ? req : p));
    setPrayerRequests(next);
    localStorage.setItem('emmaus_admin_prayers', JSON.stringify(next));
  };

  const updateSettings = (s: ChurchSettings) => {
    setSettings(s);
    localStorage.setItem('emmaus_admin_settings', JSON.stringify(s));
  };

  return (
    <AdminContext.Provider
      value={{ sermons, addSermon, updateSermon, prayerRequests, updatePrayerRequest, adminUsers, settings, updateSettings }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
};

import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import PastoralPeople from './PastoralPeople';
import PersonPage from './PersonPage';
import { listPeople, type PersonType, type UnifiedPerson } from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  overridePerson?: { personId: string; personType: PersonType; personName?: string } | null;
  onClearOverride?: () => void;
}

export default function PastoralRegister({ overridePerson, onClearOverride }: Props) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<UnifiedPerson | null>(null);
  const [resolved, setResolved] = useState<UnifiedPerson | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!overridePerson) { setResolved(null); return; }
    let cancelled = false;
    setResolving(true);
    listPeople({ userId: user?.id ?? '', userRole: user?.role ?? 'admin' })
      .then(people => {
        if (cancelled) return;
        setResolved(people.find(p => p.id === overridePerson.personId && p.personType === overridePerson.personType) ?? null);
      })
      .catch(() => { if (!cancelled) setResolved(null); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [overridePerson?.personId, overridePerson?.personType, user?.id, user?.role]);

  if (resolving) return <div className="h-full flex items-center justify-center text-gray-400"><Loader2 size={18} className="animate-spin" /></div>;
  const person = resolved ?? selected;

  if (person) {
    return <PersonPage person={person} onBack={() => overridePerson ? onClearOverride?.() : setSelected(null)} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900">Church Register</h1>
          <p className="text-[12px] text-gray-400 mt-1">Find anyone and see their attendance, discipleship and church information.</p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 text-white text-[12px] font-medium hover:bg-teal-800">
          <UserPlus size={14} /> Add person
        </button>
      </header>
      <div className="flex-1 min-h-0">
        <PastoralPeople onSelectPerson={person => setSelected(person)} />
      </div>
    </div>
  );
}

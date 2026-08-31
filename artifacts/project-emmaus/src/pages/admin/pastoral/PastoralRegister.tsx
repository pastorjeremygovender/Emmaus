import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import PastoralPeople from './PastoralPeople';
import PersonPage from './PersonPage';
import { createPastoralPerson, listPeople, type PersonType, type UnifiedPerson } from '@/lib/pastoral-api';
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
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [listKey, setListKey] = useState(0);

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
        <button onClick={() => { setShowAdd(true); setSaveError(''); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 text-white text-[12px] font-medium hover:bg-teal-800">
          <UserPlus size={14} /> Add person
        </button>
      </header>
      <div className="flex-1 min-h-0">
        <PastoralPeople key={listKey} onSelectPerson={person => setSelected(person)} />
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={async event => {
              event.preventDefault();
              if (!name.trim() || saving) return;
              setSaving(true); setSaveError('');
              try {
                await createPastoralPerson(
                  { userId: user?.id ?? '', userRole: user?.role ?? 'admin' },
                  { fullName: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined },
                );
                setName(''); setEmail(''); setPhone(''); setShowAdd(false); setListKey(value => value + 1);
              } catch { setSaveError('Could not add this person. Please try again.'); }
              finally { setSaving(false); }
            }}
            className="w-full max-w-md rounded-2xl bg-white shadow-xl p-5 space-y-4"
          >
            <div><h2 className="text-[16px] font-semibold text-gray-900">Add a person</h2><p className="text-[12px] text-gray-400 mt-1">Add only what you know. Their details can be completed later.</p></div>
            <label className="block text-[12px] font-medium text-gray-700">Name and surname<input autoFocus required value={name} onChange={e => setName(e.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-teal-500/30" /></label>
            <label className="block text-[12px] font-medium text-gray-700">Mobile number <span className="text-gray-400 font-normal">(optional)</span><input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-teal-500/30" /></label>
            <label className="block text-[12px] font-medium text-gray-700">Email address <span className="text-gray-400 font-normal">(optional)</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-teal-500/30" /></label>
            {saveError && <p className="text-[12px] text-red-600">{saveError}</p>}
            <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100">Cancel</button><button type="submit" disabled={!name.trim() || saving} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-[13px] font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Add person'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

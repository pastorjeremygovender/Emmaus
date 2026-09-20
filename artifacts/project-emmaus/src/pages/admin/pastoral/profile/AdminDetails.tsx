/**
 * AdminDetails — Emmaus account link and attendance expectations.
 * Contact information is presented separately at the top of the person record.
 */
import React, { useState } from 'react';
import {
  UserCheck, Plus, Trash2, Loader2, ChevronDown, ChevronUp, X, AlertCircle,
} from 'lucide-react';
import type {
  UnifiedPerson, AttendanceExpectation, MeetingType, Expectation, UnifiedPerson as UP,
} from '@/lib/pastoral-api';

interface Props {
  person: UnifiedPerson;
  expectations: AttendanceExpectation[];
  meetingTypes: MeetingType[];
  allPeople: UP[];
  isLinked: boolean;
  linkedId: string | null;
  onAddExpectation: (mtId: string, exp: Expectation, notes: string) => Promise<void>;
  onRemoveExpectation: (mtId: string) => Promise<void>;
  onLink: (emmausId: string) => Promise<void>;
  children?: React.ReactNode;
}

export default function AdminDetails({
  person, expectations, meetingTypes, allPeople,
  isLinked, linkedId, onAddExpectation, onRemoveExpectation, onLink, children,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const [showExpForm, setShowExpForm] = useState(false);
  const [newMtId, setNewMtId]         = useState(meetingTypes[0]?.id ?? '');
  const [newExp, setNewExp]           = useState<Expectation>('expected');
  const [newNotes, setNewNotes]       = useState('');
  const [expSaving, setExpSaving]     = useState(false);

  const [showLink, setShowLink]   = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [removingMt, setRemovingMt] = useState<string | null>(null);

  const emmausMatches = linkQuery.length > 1
    ? allPeople.filter(p =>
        p.personType === 'emmaus_user' &&
        (p.fullName.toLowerCase().includes(linkQuery.toLowerCase()) ||
         (p.email?.toLowerCase().includes(linkQuery.toLowerCase()) ?? false))
      ).slice(0, 6)
    : [];

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white';

  const handleAddExp = async () => {
    if (!newMtId) return;
    setExpSaving(true);
    try {
      await onAddExpectation(newMtId, newExp, newNotes);
      setShowExpForm(false);
      setNewNotes('');
    } finally { setExpSaving(false); }
  };

  const handleRemoveExp = async (mtId: string) => {
    setRemovingMt(mtId);
    try { await onRemoveExpectation(mtId); }
    finally { setRemovingMt(null); }
  };

  const handleLink = async (id: string) => {
    setLinkSaving(true); setLinkError('');
    try {
      await onLink(id);
      setShowLink(false);
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Link failed.');
    } finally { setLinkSaving(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <UserCheck size={13} className="text-gray-400" />
          <span className="text-[13px] font-semibold text-gray-700">Administrative Details</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {person.personType === 'pastoral_person' && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-medium text-gray-700">Emmaus Account</p>
                  {isLinked ? (
                    <p className="text-[11px] text-teal-600 mt-0.5 flex items-center gap-1">
                      <UserCheck size={11} /> Linked
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-0.5">Not linked</p>
                  )}
                </div>
                {!isLinked && (
                  <button
                    onClick={() => { setShowLink(true); setLinkError(''); setLinkQuery(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-[12px] font-medium hover:bg-teal-100"
                  >
                    <UserCheck size={12} /> Link Account
                  </button>
                )}
              </div>

              {showLink && (
                <div className="mt-3 space-y-2">
                  <input
                    value={linkQuery}
                    onChange={e => setLinkQuery(e.target.value)}
                    placeholder="Search Emmaus users…"
                    className={inp}
                  />
                  {emmausMatches.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                      {emmausMatches.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleLink(p.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-teal-50"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-900 truncate">{p.fullName}</p>
                            {p.email && <p className="text-[11px] text-gray-400 truncate">{p.email}</p>}
                          </div>
                          {linkSaving && <Loader2 size={12} className="animate-spin text-teal-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {linkQuery.length > 1 && emmausMatches.length === 0 && (
                    <p className="text-[12px] text-gray-400 text-center">No Emmaus users found.</p>
                  )}
                  {linkError && (
                    <p className="flex items-center gap-1.5 text-[12px] text-red-600">
                      <AlertCircle size={12} /> {linkError}
                    </p>
                  )}
                  <button onClick={() => setShowLink(false)} className="text-[11px] text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-medium text-gray-700">Meeting Expectations</p>
              <button
                onClick={() => setShowExpForm(v => !v)}
                className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-800"
              >
                <Plus size={11} /> Add
              </button>
            </div>

            {showExpForm && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={newMtId} onChange={e => setNewMtId(e.target.value)} className={inp}>
                    {meetingTypes.map(mt => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
                  </select>
                  <select value={newExp} onChange={e => setNewExp(e.target.value as Expectation)} className={inp}>
                    <option value="expected">Normally attends</option>
                    <option value="not_expected">Not expected</option>
                  </select>
                </div>
                <input
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Optional note"
                  className={inp}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowExpForm(false)} className="px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700">Cancel</button>
                  <button
                    onClick={handleAddExp}
                    disabled={expSaving}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700 disabled:opacity-40"
                  >
                    {expSaving ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} Save
                  </button>
                </div>
              </div>
            )}

            {expectations.length === 0 ? (
              <p className="text-[11px] text-gray-400">No expectations set.</p>
            ) : (
              <div className="space-y-1">
                {expectations.map(e => (
                  <div key={e.id} className="flex items-center gap-2">
                    <span className="flex-1 text-[12px] text-gray-700">{e.meetingTypeName}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      e.expectation === 'expected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {e.expectation === 'expected' ? 'Attends' : 'Not expected'}
                    </span>
                    <button
                      onClick={() => handleRemoveExp(e.meetingTypeId)}
                      disabled={removingMt === e.meetingTypeId}
                      className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 disabled:opacity-40"
                    >
                      {removingMt === e.meetingTypeId ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {children && <div className="px-4 py-3">{children}</div>}
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCollection, createCollection, updateCollection, deleteCollection } from '@/lib/collections-api';
import { useAuth } from '@/contexts/AuthContext';
import { Field, ContentStudioToolbar, ConfirmDialog } from '../shared';

interface Props {
  collectionId?: string;
  onBack: () => void;
  onSaved: () => void;
}

export default function CollectionEditor({ collectionId, onBack, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(!!collectionId);
  // Internal ID tracking — set after first create so subsequent saves use the right ID
  const [collectionId_, setCollectionId_] = useState(collectionId);

  const [form, setForm] = useState({
    title: '',
    description: '',
    coverImageUrl: '',
    status: 'Draft',
    tags: '',
  });

  // Toolbar state
  const [savingAs, setSavingAs] = useState<'draft' | 'publish' | 'unpublish' | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!collectionId) return;
    getCollection(collectionId)
      .then(c => {
        if (c) setForm({
          title: c.title,
          description: c.description ?? '',
          coverImageUrl: c.coverImageUrl ?? '',
          status: c.status,
          tags: (c.tags ?? []).join(', '),
        });
      })
      .finally(() => setLoading(false));
  }, [collectionId]);

  const patch = <K extends keyof typeof form>(k: K, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (statusOverride?: string) => {
    if (!form.title.trim()) return;
    const targetStatus = statusOverride ?? form.status;
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const payload = {
        title: form.title.trim(),
        description: form.description,
        coverImageUrl: form.coverImageUrl || undefined,
        status: targetStatus,
        tags,
      };
      if (collectionId_) {
        await updateCollection(collectionId_, payload, user?.id);
      } else {
        const created = await createCollection(payload, user?.id);
        setCollectionId_((created as { id: string }).id);
      }
      // Keep status in form in sync
      setForm(f => ({ ...f, status: targetStatus }));
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveDraft = async () => {
    setSavingAs('draft');
    setSuccessMsg('');
    setErrorMsg('');
    const ok = await handleSave();
    if (ok) {
      setSuccessMsg('Draft saved successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      setErrorMsg('Save failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
    setSavingAs(null);
  };

  const handlePublish = async () => {
    setSavingAs('publish');
    setSuccessMsg('');
    setErrorMsg('');
    const ok = await handleSave('Published');
    setSavingAs(null);
    if (ok) {
      toast.success('Collection published successfully.');
      onBack();
    } else {
      setErrorMsg('Failed to publish — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleUnpublish = async () => {
    setSavingAs('unpublish');
    setSuccessMsg('');
    setErrorMsg('');
    const ok = await handleSave('Draft');
    if (ok) {
      setSuccessMsg('Unpublished successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      setErrorMsg('Failed to unpublish — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
    setSavingAs(null);
  };

  const handleDelete = async () => {
    if (!collectionId_) { onBack(); return; }
    setDeleting(true);
    try {
      await deleteCollection(collectionId_, user?.id);
      setConfirmDelete(false);
      onBack();
    } catch {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={20} className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ContentStudioToolbar
        onBack={onBack}
        title={collectionId_ ? 'Edit Collection' : 'New Collection'}
        subtitle={form.title || undefined}
        status={form.status}
        isSaving={savingAs === 'draft'}
        isPublishing={savingAs === 'publish' || savingAs === 'unpublish'}
        successMessage={successMsg}
        errorMessage={errorMsg}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onDelete={collectionId_ ? () => setConfirmDelete(true) : undefined}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Collection?"
          message="This collection will be permanently deleted. Journeys inside it will not be deleted."
          confirmLabel={deleting ? 'Deleting…' : 'Delete Permanently'}
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <Field label="Title *">
              <input
                type="text"
                value={form.title}
                onChange={e => patch('title', e.target.value)}
                placeholder="e.g. Lent 2025 Series"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={e => patch('description', e.target.value)}
                placeholder="Short description visible to users…"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
              />
            </Field>
            <Field label="Tags (comma-separated)">
              <input
                type="text"
                value={form.tags}
                onChange={e => patch('tags', e.target.value)}
                placeholder="e.g. Lent, Prayer, Series"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </Field>
            <Field label="Cover Image URL">
              <input
                type="text"
                value={form.coverImageUrl}
                onChange={e => patch('coverImageUrl', e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

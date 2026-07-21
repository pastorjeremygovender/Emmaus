import React, { createContext, useContext, useState, useEffect } from 'react';
import type { MediaKit, MediaAsset, MediaAssetStatus, AssetVersion } from '@/lib/media-studio-types';

type MediaStudioContextType = {
  kits: MediaKit[];
  assets: MediaAsset[];
  getKit: (id: string) => MediaKit | undefined;
  getAsset: (id: string) => MediaAsset | undefined;
  getAssetsForKit: (kitId: string) => MediaAsset[];
  addKit: (kit: MediaKit) => void;
  updateKit: (kit: MediaKit) => void;
  deleteKit: (kitId: string) => void;
  /** Add a single asset — avoid calling in a loop (use addAssets instead). */
  addAsset: (asset: MediaAsset) => void;
  /** Batch-add multiple assets in a single write. Use this when creating a kit. */
  addAssets: (newAssets: MediaAsset[]) => void;
  updateAsset: (asset: MediaAsset) => void;
  advanceAssetStatus: (assetId: string, to: MediaAssetStatus) => void;
  regenerateAsset: (assetId: string, newContent: string) => void;
  restoreVersion: (assetId: string, version: number) => void;
  /** Clears all kits and assets. Leaves sermons and journeys untouched. */
  resetDemoData: () => void;
};

const MediaStudioContext = createContext<MediaStudioContextType | null>(null);

const KIT_KEY   = 'emmaus_media_kits';
const ASSET_KEY = 'emmaus_media_assets';

export function MediaStudioProvider({ children }: { children: React.ReactNode }) {
  const [kits, setKits]     = useState<MediaKit[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);

  // Start from whatever is stored; if nothing, start empty (no seeded demo data).
  useEffect(() => {
    const sk = localStorage.getItem(KIT_KEY);
    setKits(sk ? JSON.parse(sk) : []);

    const sa = localStorage.getItem(ASSET_KEY);
    setAssets(sa ? JSON.parse(sa) : []);
  }, []);

  const saveKits = (next: MediaKit[]) => {
    setKits(next);
    localStorage.setItem(KIT_KEY, JSON.stringify(next));
  };

  const saveAssets = (next: MediaAsset[]) => {
    setAssets(next);
    localStorage.setItem(ASSET_KEY, JSON.stringify(next));
  };

  const getKit       = (id: string) => kits.find(k => k.id === id);
  const getAsset     = (id: string) => assets.find(a => a.id === id);
  const getAssetsForKit = (kitId: string) => assets.filter(a => a.kitId === kitId);

  const addKit    = (kit: MediaKit) => saveKits([...kits, kit]);
  const updateKit = (kit: MediaKit) =>
    saveKits(kits.map(k => k.id === kit.id ? { ...kit, updatedAt: new Date().toISOString() } : k));
  const deleteKit = (kitId: string) => {
    saveKits(kits.filter(k => k.id !== kitId));
    saveAssets(assets.filter(a => a.kitId !== kitId));
  };

  const addAsset    = (asset: MediaAsset) => saveAssets([...assets, asset]);
  // Batch version: reads the current assets snapshot once and appends all new
  // assets in a single saveAssets call — avoids the stale-closure bug that
  // occurs when addAsset is called in a loop.
  const addAssets   = (newAssets: MediaAsset[]) => saveAssets([...assets, ...newAssets]);
  const updateAsset = (asset: MediaAsset) =>
    saveAssets(assets.map(a => a.id === asset.id ? asset : a));

  const advanceAssetStatus = (assetId: string, to: MediaAssetStatus) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    updateAsset({
      ...asset,
      status: to,
      approvedAt:  to === 'Approved'  ? new Date().toISOString() : asset.approvedAt,
      publishedAt: to === 'Published' ? new Date().toISOString() : asset.publishedAt,
    });
  };

  const regenerateAsset = (assetId: string, newContent: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const newVersion: AssetVersion = {
      version: asset.versions.length + 1,
      content: newContent,
      createdAt: new Date().toISOString(),
    };
    updateAsset({
      ...asset,
      content: newContent,
      status: 'Draft', // regeneration always resets to Draft
      versions: [...asset.versions, newVersion],
    });
  };

  const restoreVersion = (assetId: string, version: number) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const v = asset.versions.find(ver => ver.version === version);
    if (!v) return;
    regenerateAsset(assetId, v.content);
  };

  const resetDemoData = () => {
    saveKits([]);
    saveAssets([]);
  };

  return (
    <MediaStudioContext.Provider value={{
      kits, assets, getKit, getAsset, getAssetsForKit,
      addKit, updateKit, deleteKit,
      addAsset, addAssets, updateAsset,
      advanceAssetStatus, regenerateAsset, restoreVersion,
      resetDemoData,
    }}>
      {children}
    </MediaStudioContext.Provider>
  );
}

export const useMediaStudio = () => {
  const ctx = useContext(MediaStudioContext);
  if (!ctx) throw new Error('useMediaStudio must be used within MediaStudioProvider');
  return ctx;
};

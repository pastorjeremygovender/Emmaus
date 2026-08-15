/**
 * ShareImageGenerator — AI share image generation, editing and approval.
 *
 * The administrator pastes their devotional text, picks attribution, and
 * generates a beautiful share image without writing any prompt.
 *
 * State machine:
 *   idle → generating → preview → editing (→ generating → preview → …) → [Use Image]
 *
 * "Use Image":
 *   1. Composites attribution footer onto the generated PNG using browser Canvas
 *   2. Uploads the final image via existing presigned URL flow
 *   3. Calls onChange(objectPath) — same as a manual upload
 *
 * Props:
 *   onChange(path | null) — called when the admin accepts an image.
 *   onCancel()            — called when the admin discards and goes back.
 */

import React, { useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Pencil,
  CheckCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";

// ─── Attribution ──────────────────────────────────────────────────────────────

export type Attribution = "emmaus" | "jeremy" | "none";

const ATTRIBUTION_OPTIONS: Array<{ value: Attribution; label: string; sub?: string }> = [
  {
    value: "emmaus",
    label: "Emmaus Ministry",
    sub: "Shared from Emmaus · Isipingo Community Church",
  },
  { value: "jeremy", label: "Jeremy Govender" },
  { value: "none", label: "None" },
];

// ─── State machine ────────────────────────────────────────────────────────────

type GenPhase =
  | { phase: "idle" }
  | { phase: "generating" }
  | { phase: "preview"; imageBase64: string }
  | { phase: "editing"; imageBase64: string; applying: boolean };

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onChange: (path: string | null) => void;
  onCancel: () => void;
}

// ─── Canvas attribution compositor ───────────────────────────────────────────
// Draws the AI-generated image + an optional attribution footer onto a Canvas,
// then returns the result as a PNG Blob. This keeps attribution pixel-perfect —
// the AI model only creates the devotional artwork.

async function compositeAttributionBlob(
  imageBase64: string,
  attribution: Attribution
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }

      // ── Base image ────────────────────────────────────────────────────────
      ctx.drawImage(img, 0, 0);

      if (attribution !== "none") {
        const W = canvas.width;
        const H = canvas.height;
        const scale = W / 1024; // normalise font sizes to image width

        if (attribution === "emmaus") {
          // Two-line footer: measure both lines first, then position
          const primarySize = Math.round(18 * scale);
          const secondarySize = Math.round(13 * scale);
          const lineGap = Math.round(10 * scale);
          const padV = Math.round(22 * scale); // vertical padding from bottom edge

          const blockH = primarySize + lineGap + secondarySize;
          const FOOTER = blockH + padV * 2;
          const yTop = H - FOOTER;

          // Gradient — fades from transparent to semi-opaque black
          const grad = ctx.createLinearGradient(0, yTop - FOOTER * 0.4, 0, H);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, "rgba(0,0,0,0.60)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, yTop - FOOTER * 0.4, W, FOOTER * 1.4);

          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          // Line 1 — "Shared from Emmaus"
          const y1 = H - padV - secondarySize - lineGap - primarySize;
          ctx.font = `600 ${primarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.97)";
          ctx.fillText("Shared from Emmaus", W / 2, y1);

          // Line 2 — "A discipleship ministry of Isipingo Community Church"
          const y2 = y1 + primarySize + lineGap;
          ctx.font = `${secondarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.72)";
          ctx.fillText("A discipleship ministry of Isipingo Community Church", W / 2, y2);

        } else if (attribution === "jeremy") {
          const primarySize = Math.round(17 * scale);
          const padV = Math.round(24 * scale);
          const FOOTER = primarySize + padV * 2;
          const yTop = H - FOOTER;

          const grad = ctx.createLinearGradient(0, yTop - FOOTER * 0.4, 0, H);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, "rgba(0,0,0,0.55)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, yTop - FOOTER * 0.4, W, FOOTER * 1.4);

          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          const y1 = H - padV - primarySize;
          ctx.font = `500 ${primarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.fillText("Jeremy Govender", W / 2, y1);
        }
      }

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas to blob conversion failed"));
        },
        "image/png"
      );
    };
    img.onerror = () => reject(new Error("Failed to load generated image onto canvas"));
    img.src = `data:image/png;base64,${imageBase64}`;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShareImageGenerator({ onChange, onCancel }: Props) {
  const { user } = useAuth();

  // Stable inputs — survive state machine transitions
  const [text, setText] = useState("");
  const [attribution, setAttribution] = useState<Attribution>("emmaus");
  const [editInstruction, setEditInstruction] = useState("");

  // State machine
  const [state, setState] = useState<GenPhase>({ phase: "idle" });
  const [genError, setGenError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Duplicate-request guard
  const generatingRef = useRef(false);

  // ── API call ─────────────────────────────────────────────────────────────

  async function callGenerate(
    mode: "generate" | "edit",
    referenceImageBase64?: string
  ): Promise<string> {
    const body: Record<string, string> = { text: text.trim() };
    if (mode === "edit" && editInstruction.trim() && referenceImageBase64) {
      body.editInstruction = editInstruction.trim();
      body.referenceImageBase64 = referenceImageBase64;
    }

    const res = await fetch(getApiUrl("/api/share-images/generate"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user?.id ?? "",
        "x-user-role": user?.role ?? "",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(errBody.error ?? "Generation failed");
    }

    const { imageBase64 } = await res.json() as { imageBase64: string };
    return imageBase64;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!text.trim()) { setGenError("Please enter some text first."); return; }
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenError("");
    setState({ phase: "generating" });
    try {
      const b64 = await callGenerate("generate");
      setState({ phase: "preview", imageBase64: b64 });
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Generation failed. Please try again.");
      setState({ phase: "idle" });
    } finally {
      generatingRef.current = false;
    }
  }

  async function handleRegenerate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenError("");
    setState({ phase: "generating" });
    try {
      const b64 = await callGenerate("generate");
      setState({ phase: "preview", imageBase64: b64 });
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Regeneration failed. Please try again.");
      // Restore preview with previous image if we had one
      setState({ phase: "idle" });
    } finally {
      generatingRef.current = false;
    }
  }

  async function handleApplyEdit() {
    if (state.phase !== "preview" && state.phase !== "editing") return;
    if (!editInstruction.trim()) return;
    if (generatingRef.current) return;
    const prevImage = state.phase === "preview" ? state.imageBase64 :
      state.phase === "editing" ? state.imageBase64 : undefined;
    if (!prevImage) return;

    generatingRef.current = true;
    setState({ phase: "editing", imageBase64: prevImage, applying: true });
    setGenError("");

    try {
      const b64 = await callGenerate("edit", prevImage);
      setState({ phase: "preview", imageBase64: b64 });
      setEditInstruction("");
    } catch (e: unknown) {
      // Retain previous image on failure
      setGenError(e instanceof Error ? e.message : "Edit failed. The previous image is unchanged.");
      setState({ phase: "editing", imageBase64: prevImage, applying: false });
    } finally {
      generatingRef.current = false;
    }
  }

  async function handleUseImage() {
    if (state.phase !== "preview") return;
    if (!user) return;
    setSaveError("");
    setSaving(true);
    try {
      // 1. Composite attribution onto the image
      const blob = await compositeAttributionBlob(state.imageBase64, attribution);

      // 2. Request presigned upload URL
      const metaRes = await fetch(getApiUrl("/api/storage/uploads/request-url"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": user.role,
        },
        body: JSON.stringify({
          name: "emmaus-share.png",
          size: blob.size,
          contentType: "image/png",
        }),
      });
      if (!metaRes.ok) {
        const b = await metaRes.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Failed to get upload URL");
      }
      const { uploadURL, objectPath } = await metaRes.json() as {
        uploadURL: string;
        objectPath: string;
      };

      // 3. PUT to presigned URL
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      // 4. Persist
      onChange(objectPath);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const previewImage =
    state.phase === "preview" || state.phase === "editing"
      ? state.imageBase64
      : null;

  return (
    <div className="space-y-4">

      {/* ── Text input — always visible ──────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-medium text-gray-700 mb-1">Text for image</p>
        <p className="text-[11px] text-gray-400 mb-2">
          Paste the thought, quote or Scripture you want to turn into a shareable image.
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={state.phase === "generating" || (state.phase === "editing" && state.applying)}
          rows={4}
          placeholder={"Jesus welcomes honest seekers.\nHe doesn't ask you to have all the answers before you come to Him.\nHe simply invites you to begin walking with Him."}
          className="w-full px-3 py-2.5 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent disabled:opacity-60 placeholder:text-gray-300"
        />
      </div>

      {/* ── Attribution selector ─────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-medium text-gray-700 mb-2">Attribution</p>
        <div className="flex flex-col gap-1.5">
          {ATTRIBUTION_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <input
                type="radio"
                name="share-image-attribution"
                value={opt.value}
                checked={attribution === opt.value}
                onChange={() => setAttribution(opt.value)}
                className="accent-teal-600"
              />
              <span className="text-[13px] text-gray-700">{opt.label}</span>
              {opt.sub && (
                <span className="text-[11px] text-gray-400">{opt.sub}</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* ── Generated image preview ──────────────────────────────────────── */}
      {previewImage && (
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
          <img
            src={`data:image/png;base64,${previewImage}`}
            alt="Generated share image preview"
            className="w-full h-full object-cover block"
          />
        </div>
      )}

      {/* ── Generating / applying state ──────────────────────────────────── */}
      {(state.phase === "generating" || (state.phase === "editing" && state.applying)) && (
        <div className="flex items-center gap-2.5 py-3 text-[13px] text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-teal-500" />
          {state.phase === "generating"
            ? "Emmaus is creating your share image…"
            : "Applying your changes…"}
        </div>
      )}

      {/* ── Edit instruction field ───────────────────────────────────────── */}
      {state.phase === "editing" && (
        <div>
          <p className="text-[12px] font-medium text-gray-700 mb-1">What would you like to change?</p>
          <p className="text-[11px] text-gray-400 mb-2">
            Tell Emmaus what you would like changed about this image.
          </p>
          <textarea
            value={editInstruction}
            onChange={e => setEditInstruction(e.target.value)}
            disabled={state.applying}
            rows={3}
            placeholder="I don't want the face of Jesus visible. Regenerate with Jesus shown from behind."
            className="w-full px-3 py-2.5 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent disabled:opacity-60 placeholder:text-gray-300"
          />
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      {state.phase === "idle" && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!text.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" />
          Generate Image
        </button>
      )}

      {state.phase === "preview" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleUseImage}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.97] transition-all disabled:opacity-50 col-span-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            ) : (
              <><CheckCircle className="w-4 h-4" />Use Image</>
            )}
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => {
              setEditInstruction("");
              setState({ phase: "editing", imageBase64: state.imageBase64, applying: false });
            }}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Image
          </button>
          <button
            type="button"
            onClick={() => {
              setGenError("");
              setState({ phase: "idle" });
            }}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all col-span-2 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start Over
          </button>
        </div>
      )}

      {state.phase === "editing" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleApplyEdit}
            disabled={!editInstruction.trim() || state.applying}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed col-span-2"
          >
            {state.applying ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Applying changes…</>
            ) : (
              <><Sparkles className="w-4 h-4" />Apply Changes</>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setState({ phase: "preview", imageBase64: state.imageBase64 });
              setEditInstruction("");
            }}
            disabled={state.applying}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all col-span-2 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      )}

      {/* ── Errors ────────────────────────────────────────────────────────── */}
      {genError && (
        <p className="text-[12px] text-red-500 leading-snug">{genError}</p>
      )}
      {saveError && (
        <p className="text-[12px] text-red-500 leading-snug">{saveError}</p>
      )}

      {/* ── Cancel / go back ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onCancel}
        className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors w-full text-center"
      >
        ← Back to upload
      </button>
    </div>
  );
}

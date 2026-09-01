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
  | { phase: "preview"; imageBase64: string; styleId: GenerationStyleId }
  | { phase: "editing"; imageBase64: string; applying: boolean };

type GenerationStyleId = "dark-cinematic" | "light-floral" | "in-the-middle";

const STYLE_OPTIONS: Array<{
  value: GenerationStyleId;
  label: string;
  description: string;
}> = [
  {
    value: "dark-cinematic",
    label: "Dark and Cinematic",
    description: "Moody, dramatic scenes with rich shadows and cinematic light.",
  },
  {
    value: "light-floral",
    label: "Light and Floral",
    description: "Bright, gentle imagery with fresh colour and occasional botanical detail.",
  },
  {
    value: "in-the-middle",
    label: "In the Middle",
    description: "Balanced editorial imagery with varied subjects and atmosphere.",
  },
];

type ComparisonImages = {
  first?: { imageBase64: string; styleId: GenerationStyleId; details?: GenerationDetails };
  second?: { imageBase64: string; styleId: GenerationStyleId; details?: GenerationDetails };
};

type NewMethodReasoning = {
  emotionalCentre: string;
  visualMetaphor: string;
  composition: string;
  heroText: string;
  mood: string;
  avoid: string[];
};

type GenerationDetails = {
  styleId?: GenerationStyleId;
  styleLabel?: string;
  pipeline?: string;
  reasoningModel?: string;
  model?: string;
  quality?: string;
  size?: string;
  reasoning?: NewMethodReasoning;
  prompt: string;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onChange: (path: string | null) => void;
  onCancel: () => void;
}

// ─── Canvas attribution compositor ───────────────────────────────────────────
// Draws the AI-generated image + an optional attribution footer onto a Canvas,
// then returns the result as a PNG Blob. This keeps attribution pixel-perfect —
// the AI model only creates the devotional artwork.

/** Load an Image element from a src URL; resolves even if the logo 404s (returns null). */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null); // gracefully degrade — footer still renders text
    el.src = src;
  });
}

export async function compositeAttributionBlob(
  imageBase64: string,
  attribution: Attribution
): Promise<Blob> {
  // Load the base image and logo mark in parallel
  const [img, logoImg] = await Promise.all([
    loadImage(`data:image/png;base64,${imageBase64}`),
    attribution !== "none" ? loadImage("/icon.png") : Promise.resolve(null),
  ]);

  if (!img) throw new Error("Failed to load generated image onto canvas");

  return new Promise((resolve, reject) => {
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

      // Shared layout helpers
      const DIVIDER_W = Math.round(1 * scale);
      const DIVIDER_GAP = Math.round(14 * scale); // gap each side of divider
      const LOGO_CORNER_R = Math.round(6 * scale); // rounded corners on logo mark

      if (attribution === "emmaus") {
        // Two-line text block — sizes tuned to remain readable on a mobile screen
        const primarySize = Math.round(28 * scale);
        const secondarySize = Math.round(19 * scale);
        const lineGap = Math.round(10 * scale);
        const padV = Math.round(30 * scale);

        const textBlockH = primarySize + lineGap + secondarySize;
        const FOOTER = textBlockH + padV * 2;
        const yTop = H - FOOTER;

        // Gradient — fades from transparent to semi-opaque black
        const grad = ctx.createLinearGradient(0, yTop - FOOTER * 0.4, 0, H);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.65)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, yTop - FOOTER * 0.4, W, FOOTER * 1.4);

        // Vertical centre of the footer text block
        const footerMidY = H - padV - textBlockH / 2;

        // Logo mark — square, height = textBlockH, with a bit of breathing room
        const logoSize = Math.round(textBlockH * 1.1);
        const logoX = W / 2; // will recompute after measuring text

        // Measure text widths to centre the composed unit
        ctx.font = `600 ${primarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        const line1W = ctx.measureText("Shared from Emmaus").width;
        ctx.font = `${secondarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        const line2W = ctx.measureText("A discipleship ministry of Isipingo Community Church").width;
        const maxTextW = Math.max(line1W, line2W);

        // Total composed width: logo + gap + divider + gap + text
        const composedW = (logoImg ? logoSize + DIVIDER_GAP + DIVIDER_W + DIVIDER_GAP : 0) + maxTextW;
        const startX = (W - composedW) / 2;

        let textStartX = startX;

        // Draw logo mark
        if (logoImg) {
          const lx = startX;
          const ly = footerMidY - logoSize / 2;

          // Rounded-corner clip
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(lx, ly, logoSize, logoSize, LOGO_CORNER_R);
          ctx.clip();
          ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
          ctx.restore();

          // Vertical divider
          const divX = lx + logoSize + DIVIDER_GAP;
          const divH = Math.round(textBlockH * 0.85);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(divX, footerMidY - divH / 2, DIVIDER_W, divH);

          textStartX = divX + DIVIDER_W + DIVIDER_GAP;
        }

        // Text — left-aligned from textStartX
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const y1 = footerMidY - textBlockH / 2;
        ctx.font = `600 ${primarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.97)";
        ctx.fillText("Shared from Emmaus", textStartX, y1);

        const y2 = y1 + primarySize + lineGap;
        ctx.font = `${secondarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.fillText("A discipleship ministry of Isipingo Community Church", textStartX, y2);

      } else if (attribution === "jeremy") {
        const primarySize = Math.round(26 * scale);
        const padV = Math.round(30 * scale);
        const FOOTER = primarySize + padV * 2;
        const yTop = H - FOOTER;

        const grad = ctx.createLinearGradient(0, yTop - FOOTER * 0.4, 0, H);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, yTop - FOOTER * 0.4, W, FOOTER * 1.4);

        const footerMidY = H - padV - primarySize / 2;
        const logoSize = Math.round(primarySize * 1.8);

        // Measure text
        ctx.font = `500 ${primarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        const textW = ctx.measureText("Jeremy Govender").width;

        const composedW = (logoImg ? logoSize + DIVIDER_GAP + DIVIDER_W + DIVIDER_GAP : 0) + textW;
        const startX = (W - composedW) / 2;

        let textStartX = startX;

        if (logoImg) {
          const lx = startX;
          const ly = footerMidY - logoSize / 2;

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(lx, ly, logoSize, logoSize, LOGO_CORNER_R);
          ctx.clip();
          ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
          ctx.restore();

          const divX = lx + logoSize + DIVIDER_GAP;
          const divH = Math.round(primarySize * 0.85);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(divX, footerMidY - divH / 2, DIVIDER_W, divH);

          textStartX = divX + DIVIDER_W + DIVIDER_GAP;
        }

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const y1 = footerMidY;
        ctx.font = `500 ${primarySize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText("Jeremy Govender", textStartX, y1);
      }
    }

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas to blob conversion failed"));
      },
      "image/png"
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShareImageGenerator({ onChange, onCancel }: Props) {
  const { user } = useAuth();

  // Stable inputs — survive state machine transitions
  const [text, setText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<GenerationStyleId>("in-the-middle");
  const [attribution, setAttribution] = useState<Attribution>("emmaus");
  const [editInstruction, setEditInstruction] = useState("");

  // State machine
  const [state, setState] = useState<GenPhase>({ phase: "idle" });
  const [genError, setGenError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [comparison, setComparison] = useState<ComparisonImages>({});

  // Duplicate-request guard
  const generatingRef = useRef(false);

  // ── API call ─────────────────────────────────────────────────────────────

  async function callGenerate(
    mode: "generate" | "edit",
    referenceImageBase64?: string,
    styleId: GenerationStyleId = "in-the-middle"
  ): Promise<{ imageBase64: string; details?: GenerationDetails }> {
    const body: Record<string, string> = { text: text.trim() };
    if (mode === "generate") body.styleId = styleId;
    if (mode === "edit" && editInstruction.trim() && referenceImageBase64) {
      body.editInstruction = editInstruction.trim();
      body.referenceImageBase64 = referenceImageBase64;
    }

    const res = await fetch(getApiUrl("/api/share-images/generate"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(errBody.error ?? "Generation failed");
    }

    const { imageBase64, generationDetails } = await res.json() as {
      imageBase64: string;
      generationDetails?: GenerationDetails;
    };
    return { imageBase64, details: generationDetails };
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  function rememberComparison(current: ComparisonImages, imageBase64: string, styleId: GenerationStyleId, details?: GenerationDetails): ComparisonImages {
    const item = { imageBase64, styleId, details };
    if (current.first?.styleId === styleId) return { ...current, first: item };
    if (current.second?.styleId === styleId) return { ...current, second: item };
    if (!current.first) return { ...current, first: item };
    if (!current.second) return { ...current, second: item };
    return { ...current, second: item };
  }

  async function handleGenerate(styleId: GenerationStyleId = selectedStyle) {
    if (!text.trim()) { setGenError("Please enter some text first."); return; }
    if (generatingRef.current) return;
    generatingRef.current = true;
    setSelectedStyle(styleId);
    setGenError("");
    setState({ phase: "generating" });
    try {
      const generated = await callGenerate("generate", undefined, styleId);
      setComparison(current => rememberComparison(current, generated.imageBase64, styleId, generated.details));
      setState({ phase: "preview", imageBase64: generated.imageBase64, styleId });
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
      const styleId = state.phase === "preview" ? state.styleId : selectedStyle;
      const generated = await callGenerate("generate", undefined, styleId);
      setComparison(current => rememberComparison(current, generated.imageBase64, styleId, generated.details));
      setState({ phase: "preview", imageBase64: generated.imageBase64, styleId });
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
      const generated = await callGenerate("edit", prevImage, selectedStyle);
      setState({ phase: "preview", imageBase64: generated.imageBase64, styleId: state.phase === "preview" ? state.styleId : selectedStyle });
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
  const hasComparison = Boolean(comparison.first && comparison.second);
  const styleLabel = (styleId: GenerationStyleId) =>
    STYLE_OPTIONS.find(option => option.value === styleId)?.label ?? styleId;

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

      {hasComparison && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-gray-700">Style comparison</p>
            <span className="text-[11px] text-gray-400">Neither image has been saved</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">{styleLabel(comparison.first!.styleId)}</p>
              <img
                src={`data:image/png;base64,${comparison.first!.imageBase64}`}
                alt={`${styleLabel(comparison.first!.styleId)} comparison`}
                className="w-full aspect-square object-cover rounded-lg border border-gray-200"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-teal-700">{styleLabel(comparison.second!.styleId)}</p>
              <img
                src={`data:image/png;base64,${comparison.second!.imageBase64}`}
                alt={`${styleLabel(comparison.second!.styleId)} comparison`}
                className="w-full aspect-square object-cover rounded-lg border border-teal-300"
              />
              {(comparison.second!.details || comparison.first!.details) && (
                <details className="pt-1 text-[11px] text-gray-500">
                  <summary className="cursor-pointer font-medium text-teal-700">Generation Details</summary>
                  <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-2">
                    <p><strong>Style:</strong> {(comparison.second!.details || comparison.first!.details)?.styleLabel}</p>
                    <p><strong>Pipeline:</strong> {(comparison.second!.details || comparison.first!.details)?.pipeline}</p>
                    {(comparison.second!.details || comparison.first!.details)?.reasoning && (
                      <>
                        <p><strong>Reasoning Model:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoningModel}</p>
                        <p><strong>Image Model:</strong> {(comparison.second!.details || comparison.first!.details)?.model}</p>
                        <p><strong>Image Quality:</strong> {(comparison.second!.details || comparison.first!.details)?.quality}</p>
                        <p><strong>Image Size:</strong> {(comparison.second!.details || comparison.first!.details)?.size}</p>
                        <p><strong>Emotional Centre:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoning?.emotionalCentre}</p>
                        <p><strong>Visual Metaphor:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoning?.visualMetaphor}</p>
                        <p><strong>Composition:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoning?.composition}</p>
                        <p><strong>Hero Text:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoning?.heroText}</p>
                        <p><strong>Mood:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoning?.mood}</p>
                        <p><strong>Avoid:</strong> {(comparison.second!.details || comparison.first!.details)?.reasoning?.avoid.join(", ")}</p>
                      </>
                    )}
                    <div>
                      <strong>Final Image Prompt:</strong>
                      <pre className="mt-1 whitespace-pre-wrap font-sans">{(comparison.second!.details || comparison.first!.details)?.prompt}</pre>
                    </div>
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* ── Visual style selector ─────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-medium text-gray-700 mb-1">Visual style</p>
        <p className="text-[11px] text-gray-400 mb-2">
          Choose the image direction before generating.
        </p>
        <div className="grid gap-2">
          {STYLE_OPTIONS.map(option => (
            <label
              key={option.value}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                selectedStyle === option.value
                  ? "border-teal-500 bg-teal-50"
                  : "border-gray-200 hover:border-teal-200"
              }`}
            >
              <input
                type="radio"
                name="share-image-style"
                value={option.value}
                checked={selectedStyle === option.value}
                onChange={() => setSelectedStyle(option.value)}
                disabled={state.phase === "generating" || saving}
                className="mt-0.5 accent-teal-600"
              />
              <span>
                <span className="block text-[13px] font-medium text-gray-800">{option.label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Generated image preview ──────────────────────────────────────── */}
      {previewImage && (
        // container-type: inline-size enables cqw units inside so all sizing
        // scales with preview width — matching the canvas compositor's
        // scale = W / 1024 approach.
        <div
          className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square relative"
          style={{ containerType: "inline-size" } as React.CSSProperties}
        >
          <img
            src={`data:image/png;base64,${previewImage}`}
            alt="Generated share image preview"
            className="w-full h-full object-cover block"
          />

          {/* ── Attribution footer overlay (live CSS preview of the canvas composite) ──
               All dimensions in cqw = % of container width, mirroring the canvas
               scale = W / 1024 calculation:
                 emmaus: primarySize 18px → 1.758cqw, secondarySize 13px → 1.27cqw
                         logoSize 39cqpx → 3.81cqw, padV 22px → 2.15cqw
                 jeremy: primarySize 17px → 1.66cqw, logoSize 27px → 2.64cqw
                         padV 24px → 2.34cqw
               DIVIDER_GAP 14px → 1.37cqw each side, DIVIDER_W 1px → 0.098cqw
          */}
          {attribution !== "none" && (
            <div
              className="absolute bottom-0 left-0 right-0 flex items-center justify-center"
              style={{
                background:
                  attribution === "emmaus"
                    ? "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)"
                    : "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
                paddingTop: "8.1cqw",
                paddingBottom: attribution === "emmaus" ? "2.15cqw" : "2.34cqw",
              }}
            >
              {/* Logo mark */}
              <img
                src="/icon.png"
                alt=""
                style={{
                  width: attribution === "emmaus" ? "3.81cqw" : "2.64cqw",
                  height: attribution === "emmaus" ? "3.81cqw" : "2.64cqw",
                  borderRadius: "0.59cqw",
                  objectFit: "cover",
                  flexShrink: 0,
                } as React.CSSProperties}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />

              {/* Vertical divider */}
              <div
                style={{
                  width: "0.098cqw",
                  height: attribution === "emmaus" ? "3.24cqw" : "1.41cqw",
                  background: "rgba(255,255,255,0.35)",
                  margin: "0 1.37cqw",
                  flexShrink: 0,
                } as React.CSSProperties}
              />

              {/* Text block */}
              {attribution === "emmaus" ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: "1.758cqw",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.97)",
                      lineHeight: 1.2,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    } as React.CSSProperties}
                  >
                    Shared from Emmaus
                  </span>
                  <span
                    style={{
                      fontSize: "1.27cqw",
                      marginTop: "0.78cqw",
                      color: "rgba(255,255,255,0.72)",
                      lineHeight: 1.2,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    } as React.CSSProperties}
                  >
                    A discipleship ministry of Isipingo Community Church
                  </span>
                </div>
              ) : (
                <span
                  style={{
                    fontSize: "1.66cqw",
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.95)",
                    lineHeight: 1.2,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  } as React.CSSProperties}
                >
                  Jeremy Govender
                </span>
              )}
            </div>
          )}
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleGenerate(selectedStyle)}
            disabled={!text.trim()}
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Generate Image
          </button>
        </div>
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
            onClick={() => handleGenerate(selectedStyle)}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium border border-teal-200 text-teal-700 hover:bg-teal-50 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Another Style
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
              setComparison({});
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
               setState({ phase: "preview", imageBase64: state.imageBase64, styleId: selectedStyle });
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

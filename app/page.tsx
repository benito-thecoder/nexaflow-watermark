"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Download,
  LogIn,
  AlertTriangle,
  Image as ImageIcon,
  LogOut,
  Smartphone,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const RATIOS = [
  { label: "Original", w: 0, h: 0 },
  { label: "1:1", w: 1, h: 1 },
  { label: "4:5", w: 4, h: 5 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "5:4", w: 5, h: 4 },
];

const LOGO_POSITIONS = [
  { key: "top-left", label: "Top left" },
  { key: "top-right", label: "Top right" },
  { key: "center", label: "Center" },
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-right", label: "Bottom right" },
  { key: "custom", label: "Custom (drag)" },
];

const TEXT_LAYOUTS = [
  { key: "center", label: "Center" },
  { key: "incline-left", label: "Incline \u2199" },
  { key: "incline-right", label: "Incline \u2197" },
];

type Profile = {
  brand_name: string;
  logo_url: string;
};

function isValidId(v: string) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phone = /^[0-9+\-\s]{7,15}$/;
  return email.test(v) || phone.test(v);
}

function normalizeId(v: string) {
  return v.trim().toLowerCase();
}

export default function App() {
  const [stage, setStage] = useState<"auth" | "profile" | "tool">("auth");
  const [identifier, setIdentifier] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [brandNameInput, setBrandNameInput] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFileError, setLogoFileError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [ratio, setRatio] = useState(RATIOS[0]);

  const [showText, setShowText] = useState(true);
  const [showLogo, setShowLogo] = useState(true);

  const [textOpacity, setTextOpacity] = useState(35);
  const [textFill, setTextFill] = useState(80);
  const [textLayout, setTextLayout] = useState("incline-right");

  const [logoOpacity, setLogoOpacity] = useState(90);
  const [logoSize, setLogoSize] = useState(18); // % of canvas width
  const [logoPos, setLogoPos] = useState("bottom-right");
  const [customLogoPos, setCustomLogoPos] = useState({ x: 0.75, y: 0.82 }); // fractional
  const [pendingLowOpacity, setPendingLowOpacity] = useState<number | null>(null);
  const [logoOpacityConfirmed, setLogoOpacityConfirmed] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);

  // ---------- PWA install prompt ----------
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    setShowInstallBanner(false);
  };

  // ---------- Auth: identifier must already exist in allowed_users ----------
  const handleLogin = async () => {
    setAuthError("");
    const id = normalizeId(identifier);
    if (!isValidId(id)) {
      setAuthError("Enter a valid email or phone number.");
      return;
    }
    setLoading(true);
    try {
      const { data: allowed, error: allowedErr } = await supabase
        .from("allowed_users")
        .select("identifier")
        .eq("identifier", id)
        .maybeSingle();

      if (allowedErr) throw allowedErr;

      if (!allowed) {
        setAuthError(
          "This email/phone isn't on the approved list. Contact your admin to get access."
        );
        setLoading(false);
        return;
      }

      const { data: existingProfile, error: profileErr } = await supabase
        .from("brand_profiles")
        .select("brand_name, logo_url")
        .eq("identifier", id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      if (existingProfile) {
        setProfile(existingProfile as Profile);
        setBrandNameInput(existingProfile.brand_name || "");
        setIsNewProfile(false);
      } else {
        setProfile(null);
        setBrandNameInput("");
        setIsNewProfile(true);
      }
      setStage("profile");
    } catch (e: any) {
      setAuthError(e?.message || "Something went wrong. Try again.");
    }
    setLoading(false);
  };

  const handleLogoFile = (file: File | null) => {
    setLogoFileError("");
    if (!file) return;
    if (file.type !== "image/png") {
      setLogoFileError("Logo must be a PNG file (transparent background recommended).");
      return;
    }
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    setSaveMsg("");
    if (!brandNameInput.trim()) {
      setSaveMsg("Enter a brand name.");
      return;
    }
    if (!logoFile && !profile?.logo_url) {
      setSaveMsg("Upload a PNG logo.");
      return;
    }
    setSaving(true);
    const id = normalizeId(identifier);
    try {
      let logoUrl = profile?.logo_url || "";

      if (logoFile) {
        const path = `${id.replace(/[^a-z0-9]/gi, "_")}/logo-${Date.now()}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("logos")
          .upload(path, logoFile, { upsert: true, contentType: "image/png" });
        if (uploadErr) throw uploadErr;

        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        logoUrl = pub.publicUrl;
      }

      const { error: upsertErr } = await supabase
        .from("brand_profiles")
        .upsert(
          { identifier: id, brand_name: brandNameInput.trim(), logo_url: logoUrl },
          { onConflict: "identifier" }
        );
      if (upsertErr) throw upsertErr;

      const newProfile = { brand_name: brandNameInput.trim(), logo_url: logoUrl };
      setProfile(newProfile);
      setSaveMsg("Saved.");
      setTimeout(() => setSaveMsg(""), 1200);
      setStage("tool");
    } catch (e: any) {
      setSaveMsg(e?.message || "Could not save. Try again.");
    }
    setSaving(false);
  };

  const useExistingAndContinue = () => setStage("tool");

  // ---------- Image upload ----------
  const handleImageUpload = (file: File | null) => {
    if (!file) return;
    setImageLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        setSourceImg(img);
        setImageLoading(false);
      };
      img.onerror = () => setImageLoading(false);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const applyLogoOpacity = (val: number) => {
    if (val < 60) {
      setPendingLowOpacity(val);
      setLogoOpacityConfirmed(false);
    } else {
      setLogoOpacity(val);
      setLogoOpacityConfirmed(true);
    }
  };

  // ---------- Draw at FULL source resolution (no quality loss) ----------
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!profile?.logo_url) {
      logoImgRef.current = null;
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoImgRef.current = img;
      draw();
    };
    img.src = profile.logo_url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.logo_url]);

  const getLogoRect = useCallback(
    (targetW: number, targetH: number) => {
      const logoImg = logoImgRef.current;
      if (!logoImg) return null;
      const logoW = targetW * (logoSize / 100);
      const logoH = (logoImg.height / logoImg.width) * logoW;
      const margin = targetW * 0.03;
      let x: number, y: number;
      switch (logoPos) {
        case "top-left":
          x = margin;
          y = margin;
          break;
        case "top-right":
          x = targetW - logoW - margin;
          y = margin;
          break;
        case "bottom-left":
          x = margin;
          y = targetH - logoH - margin;
          break;
        case "bottom-right":
          x = targetW - logoW - margin;
          y = targetH - logoH - margin;
          break;
        case "custom":
          x = customLogoPos.x * targetW - logoW / 2;
          y = customLogoPos.y * targetH - logoH / 2;
          break;
        default:
          x = (targetW - logoW) / 2;
          y = (targetH - logoH) / 2;
      }
      return { x, y, w: logoW, h: logoH };
    },
    [logoPos, logoSize, customLogoPos]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImg) return;

    let targetW: number;
    let targetH: number;
    if (ratio.w === 0) {
      targetW = sourceImg.width;
      targetH = sourceImg.height;
    } else {
      targetW = sourceImg.width;
      targetH = Math.round((targetW * ratio.h) / ratio.w);
    }

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, targetW, targetH);

    // cover-fit crop of source image into target ratio
    const srcRatio = sourceImg.width / sourceImg.height;
    const dstRatio = targetW / targetH;
    let sx: number, sy: number, sw: number, sh: number;
    if (srcRatio > dstRatio) {
      sh = sourceImg.height;
      sw = sh * dstRatio;
      sx = (sourceImg.width - sw) / 2;
      sy = 0;
    } else {
      sw = sourceImg.width;
      sh = sw / dstRatio;
      sx = 0;
      sy = (sourceImg.height - sh) / 2;
    }
    ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, targetW, targetH);

    // brand text watermark
    if (showText && profile?.brand_name) {
      ctx.save();
      ctx.globalAlpha = textOpacity / 100;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(2, targetW * 0.003);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const text = profile.brand_name;
      const targetWidth = targetW * (textFill / 100);
      let fontSize = 20;
      ctx.font = `800 ${fontSize}px Arial`;
      const w = ctx.measureText(text).width;
      fontSize = Math.max(10, (fontSize * targetWidth) / w);
      ctx.font = `800 ${fontSize}px Arial`;

      ctx.translate(targetW / 2, targetH / 2);
      let angle = 0;
      if (textLayout === "incline-left") angle = 20 * (Math.PI / 180);
      if (textLayout === "incline-right") angle = -20 * (Math.PI / 180);
      ctx.rotate(angle);
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    // logo
    if (showLogo && logoImgRef.current && logoOpacityConfirmed) {
      const rect = getLogoRect(targetW, targetH);
      if (rect) {
        ctx.save();
        ctx.globalAlpha = logoOpacity / 100;
        ctx.drawImage(logoImgRef.current, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      }
    }
  }, [
    sourceImg,
    ratio,
    profile,
    showText,
    showLogo,
    textOpacity,
    textFill,
    textLayout,
    logoOpacity,
    logoOpacityConfirmed,
    getLogoRect,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ---------- Drag-to-reposition logo directly on the preview ----------
  const pointerToFraction = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!showLogo || !logoImgRef.current) return;
    draggingRef.current = true;
    setLogoPos("custom");
    const frac = pointerToFraction(e.clientX, e.clientY);
    if (frac) setCustomLogoPos(frac);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const frac = pointerToFraction(e.clientX, e.clientY);
    if (frac) setCustomLogoPos(frac);
  };

  const onCanvasPointerUp = () => {
    draggingRef.current = false;
  };

  // ---------- Download at full quality ----------
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    // toBlob keeps memory lower than toDataURL for large images and preserves full quality PNG.
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setDownloading(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `${(profile?.brand_name || "watermarked")
          .replace(/\s+/g, "-")
          .toLowerCase()}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setDownloading(false);
      },
      "image/png",
      1.0
    );
  };

  const logout = () => {
    setStage("auth");
    setIdentifier("");
    setProfile(null);
    setSourceImg(null);
    setLogoFile(null);
    setLogoPreviewUrl(null);
  };

  // ---------- AUTH SCREEN ----------
  if (stage === "auth") {
    return (
      <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center px-4">
        <InstallBanner
          show={showInstallBanner}
          onInstall={triggerInstall}
          onDismiss={() => setShowInstallBanner(false)}
        />
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-md bg-[#5EEAD4] flex items-center justify-center font-black text-[#0B0F14]">
                N
              </div>
              <span className="text-white font-bold text-xl tracking-tight">NexaFlow</span>
            </div>
            <p className="text-[#8B96A5] text-sm">Watermark tool &mdash; sign in with email or phone</p>
          </div>
          <div className="bg-[#131922] border border-[#232B36] rounded-xl p-6">
            <label className="text-[#8B96A5] text-xs uppercase tracking-wide">Email or phone</label>
            <input
              className="mt-2 w-full box-border bg-[#0B0F14] border border-[#232B36] rounded-lg px-3 py-2.5 text-white placeholder-[#5A6472] outline-none focus:border-[#5EEAD4]"
              placeholder="you@company.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoComplete="email"
            />
            {authError && <p className="text-red-400 text-xs mt-2">{authError}</p>}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="mt-4 w-full bg-[#5EEAD4] disabled:opacity-50 text-[#0B0F14] font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 hover:opacity-90 transition"
            >
              <LogIn size={16} /> {loading ? "Checking..." : "Continue"}
            </button>
            <p className="text-[#5A6472] text-xs mt-3 text-center">
              No password &mdash; access is limited to approved emails/phone numbers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------- PROFILE SCREEN ----------
  if (stage === "profile") {
    return (
      <div className="min-h-screen bg-[#0B0F14] px-4 py-10 flex justify-center">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <span className="text-white font-bold text-lg">Your brand profile</span>
            <button
              onClick={logout}
              className="text-[#8B96A5] text-xs flex items-center gap-1 hover:text-white shrink-0"
            >
              <LogOut size={12} /> switch account
            </button>
          </div>

          {!isNewProfile && profile && (
            <div className="bg-[#131922] border border-[#232B36] rounded-xl p-4 mb-4 flex items-center gap-3">
              <img
                src={profile.logo_url}
                alt="logo"
                className="w-12 h-12 object-contain bg-white rounded-md p-1 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{profile.brand_name}</p>
                <p className="text-[#5A6472] text-xs truncate">Saved profile found for {identifier}</p>
              </div>
            </div>
          )}

          <div className="bg-[#131922] border border-[#232B36] rounded-xl p-6 space-y-4">
            <div>
              <label className="text-[#8B96A5] text-xs uppercase tracking-wide">Brand name</label>
              <input
                className="mt-2 w-full box-border bg-[#0B0F14] border border-[#232B36] rounded-lg px-3 py-2.5 text-white placeholder-[#5A6472] outline-none focus:border-[#5EEAD4]"
                placeholder="e.g. Nexaflow"
                value={brandNameInput}
                onChange={(e) => setBrandNameInput(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[#8B96A5] text-xs uppercase tracking-wide">Logo (PNG only)</label>
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(e) => handleLogoFile(e.target.files?.[0] || null)}
              />
              <button
                onClick={() => logoFileInputRef.current?.click()}
                className="mt-2 w-full border border-dashed border-[#2E3944] rounded-lg py-4 flex flex-col items-center gap-1 text-[#8B96A5] hover:border-[#5EEAD4] transition"
              >
                <Upload size={18} />
                <span className="text-xs">{logoFile ? "PNG selected" : "Upload PNG logo"}</span>
              </button>
              {logoFileError && <p className="text-red-400 text-xs mt-1">{logoFileError}</p>}
              {(logoPreviewUrl || profile?.logo_url) && (
                <img
                  src={logoPreviewUrl || profile?.logo_url}
                  alt="preview"
                  className="mt-3 w-16 h-16 object-contain bg-white rounded-md p-1"
                />
              )}
            </div>
            {saveMsg && <p className="text-xs text-[#5EEAD4]">{saveMsg}</p>}
            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full bg-[#5EEAD4] disabled:opacity-50 text-[#0B0F14] font-semibold rounded-lg py-2.5 hover:opacity-90 transition"
            >
              {saving ? "Saving..." : "Save profile & continue"}
            </button>
            {!isNewProfile && (
              <button
                onClick={useExistingAndContinue}
                className="w-full text-[#8B96A5] text-xs py-1 hover:text-white"
              >
                Skip &mdash; use saved profile as-is
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- TOOL SCREEN ----------
  return (
    <div className="min-h-screen bg-[#0B0F14] px-4 py-6">
      <InstallBanner
        show={showInstallBanner}
        onInstall={triggerInstall}
        onDismiss={() => setShowInstallBanner(false)}
      />
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-[#5EEAD4] flex items-center justify-center font-black text-[#0B0F14] text-sm shrink-0">
              N
            </div>
            <span className="text-white font-bold shrink-0">NexaFlow</span>
            <span className="text-[#5A6472] text-xs ml-2 truncate">{profile?.brand_name}</span>
          </div>
          <button onClick={logout} className="text-[#8B96A5] text-xs flex items-center gap-1 hover:text-white shrink-0">
            <LogOut size={12} /> logout
          </button>
        </div>

        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          {/* controls */}
          <div className="space-y-5">
            <div className="bg-[#131922] border border-[#232B36] rounded-xl p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files?.[0] || null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-[#2E3944] rounded-lg py-6 flex flex-col items-center gap-1 text-[#8B96A5] hover:border-[#5EEAD4] transition"
              >
                <ImageIcon size={20} />
                <span className="text-xs">
                  {imageLoading ? "Loading..." : sourceImg ? "Change image" : "Upload image"}
                </span>
              </button>
            </div>

            <div className="bg-[#131922] border border-[#232B36] rounded-xl p-4">
              <p className="text-[#8B96A5] text-xs uppercase tracking-wide mb-2">Aspect ratio</p>
              <div className="grid grid-cols-3 gap-2">
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => setRatio(r)}
                    className={`text-xs py-2 rounded-md border ${
                      ratio.label === r.label
                        ? "bg-[#5EEAD4] text-[#0B0F14] border-[#5EEAD4]"
                        : "border-[#232B36] text-[#8B96A5] hover:border-[#5EEAD4]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#131922] border border-[#232B36] rounded-xl p-4 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#8B96A5] text-xs uppercase tracking-wide">Text watermark</span>
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={(e) => setShowText(e.target.checked)}
                  className="accent-[#5EEAD4] w-4 h-4"
                />
              </label>
              {showText && (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-[#8B96A5]">
                      <span>Opacity</span>
                      <span>{textOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={textOpacity}
                      onChange={(e) => setTextOpacity(+e.target.value)}
                      className="w-full accent-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-[#8B96A5]">
                      <span>Fill width</span>
                      <span>{textFill}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="95"
                      value={textFill}
                      onChange={(e) => setTextFill(+e.target.value)}
                      className="w-full accent-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-[#8B96A5] mb-1">Layout</p>
                    <div className="flex flex-col gap-1">
                      {TEXT_LAYOUTS.map((l) => (
                        <button
                          key={l.key}
                          onClick={() => setTextLayout(l.key)}
                          className={`text-xs text-left px-2 py-1.5 rounded-md border ${
                            textLayout === l.key
                              ? "bg-[#5EEAD4] text-[#0B0F14] border-[#5EEAD4]"
                              : "border-[#232B36] text-[#8B96A5] hover:border-[#5EEAD4]"
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-[#131922] border border-[#232B36] rounded-xl p-4 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#8B96A5] text-xs uppercase tracking-wide">Logo</span>
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => setShowLogo(e.target.checked)}
                  className="accent-[#5EEAD4] w-4 h-4"
                />
              </label>
              {showLogo && (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-[#8B96A5]">
                      <span>Size</span>
                      <span>{logoSize}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="45"
                      value={logoSize}
                      onChange={(e) => setLogoSize(+e.target.value)}
                      className="w-full accent-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-[#8B96A5]">
                      <span>Opacity</span>
                      <span>{logoOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={logoOpacity}
                      onChange={(e) => applyLogoOpacity(+e.target.value)}
                      className="w-full accent-[#5EEAD4]"
                    />
                    {!logoOpacityConfirmed && (
                      <div className="mt-2 bg-[#2A1B1B] border border-[#5A3030] rounded-md p-2 flex gap-2">
                        <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-300">
                          Below 60% your logo may become hard to see. Use it anyway?
                          <div className="flex gap-2 mt-1.5">
                            <button
                              onClick={() => {
                                if (pendingLowOpacity !== null) setLogoOpacity(pendingLowOpacity);
                                setLogoOpacityConfirmed(true);
                              }}
                              className="bg-amber-400 text-[#0B0F14] rounded px-2 py-1 text-xs font-semibold"
                            >
                              Use anyway
                            </button>
                            <button
                              onClick={() => setLogoOpacityConfirmed(true)}
                              className="border border-[#5A3030] rounded px-2 py-1 text-xs text-amber-200"
                            >
                              Keep at 60%
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-[#8B96A5] mb-1">Position</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {LOGO_POSITIONS.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => setLogoPos(p.key)}
                          className={`text-xs px-2 py-1.5 rounded-md border ${
                            logoPos === p.key
                              ? "bg-[#5EEAD4] text-[#0B0F14] border-[#5EEAD4]"
                              : "border-[#232B36] text-[#8B96A5] hover:border-[#5EEAD4]"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#5A6472] mt-1.5">
                      Tip: drag the logo directly on the preview to reposition it.
                    </p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={download}
              disabled={!sourceImg || downloading}
              className="w-full bg-[#5EEAD4] disabled:opacity-30 text-[#0B0F14] font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 hover:opacity-90 transition"
            >
              <Download size={16} /> {downloading ? "Preparing..." : "Download PNG (full quality)"}
            </button>
          </div>

          {/* preview */}
          <div
            ref={previewWrapRef}
            className="bg-[#131922] border border-[#232B36] rounded-xl p-4 flex items-center justify-center min-h-[400px]"
          >
            {imageLoading ? (
              <div className="text-center text-[#5A6472]">
                <div className="w-8 h-8 border-2 border-[#5EEAD4] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Processing image...</p>
              </div>
            ) : sourceImg ? (
              <canvas
                ref={canvasRef}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerLeave={onCanvasPointerUp}
                className="max-w-full max-h-[70vh] rounded-lg shadow-2xl touch-none cursor-move"
              />
            ) : (
              <div className="text-center text-[#5A6472]">
                <ImageIcon size={32} className="mx-auto mb-2" />
                <p className="text-sm">Upload an image to see the watermark preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InstallBanner({
  show,
  onInstall,
  onDismiss,
}: {
  show: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm bg-[#131922] border border-[#232B36] rounded-xl p-3 flex items-center gap-3 shadow-2xl">
      <div className="w-9 h-9 rounded-md bg-[#5EEAD4] flex items-center justify-center shrink-0">
        <Smartphone size={18} className="text-[#0B0F14]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold">Install NexaFlow</p>
        <p className="text-[#8B96A5] text-[11px]">Add it to your home screen and use it like an app.</p>
      </div>
      <button
        onClick={onInstall}
        className="bg-[#5EEAD4] text-[#0B0F14] text-xs font-semibold rounded-lg px-3 py-1.5 shrink-0"
      >
        Install
      </button>
      <button onClick={onDismiss} className="text-[#5A6472] shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

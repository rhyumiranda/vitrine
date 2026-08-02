import React from "react";
import {
  AbsoluteFill,
  Img,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Type = the brand's voice. Fraunces is an editorial display serif — the
// "boutique display case" half of *vitrine* (French for shop window). JetBrains
// Mono is the terminal/dev half. The pairing IS the product: a curated window
// onto a developer's real work.
const DISPLAY = loadDisplay("normal", { weights: ["400", "600"], subsets: ["latin"] }).fontFamily;
const MONO = loadMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;

export type BrandConfig = {
  title?: string;
  subtitle?: string;
  emoji?: string | null; // brand mark from the repo (🪟), preferred over a monogram
  logo?: string | null; // filename in public/, optional
  accent?: string;
  background?: string;
  intro_ms?: number; // 0 → no intro
  outro_ms?: number; // 0 → no outro
  outro_cta?: string;
};

export const DEFAULT_BRAND: Required<
  Omit<BrandConfig, "logo" | "emoji" | "title" | "subtitle" | "outro_cta">
> = {
  accent: "#7c5cff",
  background: "#0b0d12",
  intro_ms: 1600,
  outro_ms: 2200,
};

/** The mark: the repo's own emoji (🪟) on a lit "display case" glow, else a logo
 *  image, else a monogram tile as a last resort. */
function Logo({ brand, appear }: { brand: BrandConfig; appear: number }) {
  const { accent, background } = { ...DEFAULT_BRAND, ...brand };

  if (brand.emoji) {
    return (
      <div
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          width: 176,
          height: 176,
          opacity: appear,
        }}
      >
        {/* accent glow — the display case, lit */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 45%, ${accent}44, transparent 62%)`,
            filter: "blur(6px)",
          }}
        />
        <div style={{ fontSize: 132, lineHeight: 1, filter: `drop-shadow(0 10px 26px ${accent}55)` }}>
          {brand.emoji}
        </div>
      </div>
    );
  }

  if (brand.logo) {
    return (
      <Img
        src={/^https?:\/\//.test(brand.logo) ? brand.logo : staticFile(brand.logo)}
        style={{ width: 200, height: 200, objectFit: "contain", opacity: appear }}
      />
    );
  }

  const letter = (brand.title || "•").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: 176,
        height: 176,
        borderRadius: 36,
        background: accent,
        color: background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 96,
        fontWeight: 700,
        fontFamily: DISPLAY,
        boxShadow: `0 24px 60px ${accent}55`,
        opacity: appear,
      }}
    >
      {letter}
    </div>
  );
}

/** Mark + wordmark spring in; the tagline fades up after in mono. */
export const Intro: React.FC<{ brand: BrandConfig }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const cfg = { ...DEFAULT_BRAND, ...brand };

  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const scale = interpolate(pop, [0, 1], [0.72, 1]);
  const appear = interpolate(pop, [0, 1], [0, 1]);
  const subtitle = interpolate(frame, [12, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ background: cfg.background, alignItems: "center", justifyContent: "center", opacity: out }}
    >
      <div style={{ transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <Logo brand={brand} appear={appear} />
        {brand.title && (
          <div
            style={{
              fontFamily: DISPLAY,
              color: "#fff",
              fontSize: 78,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              opacity: appear,
            }}
          >
            {brand.title}
          </div>
        )}
        {brand.subtitle && (
          <div
            style={{
              fontFamily: MONO,
              color: "#ffffffa8",
              fontSize: 24,
              letterSpacing: "0.01em",
              opacity: subtitle,
              transform: `translateY(${(1 - subtitle) * 10}px)`,
            }}
          >
            {brand.subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Wordmark + accent underline wipe + CTA (mono, like a prompt). */
export const Outro: React.FC<{ brand: BrandConfig }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = { ...DEFAULT_BRAND, ...brand };

  const pop = spring({ frame, fps, config: { damping: 16, mass: 0.8 } });
  const appear = interpolate(pop, [0, 1], [0, 1]);
  const rise = interpolate(pop, [0, 1], [16, 0]);
  const wipe = interpolate(frame, [8, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const cta = interpolate(frame, [16, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: cfg.background, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: appear, transform: `translateY(${rise}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {brand.emoji && <div style={{ fontSize: 46, lineHeight: 1 }}>{brand.emoji}</div>}
          {brand.title && (
            <div style={{ fontFamily: DISPLAY, color: "#fff", fontSize: 62, fontWeight: 600, letterSpacing: "-0.02em" }}>
              {brand.title}
            </div>
          )}
        </div>
        <div style={{ width: 280, height: 3, borderRadius: 2, background: "#ffffff1f", overflow: "hidden" }}>
          <div style={{ width: `${wipe * 100}%`, height: "100%", background: cfg.accent }} />
        </div>
        {brand.outro_cta && (
          <div style={{ fontFamily: MONO, color: "#ffffffcc", fontSize: 24, opacity: cta, marginTop: 4 }}>
            {brand.outro_cta}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

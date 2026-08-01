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

export type BrandConfig = {
  title?: string;
  subtitle?: string;
  logo?: string | null; // filename in public/, optional
  accent?: string;
  background?: string;
  intro_ms?: number; // 0 → no intro
  outro_ms?: number; // 0 → no outro
  outro_cta?: string;
};

export const DEFAULT_BRAND: Required<Omit<BrandConfig, "logo" | "title" | "subtitle" | "outro_cta">> = {
  accent: "#7c5cff",
  background: "#0b0d12",
  intro_ms: 1600,
  outro_ms: 2200,
};

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';

function Logo({ brand, appear }: { brand: BrandConfig; appear: number }) {
  const { accent, background } = { ...DEFAULT_BRAND, ...brand };
  if (brand.logo) {
    return (
      <Img
        src={/^https?:\/\//.test(brand.logo) ? brand.logo : staticFile(brand.logo)}
        style={{ width: 220, height: 220, objectFit: "contain", opacity: appear }}
      />
    );
  }
  // No logo asset → a clean monogram tile from the title's first letter.
  const letter = (brand.title || "•").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: 36,
        background: accent,
        color: background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 96,
        fontWeight: 800,
        fontFamily: FONT,
        boxShadow: `0 24px 60px ${accent}55`,
        opacity: appear,
      }}
    >
      {letter}
    </div>
  );
}

/** Logo/title spring in, subtitle fades up after. */
export const Intro: React.FC<{ brand: BrandConfig }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const cfg = { ...DEFAULT_BRAND, ...brand };

  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const scale = interpolate(pop, [0, 1], [0.7, 1]);
  const appear = interpolate(pop, [0, 1], [0, 1]);
  const subtitle = interpolate(frame, [10, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Gentle fade-out at the very end so the cut into the demo is soft.
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: cfg.background,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        opacity: out,
      }}
    >
      <div style={{ transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <Logo brand={brand} appear={appear} />
        {brand.title && (
          <div style={{ color: "#fff", fontSize: 64, fontWeight: 800, letterSpacing: -1, opacity: appear }}>
            {brand.title}
          </div>
        )}
        {brand.subtitle && (
          <div style={{ color: "#ffffffb0", fontSize: 30, opacity: subtitle, transform: `translateY(${(1 - subtitle) * 10}px)` }}>
            {brand.subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Title + CTA settle in, an accent underline wipes across. */
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
    <AbsoluteFill
      style={{
        background: cfg.background,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: appear, transform: `translateY(${rise}px)` }}>
        {brand.title && (
          <div style={{ color: "#fff", fontSize: 58, fontWeight: 800, letterSpacing: -1 }}>{brand.title}</div>
        )}
        <div style={{ width: 260, height: 4, borderRadius: 2, background: "#ffffff22", overflow: "hidden" }}>
          <div style={{ width: `${wipe * 100}%`, height: "100%", background: cfg.accent }} />
        </div>
        {brand.outro_cta && (
          <div style={{ color: "#ffffffcc", fontSize: 28, opacity: cta, marginTop: 6 }}>{brand.outro_cta}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

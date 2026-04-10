"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  GenerationItemResponse,
  GenerationRecord,
  VideoFormat,
  VideoModelId,
} from "@/lib/types";
import { VIDEO_MODEL_CATALOG } from "@/lib/types";

import CraftLogo from "./CraftLogo";
import styles from "./dashboard.module.css";

const POLL_INTERVAL_MS = 5000;
const PROGRESS_DURATION_MS = 5 * 60 * 1000; // 5 min estimated max

// ── Prompt enhancement for Sora ──────────────────────────────────────────────
function enhancePromptForSora(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return trimmed;

  return `${trimmed}. Render as a cinematic video with smooth, fluid motion throughout. Ultra-sharp detail, no pixelation, no visual artifacts, no distortion, no warping. Pristine image clarity with clean edges. Professional cinematography, natural lighting, stable camera. Photorealistic quality.`;
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function sortGenerations(items: GenerationRecord[]) {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function upsertGenerations(current: GenerationRecord[], incoming: GenerationRecord[]) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return sortGenerations([...map.values()]);
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function statusLabel(status: GenerationRecord["status"]) {
  switch (status) {
    case "queued": return "Queued";
    case "in_progress": return "Rendering";
    case "completed": return "Completed";
    case "failed": return "Failed";
    default: return status;
  }
}

function secondsCopy(item: GenerationRecord) {
  if (item.submittedSeconds !== null && item.submittedSeconds !== item.requestedSeconds) {
    return `${item.requestedSeconds}s requested, ${item.submittedSeconds}s rendered`;
  }
  return `${item.requestedSeconds}s clip`;
}

function formatCopy(format: VideoFormat) {
  return format === "portrait" ? "9:16" : "16:9";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(
      (document.documentElement.dataset.theme as "light" | "dark") || "light",
    );
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("craft-theme", next);
    setTheme(next);
  };

  return (
    <button
      className={styles.themeToggle}
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      type="button"
    >
      {theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}

// ── Image → Video demo animation ─────────────────────────────────────────────
function ImageToVideoDemo() {
  return (
    <div className={styles.demoWrap}>
      <div className={styles.demoPair}>

        {/* ── LEFT: Static photo ── */}
        <div className={styles.demoSide}>
          <div className={styles.demoFrame}>
            <svg viewBox="0 0 120 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
              <defs>
                <linearGradient id="pSky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a1a2e" />
                  <stop offset="100%" stopColor="#0f3460" />
                </linearGradient>
              </defs>
              <rect width="120" height="180" fill="url(#pSky)" />
              {/* Static stars */}
              {[[14,12],[34,7],[60,18],[88,6],[108,14],[22,30],[72,26],[100,34],[10,42],[48,38]].map(([x,y],i) => (
                <circle key={i} cx={x} cy={y} r="1" fill="white" opacity="0.5" />
              ))}
              {/* Moon */}
              <circle cx="90" cy="30" r="12" fill="#fef3c7" opacity="0.85" />
              <circle cx="95" cy="27" r="9" fill="#1a1a2e" />
              {/* Ground */}
              <rect x="0" y="158" width="120" height="22" fill="#090912" />
              {/* Figure body */}
              <rect x="52" y="120" width="14" height="40" rx="3" fill="#0a0a14" />
              {/* Head */}
              <ellipse cx="59" cy="113" rx="9" ry="10" fill="#0a0a14" />
              {/* Arms */}
              <rect x="38" y="124" width="10" height="24" rx="3" fill="#0a0a14" />
              <rect x="70" y="124" width="10" height="24" rx="3" fill="#0a0a14" />
              {/* Shadow */}
              <ellipse cx="59" cy="168" rx="22" ry="4" fill="#000" opacity="0.4" />
            </svg>
            {/* Corner brackets */}
            <div className={styles.cornerTL} /><div className={styles.cornerTR} />
            <div className={styles.cornerBL} /><div className={styles.cornerBR} />
          </div>
          <span className={styles.demoLabel}>Photo</span>
        </div>

        {/* ── Arrow ── */}
        <div className={styles.demoArrow}>
          <svg width="44" height="16" viewBox="0 0 44 16" fill="none">
            <path d="M0 8H39" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            <path d="M33 2L41 8L33 14" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* ── RIGHT: Animated video ── */}
        <div className={styles.demoSide}>
          <div className={`${styles.demoFrame} ${styles.demoFrameVideo}`}>
            <svg viewBox="0 0 120 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
              <defs>
                <linearGradient id="vSky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a1a2e" />
                  <stop offset="100%" stopColor="#0f3460" />
                </linearGradient>
                <linearGradient id="vGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e53935" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#e53935" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect width="120" height="180" fill="url(#vSky)" />

              {/* Twinkling stars */}
              {[[14,12],[34,7],[60,18],[88,6],[108,14],[22,30],[72,26],[100,34],[10,42],[48,38]].map(([x,y],i) => (
                <circle key={i} cx={x} cy={y} r="1" fill="white"
                  style={{ animation: `starTwinkle ${1.2 + (i * 0.3)}s ease-in-out ${i * 0.15}s infinite alternate` }} />
              ))}

              {/* Drifting moon */}
              <g style={{ animation: "moonDrift 3s ease-in-out infinite alternate" }}>
                <circle cx="90" cy="30" r="12" fill="#fef3c7" opacity="0.9" />
                <circle cx="95" cy="27" r="9" fill="#1a1a2e" />
              </g>

              {/* Sweeping motion lines */}
              <g style={{ animation: "motionLines 2s linear infinite" }}>
                <line x1="-40" y1="80" x2="60" y2="80" stroke="white" strokeWidth="0.8" opacity="0.18" />
                <line x1="-40" y1="90" x2="50" y2="90" stroke="white" strokeWidth="0.6" opacity="0.12" />
                <line x1="-40" y1="100" x2="70" y2="100" stroke="white" strokeWidth="0.8" opacity="0.15" />
              </g>

              {/* Ground */}
              <rect x="0" y="158" width="120" height="22" fill="#090912" />

              {/* Swaying figure */}
              <g style={{ animation: "figureSway 2.5s ease-in-out infinite alternate", transformOrigin: "59px 158px" }}>
                <rect x="52" y="120" width="14" height="40" rx="3" fill="#0a0a14" />
                <ellipse cx="59" cy="113" rx="9" ry="10" fill="#0a0a14" />
                <rect x="38" y="124" width="10" height="24" rx="3" fill="#0a0a14" />
                <rect x="70" y="124" width="10" height="24" rx="3" fill="#0a0a14" />
              </g>

              {/* Pulsing ground glow */}
              <ellipse cx="59" cy="164" rx="30" ry="6" fill="url(#vGlow)"
                style={{ animation: "glowPulse 2s ease-in-out infinite alternate" }} />
              <ellipse cx="59" cy="168" rx="22" ry="4" fill="#000" opacity="0.4" />
            </svg>

            {/* Play button */}
            <div className={styles.demoPlayBtn}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)" />
                <path d="M13 10.5L13 21.5L23 16L13 10.5Z" fill="white" />
              </svg>
            </div>

            {/* Animated progress bar */}
            <div className={styles.demoProgressBar}>
              <div className={styles.demoProgressFill} />
            </div>
          </div>
          <span className={`${styles.demoLabel} ${styles.demoLabelAccent}`}>Video</span>
        </div>

      </div>
    </div>
  );
}

// ── Home page ─────────────────────────────────────────────────────────────────
function HomePage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className={styles.homePage}>
      <div className={styles.heroSection}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Turn images into<br />
            <span className={styles.heroAccent}>cinematic video</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Upload any photo and Craft animates it into a smooth, high-quality video clip in seconds.
          </p>
          <button className={styles.heroCta} onClick={onGetStarted}>
            Start creating
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.heroGlow} />
          <ImageToVideoDemo />
        </div>
      </div>

      <div className={styles.featureGrid}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>One image</h3>
          <p className={styles.featureDesc}>Upload a single photo — portrait or landscape — and let Sora handle the motion.</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>Up to 5 seconds</h3>
          <p className={styles.featureDesc}>Choose your clip length from 1 to 5 seconds. Sora renders fluid, natural motion throughout.</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>Smart prompts</h3>
          <p className={styles.featureDesc}>Your prompt is automatically optimized for Sora — resulting in sharper, cleaner video with no distortion.</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>Download MP4</h3>
          <p className={styles.featureDesc}>Every completed video is saved to your library and ready to download as a full-quality MP4.</p>
        </div>
      </div>

    </div>
  );
}

// ── Circular progress indicator ──────────────────────────────────────────────
function CircularProgress({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className={styles.circleWrap}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className={styles.circleLabel}>{pct}%</span>
    </div>
  );
}

// ── Animated % tracker (time-based, 0→95 over 5 min) ─────────────────────────
function useTimedProgress(createdAt: string, active: boolean) {
  const [pct, setPct] = useState(() => {
    if (!active) return 0;
    const elapsed = Date.now() - new Date(createdAt).getTime();
    return Math.min(Math.floor((elapsed / PROGRESS_DURATION_MS) * 95), 95);
  });

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const elapsed = Date.now() - new Date(createdAt).getTime();
      setPct(Math.min(Math.floor((elapsed / PROGRESS_DURATION_MS) * 95), 95));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, createdAt]);

  return active ? pct : 100;
}

// ── Single library card ───────────────────────────────────────────────────────
function GenerationCard({
  item,
  cancellingId,
  deletingId,
  onCancel,
  onDelete,
}: {
  item: GenerationRecord;
  cancellingId: string | null;
  deletingId: string | null;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isPending = item.status === "queued" || item.status === "in_progress";
  const pct = useTimedProgress(item.createdAt, isPending);
  const [expandedPrompt, setExpandedPrompt] = useState(false);

  return (
    <article key={item.id} data-testid={`generation-card-${item.id}`} className={styles.card}>
      <div
        className={styles.cardMedia}
        style={{ aspectRatio: item.format === "portrait" ? "9/16" : "16/9" }}
      >
        {item.videoUrl ? (
          <video
            className={styles.videoFrame}
            controls
            preload="metadata"
            poster={item.thumbnailUrl ?? item.sourceImageUrl}
            title={`Generated video for ${item.prompt}`}
            src={item.videoUrl}
          />
        ) : (
          <img
            className={styles.referenceFrame}
            src={item.sourceImageUrl}
            alt={`Source reference for ${item.prompt}`}
          />
        )}

        {isPending && (
          <div className={styles.progressOverlay}>
            <CircularProgress pct={pct} />
            <button
              className={styles.stopBtn}
              onClick={() => onCancel(item.id)}
              disabled={cancellingId === item.id}
              aria-label="Stop generation"
              type="button"
            >
              {cancellingId === item.id ? "Stopping…" : "Stop"}
            </button>
          </div>
        )}

        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(item.id)}
          disabled={deletingId === item.id}
          aria-label="Delete generation"
          type="button"
        >
          {deletingId === item.id ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" strokeDasharray="28" strokeDashoffset="10" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
          )}
        </button>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTopRow}>
          <span className={`${styles.statusPill} ${styles[`status_${item.status}`]}`}>
            {statusLabel(item.status)}
          </span>
          <div className={styles.cardTopRight}>
            {item.model && (
              <span className={styles.modelBadge}>{item.model === "kling-3.0" ? "Kling 3.0" : "Kling 2.6"}</span>
            )}
            <span className={styles.cardMeta}>{formatTimestamp(item.createdAt)}</span>
          </div>
        </div>

        {item.userPrompt && item.userPrompt !== item.prompt ? (
          <div className={styles.promptBlock}>
            <p className={styles.promptLabel}>Your prompt</p>
            <p className={expandedPrompt ? styles.promptTextFull : styles.promptText}>
              {item.userPrompt}
            </p>
            <p className={styles.promptLabel}>Enhanced for Kling</p>
            <p className={expandedPrompt ? styles.promptTextFull : styles.promptText}>
              {item.prompt}
            </p>
            <button className={styles.seeMoreBtn} type="button" onClick={() => setExpandedPrompt(v => !v)}>
              {expandedPrompt ? "See less" : "See more"}
            </button>
          </div>
        ) : (
          <div className={styles.promptBlock}>
            <p className={expandedPrompt ? styles.promptTextFull : styles.cardPrompt}>
              {item.userPrompt ?? item.prompt}
            </p>
            <button className={styles.seeMoreBtn} type="button" onClick={() => setExpandedPrompt(v => !v)}>
              {expandedPrompt ? "See less" : "See more"}
            </button>
          </div>
        )}

        <div className={styles.cardSpec}>
          <span>{formatCopy(item.format)}</span>
          <span>{secondsCopy(item)}</span>
        </div>

        <div className={styles.referenceStrip}>
          <span className={styles.referenceLabel}>Ref</span>
          <img
            className={styles.referenceThumb}
            src={item.sourceImageUrl}
            alt={`Reference image paired with ${item.userPrompt ?? item.prompt}`}
          />
        </div>

        {item.errorMessage && (
          <p className={styles.errorCopy}>{item.errorMessage}</p>
        )}

        {item.videoUrl && (
          <a className={styles.downloadLink} href={item.videoUrl} download>
            Download MP4
          </a>
        )}
      </div>
    </article>
  );
}

// ── Library view with filter sidebar ─────────────────────────────────────────
type StatusFilter = "all" | "completed" | "in_progress" | "queued" | "failed";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  completed: "Completed",
  in_progress: "Rendering",
  queued: "Queued",
  failed: "Failed / Cancelled",
};

function LibraryView({
  generations,
  pendingGenerationIds,
  cancellingId,
  deletingId,
  onCancel,
  onDelete,
  onCreateFirst,
}: {
  generations: GenerationRecord[];
  pendingGenerationIds: string[];
  cancellingId: string | null;
  deletingId: string | null;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateFirst: () => void;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: generations.length, completed: 0, in_progress: 0, queued: 0, failed: 0 };
    for (const g of generations) {
      if (g.status in c) c[g.status as StatusFilter]++;
    }
    return c;
  }, [generations]);

  const visible = useMemo(
    () => filter === "all" ? generations : generations.filter(g => g.status === filter),
    [generations, filter],
  );

  return (
    <div className={styles.libraryLayout}>
      {/* ── Sidebar ── */}
      <aside className={styles.filterSidebar}>
        <p className={styles.filterHeading}>Filter</p>
        {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((f) => (
          counts[f] > 0 || f === "all" ? (
            <button
              key={f}
              type="button"
              className={filter === f ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => setFilter(f)}
            >
              <span>{FILTER_LABELS[f]}</span>
              <span className={styles.filterCount}>{counts[f]}</span>
            </button>
          ) : null
        ))}
        {pendingGenerationIds.length > 0 && (
          <div className={styles.renderingBadge}>
            <span className={styles.renderingDot} />
            {pendingGenerationIds.length} rendering
          </div>
        )}
      </aside>

      {/* ── Grid ── */}
      <div className={styles.libraryMain}>
        <div className={styles.libraryHeader}>
          <h1 className={styles.pageTitle}>Library</h1>
          <p className={styles.pageSubtitle}>{visible.length} {visible.length === 1 ? "video" : "videos"}</p>
        </div>

        {visible.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <p>{filter === "all" ? "No videos yet." : `No ${FILTER_LABELS[filter].toLowerCase()} videos.`}</p>
            {filter === "all" && (
              <button className={styles.emptyStateCta} onClick={onCreateFirst} type="button">
                Create your first video
              </button>
            )}
          </div>
        ) : (
          <div className={styles.videoGrid}>
            {visible.map((item) => (
              <GenerationCard
                key={item.id}
                item={item}
                cancellingId={cancellingId}
                deletingId={deletingId}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
type Tab = "home" | "create" | "library";

export default function Dashboard({
  initialGenerations,
}: {
  initialGenerations: GenerationRecord[];
}) {
  const [tab, setTab] = useState<Tab>(() =>
    initialGenerations.length > 0 ? "library" : "create",
  );
  const [generations, setGenerations] = useState(() => sortGenerations(initialGenerations));
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<VideoModelId>("kling-2.6");
  const [format, setFormat] = useState<VideoFormat>("portrait");
  const [seconds, setSeconds] = useState(5);
  const selectedModelInfo = VIDEO_MODEL_CATALOG.find(m => m.id === model)!;
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cleanedDataUrl, setCleanedDataUrl] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingGenerationIds = useMemo(
    () => generations.filter((item) => item.status === "queued" || item.status === "in_progress").map((item) => item.id),
    [generations],
  );

  // Stable string key — only changes when the set of pending IDs actually changes,
  // not on every state update. Prevents the effect from re-running (and firing an
  // immediate extra poll) whenever progress or other fields update.
  const pendingIdsKey = pendingGenerationIds.join(",");

  useEffect(() => {
    if (!selectedImage) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(selectedImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedImage]);

  function handleImageChange(file: File | null) {
    setSelectedImage(file);
    setCleanedDataUrl(null);
    setCleanupMessage(null);
    setEditPrompt("");
  }

  async function handleCleanup() {
    if (!selectedImage || !editPrompt.trim()) return;
    setIsCleaningUp(true);
    setCleanupMessage(null);
    try {
      const fd = new FormData();
      fd.set("image", selectedImage);
      fd.set("prompt", editPrompt.trim());
      const res = await fetch("/api/cleanup-image", { method: "POST", body: fd });
      const payload = await res.json() as { imageBase64?: string; error?: string };
      if (!res.ok || payload.error) {
        setCleanupMessage(payload.error ?? "Cleanup failed.");
        return;
      }
      setCleanedDataUrl(`data:image/png;base64,${payload.imageBase64}`);
    } catch {
      setCleanupMessage("Cleanup failed — please try again.");
    } finally {
      setIsCleaningUp(false);
    }
  }

  useEffect(() => {
    if (!pendingIdsKey) return;
    const ids = pendingIdsKey.split(",");

    const refresh = async () => {
      const refreshed = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/generations/${id}`, { cache: "no-store" });
          if (!res.ok) return null;
          const payload = (await res.json()) as GenerationItemResponse;
          return payload.item;
        }),
      );
      setGenerations((current) =>
        upsertGenerations(current, refreshed.filter((item): item is GenerationRecord => item !== null)),
      );
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIdsKey]);

  const hasActiveGeneration = isSubmitting || pendingGenerationIds.length > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedImage) { setFormMessage("Select an image first."); return; }

    setIsSubmitting(true);
    setFormMessage(null);

    try {
      const enhancedPrompt = enhancePromptForSora(prompt);

      // Use the cleaned image if the user ran cleanup, otherwise use original
      let imageToSubmit: File = selectedImage;
      if (cleanedDataUrl) {
        const blob = await fetch(cleanedDataUrl).then((r) => r.blob());
        imageToSubmit = new File([blob], "cleaned-image.png", { type: "image/png" });
      }

      const formData = new FormData();
      formData.set("image", imageToSubmit);
      formData.set("prompt", enhancedPrompt);
      formData.set("userPrompt", prompt.trim());
      formData.set("model", model);
      formData.set("format", format);
      formData.set("seconds", String(seconds));

      const response = await fetch("/api/generations", { method: "POST", body: formData });
      const payload = (await response.json()) as GenerationItemResponse | { error?: string };

      if (!("item" in payload)) {
        setFormMessage(payload.error ?? "Generation failed.");
        return;
      }
      if (!response.ok) {
        setFormMessage(payload.item.errorMessage ?? "Generation failed.");
        return;
      }

      setGenerations((current) => upsertGenerations(current, [payload.item]));

      if (payload.item.status === "failed") {
        setFormMessage(payload.item.errorMessage ?? "Generation failed.");
        return;
      }

      setFormMessage(null);
      setSelectedImage(null);
      setCleanedDataUrl(null);
      setCleanupMessage(null);
      setEditPrompt("");
      setPrompt("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTab("library");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setGenerations((current) => current.filter((item) => item.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, { method: "PATCH" });
      if (res.ok) {
        const payload = await res.json() as { item: GenerationRecord };
        setGenerations((current) => upsertGenerations(current, [payload.item]));
      }
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <button className={styles.logoBtn} onClick={() => setTab("home")} type="button">
          <CraftLogo size={26} />
        </button>

        <nav className={styles.nav}>
          <button
            className={tab === "home" ? styles.navItemActive : styles.navItem}
            onClick={() => setTab("home")}
            type="button"
          >
            Home
          </button>
          <button
            className={tab === "create" ? styles.navItemActive : styles.navItem}
            onClick={() => setTab("create")}
            type="button"
          >
            Create
          </button>
          <button
            className={tab === "library" ? styles.navItemActive : styles.navItem}
            onClick={() => setTab("library")}
            type="button"
          >
            Library
            {generations.length > 0 && (
              <span className={styles.navBadge}>{generations.length}</span>
            )}
          </button>
        </nav>

        <ThemeToggle />
      </header>

      {/* ── Content ── */}
      <main className={styles.main}>
        {tab === "home" && (
          <HomePage onGetStarted={() => setTab("create")} />
        )}

        {tab === "create" && (
          <div className={styles.createPage}>
            <div className={styles.createHeader}>
              <h1 className={styles.pageTitle}>Create</h1>
              <p className={styles.pageSubtitle}>Upload an image and describe the motion.</p>
            </div>

            <form className={styles.formCard} onSubmit={handleSubmit}>
              <div className={styles.uploadArea}>
                <label className={styles.fieldLabel} htmlFor="reference-image">
                  Reference image
                </label>
                <div className={previewUrl ? styles.dropZoneHasImage : styles.dropZone}>
                  {previewUrl ? (
                    <img
                      src={cleanedDataUrl ?? previewUrl}
                      alt="Selected reference"
                      className={styles.previewImage}
                    />
                  ) : (
                    <div className={styles.dropZonePlaceholder}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>Drop an image or click to upload</span>
                      <span className={styles.uploadHint}>JPEG, PNG, WebP · up to 15 MB</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    id="reference-image"
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.fileInput}
                    onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                  />
                </div>

                {previewUrl && (
                  <div className={styles.imageActions}>
                    <button
                      type="button"
                      className={styles.clearImage}
                      onClick={() => {
                        handleImageChange(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      Change image
                    </button>

                    {cleanedDataUrl && (
                      <div className={styles.cleanupDone}>
                        <span className={styles.cleanupBadge}>Edited</span>
                        <button
                          type="button"
                          className={styles.revertBtn}
                          onClick={() => { setCleanedDataUrl(null); setCleanupMessage(null); }}
                        >
                          Revert to original
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {previewUrl && (
                  <div className={styles.editImageRow}>
                    <input
                      type="text"
                      className={styles.editPromptInput}
                      placeholder="e.g. make it more vibrant, brighten the background…"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCleanup(); } }}
                      disabled={isCleaningUp}
                    />
                    <button
                      type="button"
                      className={styles.cleanupBtn}
                      onClick={handleCleanup}
                      disabled={isCleaningUp || !editPrompt.trim()}
                    >
                      {isCleaningUp ? (
                        <>
                          <svg className={styles.spinIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Editing…
                        </>
                      ) : "Edit image"}
                    </button>
                  </div>
                )}
                {cleanupMessage && (
                  <p className={styles.cleanupError}>{cleanupMessage}</p>
                )}
              </div>

              <div className={styles.formFields}>
                <div>
                  <label className={styles.fieldLabel} htmlFor="prompt">
                    Motion prompt
                  </label>
                  <textarea
                    id="prompt"
                    name="prompt"
                    value={prompt}
                    className={styles.textarea}
                    rows={5}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the motion, camera movement, and mood — e.g. slow pan with soft lighting..."
                  />
                  <p className={styles.promptHint}>
                    Your prompt will be automatically enhanced for the best Kling output — cleaner motion, no distortion.
                  </p>
                </div>

                {/* Model selector */}
                <div className={styles.modelSelector}>
                  <span className={styles.fieldLabel}>Model</span>
                  <div className={styles.modelCards}>
                    {VIDEO_MODEL_CATALOG.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={model === m.id ? styles.modelCardActive : styles.modelCard}
                        onClick={() => {
                          setModel(m.id);
                          // Reset seconds if current duration not available in new model
                          if (!m.durations.includes(seconds)) setSeconds(m.durations[0]);
                        }}
                      >
                        <span className={styles.modelCardName}>{m.name}</span>
                        <span className={styles.modelCardDesc}>{m.description}</span>
                        <span className={styles.modelCardPrice}>${(m.pricePerSec * 5).toFixed(2)}/5s · ${(m.pricePerSec * 10).toFixed(2)}/10s</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.controlsRow}>
                  <div className={styles.controlGroup}>
                    <span className={styles.fieldLabel}>Format</span>
                    <div className={styles.segmentedControl}>
                      {(["portrait", "landscape"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={option === format ? styles.segmentActive : styles.segment}
                          onClick={() => setFormat(option)}
                        >
                          {option === "portrait" ? "Portrait 9:16" : "Landscape 16:9"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.controlGroup}>
                    <span className={styles.fieldLabel}>Duration</span>
                    <div className={styles.segmentedControl}>
                      {selectedModelInfo.durations.map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={value === seconds ? styles.segmentActive : styles.segment}
                          onClick={() => setSeconds(value)}
                        >
                          {value}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.formFooter}>
                  <div>
                    {formMessage ? (
                      <p className={styles.formMessage} role="status">{formMessage}</p>
                    ) : (
                      <span className={styles.statusTag}>
                        {hasActiveGeneration ? "Rendering in progress…" : "Ready"}
                      </span>
                    )}
                  </div>
                  <button
                    data-testid="generate-button"
                    type="submit"
                    className={styles.generateButton}
                    disabled={hasActiveGeneration}
                  >
                    {isSubmitting ? "Starting…" : hasActiveGeneration ? "Rendering…" : "Generate video"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {tab === "library" && (
          <LibraryView
            generations={generations}
            pendingGenerationIds={pendingGenerationIds}
            cancellingId={cancellingId}
            deletingId={deletingId}
            onCancel={handleCancel}
            onDelete={handleDelete}
            onCreateFirst={() => setTab("create")}
          />
        )}
      </main>
    </div>
  );
}

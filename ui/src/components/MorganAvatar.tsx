import { useEffect, useMemo, useRef } from "react";

/**
 * MorganAvatar — a voice-reactive generated Morgan mark.
 *
 * The center mark is generated on canvas; on top of it we draw a waveform
 * ring + halo whose intensity follows live audio RMS and FFT bins.
 *
 * Two analyser inputs are supported and composited:
 *   - `inputAnalyser`  — the local mic (tints warm when user is speaking)
 *   - `outputAnalyser` — TTS playback from the bridge (tints cool when
 *     Morgan is speaking)
 *
 * Both are optional. If neither is set the avatar stays at a gentle
 * idle-breathing baseline so the view never feels frozen.
 */

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

interface MorganAvatarProps {
  /** Optional portrait override. Omit for the default generated Morgan mark. */
  src?: string | null;
  /** Live analyser from the user's mic. */
  inputAnalyser?: AnalyserNode | null;
  /** Live analyser from the bridge's TTS playback. */
  outputAnalyser?: AnalyserNode | null;
  /** Drives colour + ring style even when no audio is flowing. */
  state?: AvatarState;
  /** Square edge length in CSS px. Canvas scales to devicePixelRatio. */
  size?: number;
}

const HUE_LISTEN = 18; // warm amber
const HUE_SPEAK = 202; // cool azure
const HUE_IDLE = 210;

export function MorganAvatar({
  src,
  inputAnalyser = null,
  outputAnalyser = null,
  state = "idle",
  size = 320,
}: MorganAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<AvatarState>(state);
  stateRef.current = state;

  // Keep analyser refs in sync without re-running the RAF effect; otherwise
  // the animation loop tears down on every parent render.
  const inRef = useRef<AnalyserNode | null>(inputAnalyser);
  const outRef = useRef<AnalyserNode | null>(outputAnalyser);
  inRef.current = inputAnalyser;
  outRef.current = outputAnalyser;

  const inBuf = useMemo<Uint8Array<ArrayBuffer>>(() => new Uint8Array(new ArrayBuffer(128)), []);
  const outBuf = useMemo<Uint8Array<ArrayBuffer>>(() => new Uint8Array(new ArrayBuffer(128)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    imgRef.current = null;
    if (src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        imgRef.current = img;
      };
    }

    let breathing = 0;
    let lastInLevel = 0;
    let lastOutLevel = 0;

    const readLevel = (node: AnalyserNode | null, buf: Uint8Array<ArrayBuffer>): number => {
      if (!node) return 0;
      try {
        node.getByteFrequencyData(buf);
      } catch {
        return 0;
      }
      let sum = 0;
      // Emphasise low-mid band (speech fundamentals) — bins 2..48 @ 2048 FFT
      const start = 2;
      const end = Math.min(48, buf.length);
      for (let i = start; i < end; i++) sum += buf[i];
      const avg = sum / (end - start);
      return Math.min(1, avg / 180);
    };

    const renderFrame = () => {
      breathing += 0.016;

      const inLevel = readLevel(inRef.current, inBuf);
      const outLevel = readLevel(outRef.current, outBuf);
      // ease
      lastInLevel = lastInLevel * 0.6 + inLevel * 0.4;
      lastOutLevel = lastOutLevel * 0.6 + outLevel * 0.4;

      const drivingLevel = Math.max(lastInLevel, lastOutLevel);
      const currentState = stateRef.current;

      const hue =
        lastOutLevel > lastInLevel
          ? HUE_SPEAK
          : lastInLevel > 0.05
          ? HUE_LISTEN
          : currentState === "thinking"
          ? 280
          : HUE_IDLE;

      const cx = size / 2;
      const cy = size / 2;
      const baseR = size * 0.38;
      const breathe = 1 + Math.sin(breathing * 1.1) * 0.012;
      const scale = breathe + drivingLevel * 0.06;

      ctx.clearRect(0, 0, size, size);

      // Outer halo — pulses with driving level
      const haloR = baseR * (1.28 + drivingLevel * 0.18);
      const grad = ctx.createRadialGradient(cx, cy, baseR * 0.9, cx, cy, haloR);
      grad.addColorStop(0, `hsla(${hue}, 85%, 60%, ${0.28 + drivingLevel * 0.4})`);
      grad.addColorStop(1, `hsla(${hue}, 85%, 60%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Waveform ring — 96 radial bars modulated by FFT bins
      const bars = 96;
      const ringR = baseR * 1.08;
      const driverBuf = lastOutLevel > lastInLevel ? outBuf : inBuf;
      const driverActive = driverBuf.some((v) => v > 0);
      ctx.lineCap = "round";
      for (let i = 0; i < bars; i++) {
        const theta = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const bin = Math.floor((i / bars) * 48) + 2;
        const raw = driverActive ? driverBuf[bin] / 255 : 0;
        const len = 4 + raw * size * 0.11 + drivingLevel * 6;
        const x1 = cx + Math.cos(theta) * ringR;
        const y1 = cy + Math.sin(theta) * ringR;
        const x2 = cx + Math.cos(theta) * (ringR + len);
        const y2 = cy + Math.sin(theta) * (ringR + len);
        ctx.strokeStyle = `hsla(${hue}, 90%, ${55 + raw * 25}%, ${0.35 + raw * 0.55})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Inner rim
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.55)`;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.02, 0, Math.PI * 2);
      ctx.stroke();

      // Portrait — circular clip, scaled by breathing + audio
      if (imgRef.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.clip();
        const im = imgRef.current;
        const drawR = baseR * scale;
        // cover-fit preserving aspect
        const iw = im.naturalWidth || drawR * 2;
        const ih = im.naturalHeight || drawR * 2;
        const aspect = iw / ih;
        let dw = drawR * 2;
        let dh = drawR * 2;
        if (aspect > 1) {
          dw = dh * aspect;
        } else {
          dh = dw / aspect;
        }
        ctx.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.restore();
      } else {
        const coreGrad = ctx.createRadialGradient(
          cx - baseR * 0.28,
          cy - baseR * 0.32,
          baseR * 0.1,
          cx,
          cy,
          baseR,
        );
        coreGrad.addColorStop(0, `hsla(${hue}, 88%, 68%, 1)`);
        coreGrad.addColorStop(0.55, `hsla(${hue + 34}, 70%, 34%, 1)`);
        coreGrad.addColorStop(1, `hsla(${hue + 70}, 70%, 12%, 1)`);
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `hsla(${hue}, 95%, 78%, 0.55)`;
        ctx.lineWidth = Math.max(1, size * 0.01);
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * 0.72 * scale, 0.15, Math.PI * 1.85);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = `700 ${Math.round(baseR * 0.82)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("M", cx, cy + baseR * 0.03);
      }

      // State label ring (top arc)
      if (currentState !== "idle") {
        ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 0.9)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const arcStart = -Math.PI / 2 - 0.5;
        const arcEnd = arcStart + 1 + drivingLevel * 2;
        ctx.arc(cx, cy, baseR * 1.16, arcStart, arcEnd);
        ctx.stroke();
      }

      rafRef.current = window.requestAnimationFrame(renderFrame);
    };

    rafRef.current = window.requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [src, size, inBuf, outBuf]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        display: "block",
      }}
      aria-label="Morgan voice avatar"
    />
  );
}

"use client";

import localFont from "next/font/local";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Eraser, Keyboard, PenLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

const handwriting = localFont({
  src: "../../../assets/fonts/Caveat-Regular.ttf",
  display: "swap",
});

/** What the pad hands over: a PNG (transparent background) and how it was made. */
export interface SignatureValue {
  image: string;
  inputKind: "DRAWN" | "TYPED";
}

export interface SignaturePadProps {
  /** Name prefilled in the typed alternative (the signer's full name). */
  defaultName: string;
  /** Label of the « Valider » button. */
  validateLabel?: string;
  onValidate: (value: SignatureValue) => void;
  /** Disables the controls while the parent is busy. */
  busy?: boolean;
  className?: string;
}

/** Export size: bounded (≤ 1200 × 400), transparent PNG. */
const EXPORT_WIDTH = 900;
const EXPORT_HEIGHT = 300;
/** A trace shorter than this (CSS pixels of path) is refused before sending. */
const MIN_PATH = 80;

/**
 * Signature pad (step 8). Draw with a finger, a stylus or a mouse; « Effacer »
 * clears, « Valider » hands a PNG over. For the keyboard and screen readers,
 * « Saisir mon nom » types the full name instead, rendered in a handwriting
 * font. An empty or too short trace is refused here, and again by the server.
 */
export function SignaturePad({
  defaultName,
  validateLabel = "Valider ma signature",
  onValidate,
  busy = false,
  className,
}: SignaturePadProps) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const length = useRef(0);
  const [hasInk, setHasInk] = useState(false);
  const hintId = useId();
  const nameId = useId();

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#111318";
    length.current = 0;
    setHasInk(false);
  }, []);

  useEffect(() => {
    if (mode !== "draw") return;
    setupCanvas();
    const onResize = () => {
      setupCanvas();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [mode, setupCanvas]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    setError(null);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = event.currentTarget.getContext("2d");
    const next = point(event);
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    length.current += Math.hypot(next.x - last.current.x, next.y - last.current.y);
    last.current = next;
    if (!hasInk) setHasInk(true);
  };

  const stop = () => {
    drawing.current = false;
    last.current = null;
  };

  /** Copies the visible canvas onto a bounded export canvas (proportions kept). */
  function exportDrawn(): string | null {
    const source = canvasRef.current;
    if (!source) return null;
    const out = document.createElement("canvas");
    out.width = EXPORT_WIDTH;
    out.height = EXPORT_HEIGHT;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    const scale = Math.min(EXPORT_WIDTH / source.width, EXPORT_HEIGHT / source.height);
    const w = source.width * scale;
    const h = source.height * scale;
    ctx.drawImage(source, (EXPORT_WIDTH - w) / 2, (EXPORT_HEIGHT - h) / 2, w, h);
    return out.toDataURL("image/png");
  }

  async function exportTyped(): Promise<string | null> {
    const text = name.trim();
    const out = document.createElement("canvas");
    out.width = EXPORT_WIDTH;
    out.height = EXPORT_HEIGHT;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    const family = handwriting.style.fontFamily;
    try {
      await document.fonts.load(`96px ${family}`);
    } catch {
      // The fallback font still renders the name.
    }
    let size = 120;
    ctx.font = `${String(size)}px ${family}`;
    while (size > 24 && ctx.measureText(text).width > EXPORT_WIDTH - 40) {
      size -= 4;
      ctx.font = `${String(size)}px ${family}`;
    }
    ctx.fillStyle = "#111318";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, EXPORT_WIDTH / 2, EXPORT_HEIGHT / 2);
    return out.toDataURL("image/png");
  }

  async function validate() {
    setError(null);
    if (mode === "draw") {
      if (!hasInk) {
        setError("La signature est vide : trace-la dans le cadre, ou saisis ton nom.");
        return;
      }
      if (length.current < MIN_PATH) {
        setError("La signature est trop courte : trace-la en entier, ou saisis ton nom.");
        return;
      }
      const image = exportDrawn();
      if (image) onValidate({ image, inputKind: "DRAWN" });
      return;
    }
    if (name.trim().length < 3) {
      setError("Saisis ton nom complet.");
      return;
    }
    const image = await exportTyped();
    if (image) onValidate({ image, inputKind: "TYPED" });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="group" aria-label="Façon de signer" className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "draw" ? "primary" : "outline"}
          aria-pressed={mode === "draw"}
          leftIcon={<PenLine className="size-4" aria-hidden="true" />}
          onClick={() => {
            setMode("draw");
            setError(null);
          }}
        >
          Tracer
        </Button>
        <Button
          type="button"
          variant={mode === "type" ? "primary" : "outline"}
          aria-pressed={mode === "type"}
          leftIcon={<Keyboard className="size-4" aria-hidden="true" />}
          onClick={() => {
            setMode("type");
            setError(null);
          }}
        >
          Saisir mon nom
        </Button>
      </div>

      {mode === "draw" ? (
        <div className="flex flex-col gap-2">
          <p id={hintId} className="text-small text-ink-2">
            Trace ta signature dans le cadre, au doigt, au stylet ou à la souris.
          </p>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Cadre de signature. Au clavier ou avec un lecteur d'écran, choisis « Saisir mon nom »."
            aria-describedby={hintId}
            data-testid="signature-canvas"
            className="h-44 w-full touch-none rounded-inner border border-line bg-surface"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={stop}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              leftIcon={<Eraser className="size-4" aria-hidden="true" />}
              onClick={setupCanvas}
              disabled={busy}
            >
              Effacer
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Ton nom complet" htmlFor={nameId} hint="Il sert de signature.">
            <Input
              id={nameId}
              value={name}
              autoComplete="name"
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <p
            aria-hidden="true"
            className={cn(
              "min-h-16 rounded-inner border border-line bg-surface px-4 py-2 text-center text-[2.5rem] leading-tight text-ink",
              handwriting.className,
            )}
          >
            {name.trim() || " "}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
      <Button type="button" size="lg" loading={busy} onClick={() => void validate()}>
        {validateLabel}
      </Button>
    </div>
  );
}

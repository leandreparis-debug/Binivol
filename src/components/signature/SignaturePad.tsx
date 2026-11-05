"use client";

import "@fontsource/caveat/400.css";
import { useEffect, useId, useRef, useState } from "react";
import { Eraser, Keyboard, PenLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export type SignatureValue = { kind: "drawn"; png: Blob } | { kind: "typed"; name: string };

export interface SignaturePadProps {
  /** Full name of the signer (the typed signature must match it). */
  signerName: string;
  /** Text of the validation button. */
  submitLabel?: string;
  onValidate: (value: SignatureValue) => void;
  disabled?: boolean;
}

const CANVAS = { width: 640, height: 220 };
const MIN_INKED = 150;
const MAX_EXPORT_WIDTH = 800;

/**
 * Signature pad: a canvas driven by pointer events (finger, stylus, mouse)
 * with « Effacer » and « Valider », and an accessible alternative: typing
 * one's full name, shown in a handwriting font. An empty or too short trace
 * is refused here, and again by the server.
 */
export function SignaturePad({
  signerName,
  submitLabel = "Valider ma signature",
  onValidate,
  disabled = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const hintId = useId();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, [mode]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    setError(null);
  };

  const exportTrace = (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return Promise.resolve(null);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let inked = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 16) {
          inked += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (inked < MIN_INKED || maxX - minX < 60) return Promise.resolve(null);
    const pad = 8;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(canvas.width, maxX + pad) - sx;
    const sh = Math.min(canvas.height, maxY + pad) - sy;
    const scale = Math.min(1, MAX_EXPORT_WIDTH / sw);
    const out = document.createElement("canvas");
    out.width = Math.round(sw * scale);
    out.height = Math.round(sh * scale);
    out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return new Promise((resolve) => {
      out.toBlob((blob) => {
        resolve(blob);
      }, "image/png");
    });
  };

  const validate = async () => {
    setError(null);
    if (mode === "type") {
      if (typed.trim().length < 3) {
        setError("Saisis ton nom complet.");
        return;
      }
      onValidate({ kind: "typed", name: typed.trim() });
      return;
    }
    const blob = await exportTrace();
    if (!blob) {
      setError(
        empty
          ? "La signature est vide : trace-la dans le cadre."
          : "La signature est trop courte : trace ta signature en entier.",
      );
      return;
    }
    onValidate({ kind: "drawn", png: blob });
  };

  return (
    <div className="flex flex-col gap-3">
      {mode === "draw" ? (
        <>
          <p id={hintId} className="text-small text-muted">
            Trace ta signature dans le cadre, avec le doigt, un stylet ou la souris.
          </p>
          <canvas
            ref={canvasRef}
            width={CANVAS.width}
            height={CANVAS.height}
            role="img"
            aria-label="Zone de signature"
            aria-describedby={hintId}
            data-testid="signature-canvas"
            className="aspect-[32/11] w-full touch-none rounded-inner border border-line bg-surface"
            onPointerDown={(e) => {
              if (disabled) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              last.current = point(e);
              const ctx = canvasRef.current?.getContext("2d");
              ctx?.beginPath();
              ctx?.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
              ctx?.fill();
            }}
            onPointerMove={(e) => {
              if (!drawing.current || !last.current) return;
              const p = point(e);
              const ctx = canvasRef.current?.getContext("2d");
              ctx?.beginPath();
              ctx?.moveTo(last.current.x, last.current.y);
              ctx?.lineTo(p.x, p.y);
              ctx?.stroke();
              last.current = p;
              setEmpty(false);
            }}
            onPointerUp={() => {
              drawing.current = false;
              last.current = null;
            }}
            onPointerCancel={() => {
              drawing.current = false;
              last.current = null;
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              leftIcon={<Eraser aria-hidden="true" />}
              onClick={clear}
              disabled={disabled}
            >
              Effacer
            </Button>
            <Button
              type="button"
              variant="ghost"
              leftIcon={<Keyboard aria-hidden="true" />}
              onClick={() => {
                setMode("type");
                setError(null);
              }}
            >
              Signer en saisissant mon nom
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Ton nom complet"
            htmlFor="signature-typed"
            hint={`Saisis exactement : ${signerName}. Il sera utilisé comme signature.`}
          >
            <Input
              value={typed}
              autoComplete="name"
              maxLength={120}
              onChange={(e) => {
                setTyped(e.target.value);
              }}
            />
          </Field>
          <p
            aria-hidden="true"
            className="min-h-16 rounded-inner border border-line bg-surface px-4 py-2 text-[2.25rem] leading-tight text-ink"
            style={{ fontFamily: "Caveat, cursive" }}
          >
            {typed}
          </p>
          <Button
            type="button"
            variant="ghost"
            leftIcon={<PenLine aria-hidden="true" />}
            className="self-start"
            onClick={() => {
              setMode("draw");
              setError(null);
            }}
          >
            Tracer ma signature
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        disabled={disabled}
        onClick={() => void validate()}
        data-testid="signature-validate"
      >
        {submitLabel}
      </Button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pave de signature au doigt.
 *
 * Le canvas est dimensionne en pixels physiques (devicePixelRatio) sinon le
 * trait est flou sur tablette. On utilise les Pointer Events : ils couvrent
 * doigt, stylet et souris sans code separe, et setPointerCapture evite que le
 * trait se coupe quand le doigt sort du cadre.
 */
export function Signature({
  onChange,
}: {
  onChange: (blob: Blob | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);
  const [vide, setVide] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * ratio;
    canvas.height = r.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2a1f1b";
  }, []);

  const position = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const publier = () => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.toBlob((b) => onChange(b), "image/png");
  };

  const effacer = () => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVide(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        className="h-48 w-full touch-none rounded-xl border-2 border-dashed border-brand-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d");
          const p = position(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
          dessine.current = true;
          setVide(false);
        }}
        onPointerMove={(e) => {
          if (!dessine.current) return;
          const ctx = e.currentTarget.getContext("2d");
          const p = position(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          dessine.current = false;
          publier();
        }}
        onPointerLeave={() => {
          if (!dessine.current) return;
          dessine.current = false;
          publier();
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-brand-400">
          {vide ? "Signez avec le doigt dans le cadre" : "Signature enregistrée"}
        </p>
        <button
          type="button"
          onClick={effacer}
          className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}

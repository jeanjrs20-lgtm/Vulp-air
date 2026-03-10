"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type SignaturePadProps = {
  onChange: (dataUrl: string | null) => void;
  value?: string | null;
  disabled?: boolean;
};

export function SignaturePad({ onChange, value = null, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!value) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  const getPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const drawLine = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const { x, y } = getPosition(event);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#07384D";
    context.lineTo(x, y);
    context.stroke();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const { x, y } = getPosition(event);
    context.beginPath();
    context.moveTo(x, y);
    setDrawing(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) {
      return;
    }

    if (!drawing) {
      return;
    }

    drawLine(event);
  };

  const handlePointerUp = () => {
    setDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    if (disabled) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <canvas
        className={`h-28 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 ${
          disabled ? "cursor-not-allowed opacity-70" : ""
        }`}
        height={160}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        style={disabled ? { pointerEvents: "none" } : undefined}
        width={680}
      />
      <div className="mt-2 flex justify-end">
        <Button disabled={disabled} onClick={clear} type="button" variant="ghost">
          Limpar assinatura
        </Button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ScanIcon, SpinnerIcon } from "@/components/icons/ui";
import { readBarcode } from "@/lib/barcode";
import { formatPaise } from "@/lib/pricing";
import { lookupScannedOrderAction, type ScannedOrder } from "@/app/admin/actions";

/**
 * **Scan** on `/admin/orders`: point the camera at a parcel label and the
 * order it belongs to comes up (client, 2026-09-24).
 *
 * Both barcodes on a Shiprocket label work — the AWB and the order number —
 * because `findOrderByCode` tries the scan against both columns, and strips
 * the `-R2` retry suffix their label may carry.
 *
 * **Reading the barcode: the browser's reader, or ours.** `BarcodeDetector`
 * is used where it exists, since it is the hardware-accelerated one — but it
 * is missing on both devices this is used from, Chrome on a Linux laptop and
 * the phone's browser, so the fallback is `lib/barcode.ts`, a Code 128 reader
 * in this repo rather than a dependency (client, 2026-09-25: "make it work on
 * all browser even my laptop camera as well"). A frame costs well under a
 * millisecond, so it runs on a timer and needs no worker.
 *
 * **Three ways in, because cameras disappoint.** The live view; a photograph,
 * which on a phone opens the camera app and so comes back focused and far
 * sharper than any preview; and the number typed or pasted, which is also the
 * answer for a scuffed label.
 *
 * The camera is opened only while the dialog is open and every track is
 * stopped when it closes; nothing is recorded, and frames never leave the
 * browser — only the decoded string is sent to the server.
 */

/* The native API is not in `lib.dom` yet; this is the part of it used here. */
type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** Code 128 is what Shiprocket prints; the rest cost the native reader little. */
const FORMATS = ["code_128", "code_39", "codabar", "ean_13", "itf", "qr_code"];

/** Frames are read at this width at most — enough detail, little work. */
const SCAN_WIDTH = 1280;
/** A photograph is worth more pixels: it is read once, not five times a second. */
const PHOTO_WIDTH = 2000;

type Phase = "starting" | "scanning" | "nocamera" | "denied" | "looking" | "done";

export function ScanButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
      >
        <ScanIcon className="h-4 w-4" />
        Scan
      </button>
      {open && <ScanDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Whatever can read a barcode here: the browser's reader, else ours. */
function makeReader(): (source: HTMLVideoElement | HTMLCanvasElement) => Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Detector) {
    const detector = new Detector({ formats: FORMATS });
    return async (source) => {
      const codes = await detector.detect(source);
      return codes.map((code) => code.rawValue?.trim()).find(Boolean) ?? null;
    };
  }

  /* One canvas for every frame: allocating a 1280×720 one five times a second
     is how a phone's tab gets killed. */
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (source) => {
    if (!context) return null;
    const isVideo = source instanceof HTMLVideoElement;
    const width = isVideo ? source.videoWidth : source.width;
    const height = isVideo ? source.videoHeight : source.height;
    if (!width || !height) return null;
    const scale = Math.min(1, (isVideo ? SCAN_WIDTH : PHOTO_WIDTH) / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return readBarcode(context.getImageData(0, 0, canvas.width, canvas.height));
  };
}

function ScanDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("starting");
  /* Bumped by "Scan another", which restarts the camera effect. */
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [found, setFound] = useState<ScannedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<ReturnType<typeof makeReader> | null>(null);
  /* Read inside the scan loop, which must not be torn down and rebuilt on
     every render just to see the newest one. */
  const lookupRef = useRef<(value: string) => void>(() => {});

  async function lookup(value: string) {
    setCode(value);
    setPhase("looking");
    setError(null);
    setNote(null);
    try {
      const result = await lookupScannedOrderAction(value);
      if (result.error === "access") {
        setError("Your role cannot open orders.");
      } else if (!result.order) {
        setError(`No order here matches ${value}.`);
      }
      setFound(result.order);
    } catch {
      setError("Could not reach the server. Try again.");
      setFound(null);
    }
    setPhase("done");
  }
  /* Kept fresh in an effect, not during render — the same arrangement `Modal`
     uses for its `onClose`, and this project's lint rejects the other. */
  useEffect(() => {
    lookupRef.current = lookup;
  });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      readerRef.current ??= makeReader();
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("nocamera");
        return;
      }
      try {
        /* The back camera on a phone; a laptop has one and ignores this. The
           resolution is a wish — a bigger frame reads a smaller barcode. */
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        setPhase("denied");
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (cancelled) return;
      setPhase("scanning");

      const read = readerRef.current;
      const tick = async () => {
        if (cancelled) return;
        try {
          const value = await read(video);
          if (value) {
            stop();
            lookupRef.current(value);
            return;
          }
        } catch {
          /* A frame that cannot be decoded is the normal case; keep looking. */
        }
        timer = setTimeout(tick, 200);
      };
      void tick();
    })();

    return stop;
  }, [attempt]);

  /** A photograph, read at its own resolution — sharper than any preview. */
  async function readPhoto(file: File) {
    setNote(null);
    setPhase("looking");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      readerRef.current ??= makeReader();
      const value = await readerRef.current(canvas);
      if (value) {
        void lookup(value);
        return;
      }
      setNote("No barcode in that photo. Fill the frame with one barcode and try again.");
    } catch {
      setNote("That image could not be read.");
    } finally {
      URL.revokeObjectURL(url);
      setPhase((current) => (current === "looking" ? "scanning" : current));
    }
  }

  const scanAgain = () => {
    setFound(null);
    setError(null);
    setNote(null);
    setCode("");
    setPhase("starting");
    setAttempt((n) => n + 1);
  };

  const live = phase === "starting" || phase === "scanning" || phase === "looking";

  return (
    <Modal title="Scan a parcel label" onClose={onClose} size="lg">
      {phase === "done" ? (
        <Result order={found} error={error} code={code} onAgain={scanAgain} onClose={onClose} />
      ) : (
        <div className="space-y-4">
          {live ? (
            <div className="relative overflow-hidden border border-line bg-graphite-950">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-64 w-full bg-graphite-950 object-cover sm:h-80"
              />
              {/* The window to hold the label in — the whole frame is read, so
                  this is guidance, not a crop. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-4/5 border-2 border-white/70" />
              </div>
              <p
                role="status"
                className="absolute inset-x-0 bottom-0 bg-graphite-950/80 px-3 py-2 text-center text-xs font-medium text-white"
              >
                {phase === "scanning"
                  ? "Hold one barcode in the frame — AWB or order number."
                  : phase === "looking"
                    ? "Looking that up…"
                    : "Starting the camera…"}
              </p>
            </div>
          ) : (
            <p className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
              {phase === "denied"
                ? "The camera was not allowed. Turn it on for this site, or use a photo or the number below."
                : "No camera here. Use a photo of the label, or type the number below."}
            </p>
          )}

          {note && (
            <p
              role="status"
              className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body"
            >
              {note}
            </p>
          )}

          {/* On a phone this opens the camera app, which focuses properly —
              the quickest fix when the live view will not settle. */}
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle">
            <ScanIcon className="h-4 w-4" />
            Use a photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readPhoto(file);
              }}
            />
          </label>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = typed.trim();
              if (value) void lookup(value);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="scan-code" className="sr-only">
              AWB or order number
            </label>
            <input
              id="scan-code"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Or type the AWB or order number"
              className="h-10 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <button
              type="submit"
              disabled={!typed.trim() || phase === "looking"}
              className="inline-flex h-10 items-center gap-1.5 border border-accent bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {phase === "looking" && <SpinnerIcon className="h-3.5 w-3.5" />}
              Find
            </button>
          </form>
        </div>
      )}
    </Modal>
  );
}

function Result({
  order,
  error,
  code,
  onAgain,
  onClose,
}: {
  order: ScannedOrder | null;
  error: string | null;
  code: string;
  onAgain: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      {order ? (
        <div className="border border-line-strong bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-base font-semibold tracking-wide text-ink">
              {order.orderNumber}
            </p>
            <p className="text-base font-semibold text-accent">{formatPaise(order.total)}</p>
          </div>
          <p className="label-tech mt-1 text-muted">
            {order.status} · {order.paymentLabel} · {order.itemCount} item
            {order.itemCount === 1 ? "" : "s"}
          </p>
          <p className="mt-3 text-sm text-ink">
            {order.customerName}
            {order.customerPhone && <span className="text-muted"> · {order.customerPhone}</span>}
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-body">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.name} × {item.qty}
              </li>
            ))}
          </ul>
          {order.awb && (
            <p className="mt-3 text-sm text-body">
              {order.courierName || "Courier"} ·{" "}
              <span className="font-mono text-ink">{order.awb}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
          {error ?? `Nothing matched ${code}.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {order && (
          <Link
            href={`/admin/orders?q=${encodeURIComponent(order.orderNumber)}#order-${order.id}`}
            onClick={onClose}
            className="inline-flex h-10 items-center border border-accent bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Open this order
          </Link>
        )}
        <button
          type="button"
          onClick={onAgain}
          className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
        >
          <ScanIcon className="h-4 w-4" />
          Scan another
        </button>
      </div>
    </div>
  );
}

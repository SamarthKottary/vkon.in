"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ScanIcon, SpinnerIcon } from "@/components/icons/ui";
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
 * **No scanning library.** The browser's own `BarcodeDetector` reads the
 * label, which keeps the runtime dependencies at next/react/react-dom (see
 * AGENTS.md). It is there in Chrome on Android — the phone that will actually
 * be held over a parcel — and missing in Firefox and on desktop Linux, so the
 * dialog falls back to typing or pasting the number, which is also what to do
 * when a label is scuffed. The lookup behind both is the same action.
 *
 * The camera is opened only while the dialog is open and every track is
 * stopped when it closes; nothing is recorded, and frames never leave the
 * browser — only the decoded string is sent to the server.
 */

/* The API is not in `lib.dom` yet; this is the part of it used here. */
type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** Code 128 is what Shiprocket prints; the rest cost nothing to accept. */
const FORMATS = ["code_128", "code_39", "codabar", "ean_13", "itf", "qr_code"];

type Phase = "starting" | "scanning" | "unsupported" | "denied" | "looking" | "done";

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

function ScanDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("starting");
  /* Bumped by "Scan another", which restarts the camera effect. */
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState<ScannedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /* Read inside the scan loop, which must not be torn down and rebuilt on
     every render just to see the newest one. */
  const lookupRef = useRef<(value: string) => void>(() => {});

  async function lookup(value: string) {
    setCode(value);
    setPhase("looking");
    setError(null);
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
    /* Nothing to run once something has been read: the camera is off and the
       dialog is showing the answer. */
    if (attempt < 0) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setPhase("unsupported");
        return;
      }
      try {
        /* The back camera on a phone; a laptop has only the one and ignores
           this. */
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
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

      const detector = new Detector({ formats: FORMATS });
      const tick = async () => {
        if (cancelled) return;
        try {
          const codes = await detector.detect(video);
          const value = codes.map((c) => c.rawValue?.trim()).find(Boolean);
          if (value) {
            stop();
            lookupRef.current(value);
            return;
          }
        } catch {
          /* A frame that cannot be decoded is the normal case; keep looking. */
        }
        timer = setTimeout(tick, 300);
      };
      void tick();
    })();

    return stop;
  }, [attempt]);

  const scanAgain = () => {
    setFound(null);
    setError(null);
    setCode("");
    setPhase("starting");
    setAttempt((n) => n + 1);
  };

  return (
    <Modal title="Scan a parcel label" onClose={onClose} size="lg">
      {phase === "done" ? (
        <Result order={found} error={error} code={code} onAgain={scanAgain} onClose={onClose} />
      ) : (
        <div className="space-y-4">
          {phase === "unsupported" || phase === "denied" ? (
            <p className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
              {phase === "denied"
                ? "The camera was not allowed. Turn it on for this site, or type the number below."
                : "This browser cannot read barcodes. Chrome on Android can; otherwise type or paste the number below."}
            </p>
          ) : (
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
                  ? "Hold a barcode in the frame — AWB or order number."
                  : phase === "looking"
                    ? "Looking that up…"
                    : "Starting the camera…"}
              </p>
            </div>
          )}

          {/* Always available: a scuffed label is quicker to read out than to
              scan, and this is the whole control where the API is missing. */}
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

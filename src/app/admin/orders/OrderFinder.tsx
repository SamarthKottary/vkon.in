"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ScanIcon, SpinnerIcon } from "@/components/icons/ui";
import { OrderAddress } from "@/components/account/OrderAddress";
import { readBarcode } from "@/lib/barcode";
import { formatPaise } from "@/lib/pricing";
import { findOrdersAction, type FoundOrder } from "@/app/admin/actions";

/**
 * **Find an order** on `/admin/orders`: the Scan button and the search box,
 * which both open the same pop-up over a list that does not move.
 *
 * **The list behind stays where it is** (client, 2026-09-25: "it should not
 * effect the background … It should just pop show the details"). Looking an
 * order up used to mean searching for it, which re-filtered the page and lost
 * whatever section was being worked through; now the answer arrives on top and
 * the chips, the page and the scroll position are exactly as they were. The
 * pop-up says which section the order is in instead of taking you there.
 *
 * **Scanning.** Both barcodes on a Shiprocket label work — the AWB and the
 * order number — and the reading is done by `BarcodeDetector` where it exists,
 * else by `lib/barcode.ts`, this repo's own Code 128 reader, because the
 * native one is missing on the devices this is used from. Three ways in, since
 * cameras disappoint: the live view, a photograph (on a phone that opens the
 * camera app, which focuses properly), and the number typed.
 *
 * The camera is opened only while the dialog is open and every track is
 * stopped when it closes; frames never leave the browser — only the decoded
 * string is sent, to `findOrdersAction`.
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

type View =
  | { kind: "closed" }
  | { kind: "scan" }
  | { kind: "looking"; query: string }
  | { kind: "results"; query: string; orders: FoundOrder[]; scanning: boolean }
  | { kind: "order"; order: FoundOrder; from: "scan" | "search" | "results" }
  | { kind: "empty"; query: string; message: string; scanning: boolean };

export function OrderFinder({ q }: { q: string }) {
  const [view, setView] = useState<View>({ kind: "closed" });
  const [typed, setTyped] = useState("");
  /* Held so "Back to results" can return to the list of matches rather than
     making the operator search again. */
  const [results, setResults] = useState<{ query: string; orders: FoundOrder[] } | null>(null);

  async function find(query: string, from: "scan" | "search") {
    setView({ kind: "looking", query });
    setResults(null);
    try {
      const { orders, error } = await findOrdersAction(query);
      if (error === "access") {
        setView({ kind: "empty", query, message: "Your role cannot open orders.", scanning: false });
      } else if (orders.length === 0) {
        setView({
          kind: "empty",
          query,
          message: `No order matches ${query}.`,
          scanning: from === "scan",
        });
      } else if (orders.length === 1) {
        setView({ kind: "order", order: orders[0], from });
      } else {
        setResults({ query, orders });
        setView({ kind: "results", query, orders, scanning: from === "scan" });
      }
    } catch {
      setView({
        kind: "empty",
        query,
        message: "Could not reach the server. Try again.",
        scanning: false,
      });
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <button
        type="button"
        onClick={() => setView({ kind: "scan" })}
        className="inline-flex h-10 shrink-0 items-center gap-2 border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
      >
        <ScanIcon className="h-4 w-4" />
        Scan
      </button>

      {/* A form, so Enter works and a password manager leaves it alone — but
          it never navigates: the answer is a dialog, not a new page. */}
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = typed.trim();
          if (value) void find(value, "search");
        }}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none"
      >
        <label htmlFor="find-order" className="sr-only">
          Find an order by number, AWB, email or phone
        </label>
        <input
          id="find-order"
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Order number, AWB, email or phone"
          className="h-10 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:w-72"
        />
        <button
          type="submit"
          className="h-10 border border-line-strong px-4 text-sm font-medium text-ink hover:border-ink hover:bg-surface-subtle"
        >
          Find
        </button>
        {/* Only when an old `?q=` link is what filtered the list — the box
            itself no longer touches it. */}
        {q && (
          <a href="/admin/orders" className="h-10 px-2 text-sm leading-10 text-accent hover:underline">
            Clear filter
          </a>
        )}
      </form>

      {view.kind !== "closed" && (
        <FinderDialog
          view={view}
          onView={setView}
          onFind={(value) => find(value, "scan")}
          onBack={
            results && results.orders.length > 1
              ? () => setView({ kind: "results", ...results, scanning: false })
              : undefined
          }
          onClose={() => setView({ kind: "closed" })}
        />
      )}
    </div>
  );
}

function FinderDialog({
  view,
  onView,
  onFind,
  onBack,
  onClose,
}: {
  view: View;
  onView: (view: View) => void;
  onFind: (value: string) => void;
  /** Set when this search turned up several orders. */
  onBack?: () => void;
  onClose: () => void;
}) {
  const title =
    view.kind === "order"
      ? `Order ${view.order.orderNumber}`
      : view.kind === "results"
        ? "Which order?"
        : "Find an order";

  return (
    <Modal title={title} onClose={onClose} size="lg">
      {view.kind === "order" ? (
        <OrderDetails
          order={view.order}
          onBack={onBack}
          onScan={() => onView({ kind: "scan" })}
          onClose={onClose}
        />
      ) : view.kind === "results" ? (
        <ResultList
          orders={view.orders}
          query={view.query}
          onPick={(order) => onView({ kind: "order", order, from: "results" })}
        />
      ) : view.kind === "looking" ? (
        <p className="flex items-center gap-2 py-6 text-sm text-body">
          <SpinnerIcon className="h-4 w-4" />
          Looking up {view.query}…
        </p>
      ) : (
        <Scanner
          note={view.kind === "empty" ? view.message : null}
          onCode={onFind}
        />
      )}
    </Modal>
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

type Phase = "starting" | "scanning" | "nocamera" | "denied" | "reading";

/** The camera, a photograph, or the number typed. */
function Scanner({ note, onCode }: { note: string | null; onCode: (value: string) => void }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<ReturnType<typeof makeReader> | null>(null);
  /* Read inside the scan loop, which must not be torn down and rebuilt on
     every render just to see the newest one. */
  const codeRef = useRef(onCode);
  useEffect(() => {
    codeRef.current = onCode;
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
            codeRef.current(value);
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
  }, []);

  /** A photograph, read at its own resolution — sharper than any preview. */
  async function readPhoto(file: File) {
    setProblem(null);
    setPhase("reading");
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
        codeRef.current(value);
        return;
      }
      setProblem("No barcode in that photo. Fill the frame with one barcode and try again.");
    } catch {
      setProblem("That image could not be read.");
    } finally {
      URL.revokeObjectURL(url);
      setPhase((current) => (current === "reading" ? "scanning" : current));
    }
  }

  const live = phase === "starting" || phase === "scanning" || phase === "reading";

  return (
    <div className="space-y-4">
      {note && (
        <p role="status" className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
          {note}
        </p>
      )}

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
              : phase === "reading"
                ? "Reading that photo…"
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

      {problem && (
        <p role="status" className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
          {problem}
        </p>
      )}

      {/* On a phone this opens the camera app, which focuses properly — the
          quickest fix when the live view will not settle. */}
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
          if (value) codeRef.current(value);
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
          disabled={!typed.trim()}
          className="inline-flex h-10 items-center border border-accent bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Find
        </button>
      </form>
    </div>
  );
}

/** Several matches — a phone number, an email — newest first. */
function ResultList({
  orders,
  query,
  onPick,
}: {
  orders: FoundOrder[];
  query: string;
  onPick: (order: FoundOrder) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-body">
        {orders.length} orders match <span className="text-ink">{query}</span>.
      </p>
      <ul className="divide-y divide-line border border-line">
        {orders.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onPick(order)}
              className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
            >
              <span className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</span>
              <span className="label-tech text-muted">
                {order.section} · {formatDate(order.createdAt)}
              </span>
              <span className="text-sm font-semibold text-accent">{formatPaise(order.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One order, read-only: what it is, where it is, and who it is going to. */
function OrderDetails({
  order,
  onBack,
  onScan,
  onClose,
}: {
  order: FoundOrder;
  onBack?: () => void;
  onScan: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="inline-flex items-center border border-accent px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
          {order.section}
        </span>
        <p className="label-tech text-muted">
          {order.paymentLabel} · ordered {formatDate(order.createdAt)}
        </p>
      </div>

      <div>
        <p className="label-tech text-muted">Items</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {order.items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex justify-between gap-4">
              {/* The product in a new tab, as on the cards behind — this
                  pop-up exists so the list is not disturbed, and a link that
                  navigated would disturb it (client, 2026-09-25). */}
              {item.productId && item.slug ? (
                <a
                  href={`/products/${item.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink hover:text-accent hover:underline"
                >
                  {item.name} <span className="text-muted">× {item.qty}</span>
                </a>
              ) : (
                <span className="text-ink">
                  {item.name} <span className="text-muted">× {item.qty}</span>
                </span>
              )}
              <span className="tabular-nums text-body">{formatPaise(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <Row label="Subtotal" value={formatPaise(order.subtotal)} />
          <Row label="GST" value={formatPaise(order.tax)} />
          <Row
            label={order.deliveryService ? `Delivery · ${order.deliveryService}` : "Delivery"}
            value={order.shipping > 0 ? formatPaise(order.shipping) : "Not quoted"}
          />
          <Row label="Total" value={formatPaise(order.total)} strong />
        </dl>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="label-tech text-muted">Deliver to</p>
          <OrderAddress address={order.shipTo} />
        </div>
        <div>
          <p className="label-tech text-muted">Bill to</p>
          {order.sameAddress ? (
            <p className="mt-3 text-sm text-body">Same as the delivery address.</p>
          ) : (
            <OrderAddress address={order.billTo} />
          )}
        </div>
      </div>

      <div className="space-y-1 border-t border-line pt-4 text-sm">
        {order.email && (
          <p className="text-body">
            Account <span className="text-ink">{order.email}</span>
          </p>
        )}
        {order.awb ? (
          <p className="text-body">
            {order.courierName || "Courier"} ·{" "}
            <span className="font-mono text-ink">{order.awb}</span>
            {order.trackingStatus && <span className="text-muted"> · {order.trackingStatus}</span>}
          </p>
        ) : (
          <p className="text-muted">No parcel booked yet.</p>
        )}
      </div>

      {/* Nothing here navigates: the list behind is exactly as it was left. */}
      <div className="flex flex-wrap items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 items-center border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
          >
            Back to results
          </button>
        )}
        <button
          type="button"
          onClick={onScan}
          className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
        >
          <ScanIcon className="h-4 w-4" />
          Scan another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center border border-accent bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-semibold text-ink" : "text-body"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-ink" : "text-body"}`}>{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

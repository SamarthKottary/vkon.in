"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ScanIcon, SpinnerIcon } from "@/components/icons/ui";
import { readBarcode } from "@/lib/barcode";
import { listHref } from "@/lib/admin-list";

/**
 * **Find an order** on `/admin/orders`: the Scan button and the search box.
 *
 * **Both filter the list** (client, 2026-09-25, after a day with the other
 * arrangement: "let the scan and search bar, filter and show the order, no
 * need for a pop up"). Scanning a parcel label puts what it read into the
 * search and the page comes back showing that order, with everything the card
 * already offers — the status control, Book shipment, the refund button —
 * instead of a read-only summary on top of it.
 *
 * **A search drops the status filter.** An order looked up by number, AWB or
 * phone is wanted whatever section it is in, and "no orders match" while
 * standing in Ready to ship was the old behaviour's sharpest edge. The chips
 * are still there to narrow it again afterwards.
 *
 * **Reading the barcode: the browser's reader, or ours.** `BarcodeDetector`
 * where it exists; `lib/barcode.ts` — this repo's own Code 128 reader —
 * everywhere else, since the native one is missing on the devices this is used
 * from. Three ways in, because cameras disappoint: the live view, a photograph
 * (on a phone that opens the camera app, which focuses properly), and the
 * number typed. The camera is opened only while the dialog is open and every
 * track is stopped when it closes; frames never leave the browser.
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

export function OrderFinder({ q, sort }: { q: string; sort: string }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);

  /** What a scan or a typed code searches for. */
  const search = (value: string) => {
    /* Scanned exactly as it reads, `-R3` and all (client, 2026-09-26). The
       list matches that suffix itself now, and only on the attempt the order
       is actually on — stripping it here would make a label from a cancelled
       attempt open the live parcel's order, which is the one answer a packing
       table must not give. */
    setScanning(false);
    router.push(listHref("/admin/orders", { q: value.trim(), sort }));
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <button
        type="button"
        onClick={() => setScanning(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
      >
        <ScanIcon className="h-4 w-4" />
        Scan
      </button>

      {/* A plain GET form, like the other admin lists: the view lives in the
          URL, and it works before any JavaScript arrives. `status` is
          deliberately not kept — see the note above. */}
      <form
        action="/admin/orders"
        role="search"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none"
      >
        {sort && <input type="hidden" name="sort" value={sort} />}
        <label htmlFor="find-order" className="sr-only">
          Search orders by number, AWB, email or phone
        </label>
        <input
          id="find-order"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Order number, AWB, email or phone"
          className="h-10 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:w-72"
        />
        <button
          type="submit"
          className="h-10 border border-line-strong px-4 text-sm font-medium text-ink hover:border-ink hover:bg-surface-subtle"
        >
          Search
        </button>
        {q && (
          <a
            href={listHref("/admin/orders", { sort })}
            className="h-10 px-2 text-sm leading-10 text-accent hover:underline"
          >
            Clear
          </a>
        )}
      </form>

      {scanning && (
        <Modal title="Scan a parcel label" onClose={() => setScanning(false)} size="lg">
          <Scanner onCode={search} />
        </Modal>
      )}
    </div>
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
function Scanner({ onCode }: { onCode: (value: string) => void }) {
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
        <p
          role="status"
          className="border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body"
        >
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
          className="inline-flex h-10 items-center gap-1.5 border border-accent bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {phase === "reading" && <SpinnerIcon className="h-3.5 w-3.5" />}
          Find
        </button>
      </form>
    </div>
  );
}

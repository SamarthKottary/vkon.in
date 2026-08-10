import type { ProtectionKey } from "@/lib/types";

/**
 * The protection icon set — the visual through-line of the site.
 *
 * Hand-drawn on a 24×24 grid, stroke-based, `currentColor` throughout, so a
 * single icon works on white cards, on the graphite hero and in amber on a dark
 * band without producing three assets. Inline SVG rather than an icon library:
 * crisp at any size, themeable, and zero KB of JavaScript shipped.
 */

type IconProps = {
  className?: string;
};

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Rotary lock — the rotor is jammed and the panel cuts supply. */
function RotaryLock({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <circle cx="12" cy="15.25" r="1.4" />
    </svg>
  );
}

/** Auto start — power returns and the motor restarts on its own. */
function AutoStartTimer({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5" />
      <path d="M9.1 8.9a4.2 4.2 0 1 0 5.8 0" />
    </svg>
  );
}

/** Cyclic timer — repeating on and off cycles. */
function CyclicTimer({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.8 3.2v3.6h-3.6" />
      <path d="M12 8v4.3l3 1.8" />
    </svg>
  );
}

/** High and low voltage protection. */
function HvLv({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M13.5 2.5 7 12.5h4.4L10.5 21.5 17 11.5h-4.4l.9-9Z" />
      <path d="M4 15V7m0 0L2.2 8.8M4 7l1.8 1.8" />
      <path d="M20 9v8m0 0 1.8-1.8M20 17l-1.8-1.8" />
    </svg>
  );
}

/** Live voltage and current sensing on all three phases. */
function VoltageCurrentSensing({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 17.5a8.5 8.5 0 1 1 17 0" />
      <path d="M12 17.5 16.2 11" />
      <circle cx="12" cy="17.5" r="1.3" />
      <path d="M4.6 12.2 5.8 12.7M12 9v1.3M19.4 12.2l-1.2.5" />
    </svg>
  );
}

/** Single phasing — one of the three phases drops out. */
function SinglePhase({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 6.5h18" />
      <path d="M3 12h5.5M15.5 12H21" />
      <path d="M3 17.5h18" />
      <path d="M11.2 9.6 12.8 14.4" />
    </svg>
  );
}

/** CT-based overload relay — current spikes past the set threshold. */
function OverloadRelay({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8.5h18" strokeDasharray="2.5 2.5" />
      <path d="M3 18h3l2.4-8.5L11.4 21l2.4-7.5 1.9 4.5H21" />
    </svg>
  );
}

/** Dry run — the borewell has no water and the pump must stop. */
function DryRun({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.2s5.6 6.1 5.6 9.6a5.6 5.6 0 1 1-11.2 0C6.4 9.3 12 3.2 12 3.2Z" />
      <path d="M4.2 20.3 19.8 4.2" />
    </svg>
  );
}

/** Phase reversal — R, Y and B arrive in the wrong sequence. */
function PhaseReversal({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8.5h14m0 0-3.6-3.6M17.5 8.5l-3.6 3.6" />
      <path d="M20.5 16h-14m0 0 3.6-3.6M6.5 16l3.6 3.6" />
    </svg>
  );
}

/** Star-delta changeover timing for larger motors. */
function StarDelta({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 4.5v5.2m0 0-3.4 4.1m3.4-4.1 3.4 4.1" />
      <path d="M17.2 5.2 22 19h-9.6l4.8-13.8Z" />
    </svg>
  );
}

/** Mobile control — switch and monitor the motor by call or SMS. */
function MobileControl({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M7 18.5h3" />
      <path d="M16.8 8.6a4.6 4.6 0 0 1 0 6.8" />
      <path d="M19.7 5.8a8.6 8.6 0 0 1 0 12.4" />
    </svg>
  );
}

/** Solar powered — runs off panels, mains, or switches between them. */
function SolarPowered({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="17" cy="6.5" r="2.8" />
      <path d="M17 1.6v1.2M21.9 6.5h-1.2M20.5 3l-.9.9M20.5 10l-.9-.9M13.5 6.5h-1.2" />
      <path d="M2.5 19.5h13l-2.6-9H5.1l-2.6 9Z" />
      <path d="M6.3 10.5 4.4 19.5M11.7 10.5l1.9 9M3.8 15h10.4" />
    </svg>
  );
}

const icons: Record<ProtectionKey, (props: IconProps) => React.ReactElement> = {
  "rotary-lock": RotaryLock,
  "auto-start-timer": AutoStartTimer,
  "cyclic-timer": CyclicTimer,
  "hv-lv": HvLv,
  "voltage-current-sensing": VoltageCurrentSensing,
  "single-phase": SinglePhase,
  "overload-relay": OverloadRelay,
  "dry-run": DryRun,
  "phase-reversal": PhaseReversal,
  "star-delta": StarDelta,
  "mobile-control": MobileControl,
  "solar-powered": SolarPowered,
};

/** Label and plain-language explanation for each protection. */
export const protectionMeta: Record<
  ProtectionKey,
  { label: string; description: string }
> = {
  "dry-run": {
    label: "Dry run protection",
    description:
      "Senses when the borewell has run out of water and cuts the motor before the winding burns, then restarts on its own once water returns.",
  },
  "hv-lv": {
    label: "High & low voltage",
    description:
      "Holds the motor off while the incoming supply sits outside its safe band, and releases it the moment voltage steadies.",
  },
  "phase-reversal": {
    label: "Phase reversal",
    description:
      "Detects when R, Y and B arrive out of sequence, so the pump never runs backwards after line work.",
  },
  "single-phase": {
    label: "Single phase protection",
    description:
      "Trips when a phase drops out on either the HT or LT line — the most common cause of a burnt winding.",
  },
  "overload-relay": {
    label: "CT-based overload",
    description:
      "Current transformers watch the actual load and trip on overcurrent, with the trip point set from the keypad.",
  },
  "rotary-lock": {
    label: "Rotary lock protection",
    description:
      "Cuts supply when the rotor is jammed and the motor is drawing locked-rotor current.",
  },
  "auto-start-timer": {
    label: "Auto start with timer",
    description:
      "Restarts the pump on its own when the supply comes back, after an adjustable delay so it never starts into an unstable line.",
  },
  "cyclic-timer": {
    label: "Cyclic timer",
    description:
      "Separate on and off timers run the pump on a repeating cycle, unattended, through the night.",
  },
  "voltage-current-sensing": {
    label: "Voltage & current sensing",
    description:
      "Live amps and voltage for all three phases on the display, so a fault is visible before it becomes damage.",
  },
  "star-delta": {
    label: "Star-delta timing",
    description:
      "Automatic changeover on larger motors, limiting the inrush current at start.",
  },
  "mobile-control": {
    label: "Mobile control",
    description:
      "Switch the motor on or off from any phone by call or SMS, and get status back as a message.",
  },
  "solar-powered": {
    label: "Solar powered",
    description:
      "Runs the pump from solar panels, from mains, or changes over between them automatically.",
  },
};

export function ProtectionIcon({
  name,
  className = "h-6 w-6",
}: {
  name: ProtectionKey;
  className?: string;
}) {
  const Icon = icons[name];
  return <Icon className={className} />;
}

export const protectionKeys = Object.keys(icons) as ProtectionKey[];

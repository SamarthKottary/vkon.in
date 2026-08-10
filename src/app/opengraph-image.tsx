import { ImageResponse } from "next/og";
import { site } from "@/content/site";

/**
 * Social share card, generated at build time.
 *
 * ImageResponse supports only a subset of CSS — flexbox, no grid, and every
 * flex container needs an explicit `display: flex`. Kept to system fonts so the
 * build does not depend on fetching a font file.
 */

export const alt = `${site.name} — motor starters and control panels for agriculture`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12151a",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "76px",
              height: "76px",
              borderRadius: "20px",
              background: "#1F7A4C",
            }}
          >
            <svg width="46" height="46" viewBox="0 0 32 32">
              <path
                d="M8.5 10.5 16 21.5"
                stroke="#FFB423"
                strokeWidth="3.6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M16 21.5 23.5 10.5"
                stroke="#FFFFFF"
                strokeWidth="3.6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "44px", fontWeight: 700, color: "#ffffff" }}>
              {site.name}
            </span>
            <span
              style={{
                fontSize: "17px",
                letterSpacing: "4px",
                color: "#909aa6",
                textTransform: "uppercase",
              }}
            >
              Control Panels
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: "78px",
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.06,
              letterSpacing: "-2px",
            }}
          >
            Motor protection
          </span>
          <span
            style={{
              fontSize: "78px",
              fontWeight: 800,
              color: "#F0A500",
              lineHeight: 1.06,
              letterSpacing: "-2px",
            }}
          >
            that actually holds.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {["Dry run", "Phase reversal", "HV / LV", "Overload", "Mobile control"].map(
            (label) => (
              <span
                key={label}
                style={{
                  display: "flex",
                  fontSize: "21px",
                  color: "#b8bec7",
                  border: "1px solid #3e444d",
                  borderRadius: "999px",
                  padding: "10px 22px",
                }}
              >
                {label}
              </span>
            ),
          )}
        </div>
      </div>
    ),
    size,
  );
}

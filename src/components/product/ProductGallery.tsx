"use client";

import { useState } from "react";

interface Props {
  mainImage: string | null;
  galleryImages: string[];
  alt: string;
}

/**
 * PDP image gallery — main + clickable thumbnails.
 *
 * Renders the mainImage in the hero slot, with galleryImages as a
 * thumbnail strip beneath. Clicking a thumbnail swaps it into the
 * hero slot. State is local; no URL persistence (intentional — back
 * button should not re-shuffle galleries).
 *
 * Empty state: a placeholder box icon. Single-image: hero only,
 * no thumbnail row (avoid visual noise when there's nothing to choose).
 */
export function ProductGallery({ mainImage, galleryImages, alt }: Props) {
  const allImages: string[] = [
    ...(mainImage ? [mainImage] : []),
    ...galleryImages.filter((u) => u && u !== mainImage),
  ];
  const [active, setActive] = useState<string | null>(allImages[0] ?? null);

  return (
    <div>
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "0.75rem",
          aspectRatio: "1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          marginBottom: allImages.length > 1 ? "0.625rem" : 0,
        }}
      >
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active}
            alt={alt}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "#aaa", fontSize: "3rem" }}>📦</span>
        )}
      </div>

      {allImages.length > 1 ? (
        <div
          role="tablist"
          aria-label="Produktbilder"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
            gap: "0.5rem",
          }}
        >
          {allImages.map((url) => {
            const isActive = url === active;
            return (
              <button
                key={url}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(url)}
                style={{
                  background: "#f9fafb",
                  border: isActive ? "2px solid #0f172a" : "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  aspectRatio: "1",
                  overflow: "hidden",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

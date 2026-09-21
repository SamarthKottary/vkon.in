"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { Avatar } from "@/components/account/Avatar";
import { Button } from "@/components/ui/Button";
import {
  uploadAdminAvatarAction,
  removeAdminAvatarAction,
} from "@/app/admin/profile/actions";

const STORED_PX = 256;

/**
 * Admin profile picture — mirrors AvatarForm from the customer account page,
 * but uses admin-specific server actions.
 */
export function AdminAvatarForm({
  name,
  email,
  url,
  source,
}: {
  name: string;
  email: string;
  url: string | null;
  source: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    let blob: Blob;
    try {
      blob = await squareImage(file, STORED_PX);
    } catch {
      setError("That file could not be opened as a picture. Please choose a photo.");
      return;
    }
    const form = new FormData();
    form.set("avatar", blob, blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
    startTransition(async () => {
      const result = await uploadAdminAvatarAction(form);
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeAdminAvatarAction();
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-5">
      <Avatar name={name} email={email} url={url} size={72} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Profile picture</p>
        <p className="mt-0.5 text-xs text-muted">
          Shown in the admin navigation when you are signed in.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending && <SpinnerIcon className="h-3.5 w-3.5" />}
            {pending ? "Saving…" : url ? "Change photo" : "Upload a photo"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

async function squareImage(file: File, size: number): Promise<Blob> {
  const src = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.src = src;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("empty image");

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );

    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    const webp = await encode("image/webp", 0.85);
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await encode("image/jpeg", 0.88);
    if (!jpeg) throw new Error("could not encode");
    return jpeg;
  } finally {
    URL.revokeObjectURL(src);
  }
}

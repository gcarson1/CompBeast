'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

const QR_SIZE = 220;

/**
 * The QR encoder is ~8kB and most people never open the dialog, so it is a
 * separate chunk fetched on the first open rather than part of the league
 * page's initial payload. It is paired with the `opened` state below: the
 * dialog's markup is in the DOM from the start, so without that gate this
 * would render (and therefore load) immediately, which is the thing being
 * avoided.
 */
const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), {
  ssr: false,
  // Same footprint as the code it becomes, so the panel does not jump.
  loading: () => <div style={{ width: QR_SIZE, height: QR_SIZE }} />,
});

/**
 * Copies text, preferring the async Clipboard API and falling back to the
 * old selection trick.
 *
 * The fallback is not paranoia: `navigator.clipboard` is undefined outside a
 * secure context, and on some in-app browsers (the ones people actually open
 * a shared link in) the permission is denied outright. Sharing an invite code
 * is exactly the flow that arrives through a link in a message.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Off-screen but still focusable — `display:none` would make select() a
    // no-op, and iOS refuses to copy from a zero-size element.
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * The league's invite code: tap the code itself to copy it, or open a QR code
 * for someone to scan.
 *
 * The QR is opt-in behind a button rather than always on screen, because most
 * of the time the people being invited are not in the room.
 */
export function InviteCode({ code, leagueName }: { code: string; leagueName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  // Latches on first open and stays true, so reopening is instant.
  const [opened, setOpened] = useState(false);

  // The QR has to encode an absolute URL to be scannable, and the origin is
  // only knowable in the browser — which also means it is automatically right
  // on localhost, on a preview deployment and in production, with no env var
  // to keep in sync.
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/leagues/join?code=${encodeURIComponent(code)}`);
  }, [code]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  // `isCode` drives only the checkmark on the code button — copying the join
  // link from the dialog should not tick the control next to the code, which
  // is not what was copied.
  const handleCopy = async (text: string, label: string, isCode = false) => {
    if (await copyText(text)) {
      if (isCode) setCopied(true);
      toast.success(`${label} copied`);
    } else {
      toast.error('Could not copy — select the code and copy it manually.');
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <span className="text-sm text-muted">Invite code</span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleCopy(code, 'Invite code', true)}
          className="btn-ghost btn-sm font-mono tracking-widest"
        >
          {code}
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span className="sr-only">Copy invite code</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setOpened(true);
            dialogRef.current?.showModal();
          }}
          aria-label="Show a QR code for this league"
          className="btn-ghost btn-sm px-2.5"
        >
          <QrIcon />
        </button>
      </div>

      {/*
        A real <dialog> opened with showModal(): focus trapping, Escape to
        close and an inert background all come from the platform, which is
        more than a hand-rolled overlay would get right.
      */}
      <dialog
        ref={dialogRef}
        aria-label={`QR code to join ${leagueName}`}
        onKeyDown={(e) => {
          // Escape on a modal <dialog> is the platform's job, and in a normal
          // tab it is. It is cheap to not depend on that: this is the only
          // way out for a keyboard user, and it measurably does not fire in
          // every embedded browser view.
          if (e.key === 'Escape') e.currentTarget.close();
        }}
        onClick={(e) => {
          // A backdrop click is reported as a click on the dialog element
          // itself; a click on anything inside targets that child. Checking
          // the target first is what makes the geometry test safe — a
          // keyboard Enter on one of the buttons below fires a click with
          // clientX/clientY of 0, which reads as "outside" and would close
          // the dialog out from under whoever just pressed Copy link.
          if (e.target !== e.currentTarget) return;

          const box = e.currentTarget.getBoundingClientRect();
          const outside =
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom;
          if (outside) e.currentTarget.close();
        }}
        className="rounded-card border border-hairline bg-surface p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(20rem,calc(100vw-2.5rem))] p-5 text-center">
          <h2 className="text-lg font-semibold">Scan to join</h2>
          <p className="mt-1 text-2xs leading-relaxed text-muted">
            Point a phone camera at this to open {leagueName} with the code already filled in.
          </p>

          {/* QR scanners need dark modules on a light field, so this tile
              stays white regardless of the app's dark surface. */}
          <div className="mt-4 inline-block rounded-2xl bg-white p-3">
            {opened && joinUrl ? (
              <QRCodeSVG
                value={joinUrl}
                size={QR_SIZE}
                level="M"
                // The spec's 4-module quiet zone, drawn inside the SVG rather
                // than left to the tile's padding: padding is a fixed number
                // of CSS pixels, so how many *modules* of white it works out
                // to changes with the code's density, and a quiet zone that
                // comes up short is a code some scanners refuse to read.
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#0F172A"
                title={`Join ${leagueName}`}
              />
            ) : (
              <div style={{ width: QR_SIZE, height: QR_SIZE }} />
            )}
          </div>

          <p className="mt-4 font-mono text-xl tracking-widest">{code}</p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => handleCopy(joinUrl || code, joinUrl ? 'Join link' : 'Invite code')}
              className="btn-ghost flex-1"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn-primary flex-1"
            >
              Done
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" strokeLinecap="round" />
    </svg>
  );
}

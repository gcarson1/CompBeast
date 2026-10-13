'use client';

import dynamic from 'next/dynamic';

/**
 * Mounts NativeBridge for the iOS app only (the root layout renders this
 * when the request comes from the app). Loaded as its own chunk, so the
 * website's bundle carries none of the app's code.
 */
const NativeBridge = dynamic(() => import('./NativeBridge'), { ssr: false });

export function NativeBridgeLoader({ signedIn }: { signedIn: boolean }) {
  return <NativeBridge signedIn={signedIn} />;
}

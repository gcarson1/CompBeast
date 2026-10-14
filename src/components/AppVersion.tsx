'use client';

import { useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/native';

/**
 * "Comp Beast for iPhone 1.0.0 (1)" — in the app only, at the foot of every
 * page, so a bug report can say which build it came from. Renders nothing on
 * the website, and nothing until the bridge has answered.
 */
export function AppVersion() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then(({ version, build }) => setLabel(`Comp Beast for iPhone ${version} (${build})`))
      .catch(() => {});
  }, []);

  return label ? <p className="mt-2">{label}</p> : null;
}

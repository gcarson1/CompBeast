import type { ClerkProvider } from '@clerk/nextjs';
import type { ComponentProps } from 'react';

type ClerkAppearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;
type ClerkLocalization = NonNullable<ComponentProps<typeof ClerkProvider>['localization']>;

/**
 * The components' headings name the Clerk *application*, which the Vercel
 * integration created as "clerk-beige-dog". Renaming it in the Clerk
 * dashboard fixes the emails too; this fixes what the components say
 * whatever the dashboard is called.
 */
export const clerkLocalization: ClerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to Comp Beast',
      subtitle: 'Welcome back. Pick up where your league left off.',
    },
  },
  signUp: {
    start: {
      title: 'Create your Comp Beast account',
      subtitle: 'Free, and it takes a minute.',
    },
  },
};

/**
 * Clerk's components in the app's own clothes.
 *
 * Until now the sign-in modal and the hosted account portal rendered in
 * Clerk's default light theme — a white card on the arena's dark canvas,
 * which is the moment the app stopped looking like one thing. This maps
 * Clerk's variables onto the palette in tailwind.config.ts: surface for the
 * card, canvas for inputs, HOH gold for the primary action with `on-gold`
 * ink on it, and the body face from `next/font`.
 *
 * Social buttons go at the top as full-width buttons. For a new member who
 * arrived by scanning a QR code, "Continue with Google" is the whole sign-up;
 * it belongs above the email form, not folded under it. Which providers
 * actually appear is decided in the Clerk dashboard (SSO connections), not
 * here — the component renders every enabled one.
 */
export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: '#F59E0B',
    colorTextOnPrimaryBackground: '#1A1206',
    colorBackground: '#1E293B',
    colorInputBackground: '#0F172A',
    colorInputText: '#F8FAFC',
    colorText: '#F8FAFC',
    colorTextSecondary: '#94A3B8',
    colorNeutral: '#F8FAFC',
    colorDanger: '#F87171',
    colorSuccess: '#6EE7B7',
    colorWarning: '#FB923C',
    borderRadius: '8px',
    fontFamily: 'var(--font-text), ui-sans-serif, -apple-system, system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-text), ui-sans-serif, -apple-system, system-ui, sans-serif',
  },
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
    logoPlacement: 'none',
    shimmer: false,
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'bg-surface border border-hairline shadow-card',
    formButtonPrimary: 'uppercase tracking-wide',
    socialButtonsBlockButton: 'border border-hairline bg-canvas hover:bg-surface-raised',
    footer: 'bg-surface',
  },
};

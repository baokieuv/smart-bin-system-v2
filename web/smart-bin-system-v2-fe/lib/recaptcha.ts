type Grecaptcha = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export async function getRecaptchaToken(action: string): Promise<string> {
  if (!recaptchaSiteKey) {
    throw new Error('reCAPTCHA site key is missing. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY in your environment.');
  }

  if (typeof window === 'undefined') {
    throw new Error('reCAPTCHA can only run in the browser.');
  }

  const grecaptcha = window.grecaptcha;

  if (!grecaptcha) {
    throw new Error('reCAPTCHA is not loaded yet. Please try again.');
  }

  await new Promise<void>((resolve) => {
    grecaptcha.ready(() => resolve());
  });

  return grecaptcha.execute(recaptchaSiteKey, { action });
}
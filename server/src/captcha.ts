export class CaptchaConfigurationError extends Error {
  constructor() {
    super('RECAPTCHA_SECRET_KEY is not configured');
    this.name = 'CaptchaConfigurationError';
  }
}

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  challenge_ts?: string;
};

type CaptchaOptions = {
  secret: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const TOKEN_LIFETIME_MS = 2 * 60 * 1000;

export function createRecaptchaVerifier({ secret, fetchImpl = fetch, now = Date.now }: CaptchaOptions) {
  return async (token: string, expectedHostname: string, remoteIp?: string): Promise<boolean> => {
    if (!secret?.trim()) throw new CaptchaConfigurationError();
    if (!token?.trim() || !expectedHostname?.trim()) return false;

    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const result = await response.json() as SiteverifyResponse;
      if (result.success !== true || typeof result.hostname !== 'string' || typeof result.challenge_ts !== 'string') return false;
      const challengeTime = Date.parse(result.challenge_ts);
      const currentTime = now();
      return result.hostname.toLowerCase() === expectedHostname.toLowerCase()
        && Number.isFinite(challengeTime)
        && challengeTime <= currentTime
        && currentTime < challengeTime + TOKEN_LIFETIME_MS;
    } catch {
      return false;
    }
  };
}

export function verifyRecaptcha(token: string, expectedHostname: string, remoteIp?: string): Promise<boolean> {
  return createRecaptchaVerifier({ secret: process.env.RECAPTCHA_SECRET_KEY })(token, expectedHostname, remoteIp);
}

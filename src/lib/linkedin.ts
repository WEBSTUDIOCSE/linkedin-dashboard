/**
 * LinkedIn OAuth 2.0 + UGC Posts API helpers
 *
 * Scopes required: r_liteprofile r_emailaddress w_member_social
 */

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';
const LINKEDIN_PROFILE_URL = 'https://api.linkedin.com/v2/me';

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
}

export interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
}

export interface LinkedInPostResult {
  id: string;
}

/**
 * Build the LinkedIn OAuth authorization URL.
 */
export function buildLinkedInAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId) {
    throw new Error('NEXT_PUBLIC_LINKEDIN_CLIENT_ID is not configured');
  }
  if (!redirectUri) {
    throw new Error('LINKEDIN_REDIRECT_URI is not configured');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri!,
    state,
    scope: 'r_liteprofile r_emailaddress w_member_social',
  });

  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token (server-side only).
 */
export async function exchangeLinkedInCode(code: string): Promise<LinkedInTokenResponse> {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn client credentials are not configured');
  }
  if (!redirectUri) {
    throw new Error('LINKEDIN_REDIRECT_URI is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri!,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token exchange failed: ${text}`);
  }

  return res.json() as Promise<LinkedInTokenResponse>;
}

/**
 * Fetch the LinkedIn member's profile to get their URN.
 */
export async function getLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  const res = await fetch(LINKEDIN_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn profile fetch failed: ${text}`);
  }

  return res.json() as Promise<LinkedInProfile>;
}

/**
 * Publish a text post to LinkedIn via the UGC Posts API.
 *
 * @param accessToken  User's LinkedIn access token
 * @param authorUrn    LinkedIn member URN — e.g. "urn:li:person:ABC123"
 * @param text         Post body text
 * @param pdfUrl       Optional URL to attach as a link (shared article)
 */
export async function postToLinkedIn(
  accessToken: string,
  authorUrn: string,
  text: string,
  pdfUrl?: string,
): Promise<LinkedInPostResult> {
  const body: Record<string, unknown> = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: pdfUrl ? 'ARTICLE' : 'NONE',
        ...(pdfUrl && {
          media: [
            {
              status: 'READY',
              originalUrl: pdfUrl,
            },
          ],
        }),
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch(LINKEDIN_UGC_POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn post failed (${res.status}): ${text}`);
  }

  // LinkedIn returns the post ID in the X-RestLi-Id header
  const postId = res.headers.get('x-restli-id') || res.headers.get('X-RestLi-Id') || 'unknown';
  return { id: postId };
}

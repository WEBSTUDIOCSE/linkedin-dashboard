/**
 * LinkedIn OAuth 2.0 + UGC Posts API helpers
 *
 * Scopes required: openid profile w_member_social
 */

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';
const LINKEDIN_PROFILE_URL = 'https://api.linkedin.com/v2/userinfo';
const LINKEDIN_ASSETS_URL = 'https://api.linkedin.com/v2/assets?action=registerUpload';

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
}

export interface LinkedInProfile {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
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
    client_id: clientId!,
    redirect_uri: redirectUri!,
    state,
    scope: 'openid profile w_member_social',
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
 * Register an image upload with LinkedIn and return the upload URL + asset URN.
 */
async function registerImageUpload(
  accessToken: string,
  authorUrn: string,
): Promise<{ uploadUrl: string; assetUrn: string }> {
  const body = {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner: authorUrn,
      serviceRelationships: [
        {
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        },
      ],
    },
  };

  const res = await fetch(LINKEDIN_ASSETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn register upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const uploadUrl = data.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const assetUrn = data.value?.asset;

  if (!uploadUrl || !assetUrn) {
    throw new Error(`LinkedIn register upload returned unexpected format: ${JSON.stringify(data)}`);
  }

  return { uploadUrl, assetUrn };
}

/**
 * Upload a single image binary to LinkedIn's upload URL.
 */
async function uploadImageBinary(uploadUrl: string, accessToken: string, imageBuffer: Buffer): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn image upload failed (${res.status}): ${text}`);
  }
}

/**
 * Upload multiple carousel slide images to LinkedIn.
 * Returns array of asset URNs in order.
 */
export async function uploadCarouselImages(
  accessToken: string,
  authorUrn: string,
  imageBuffers: Buffer[],
): Promise<string[]> {
  const assetUrns: string[] = [];

  for (let i = 0; i < imageBuffers.length; i++) {
    const { uploadUrl, assetUrn } = await registerImageUpload(accessToken, authorUrn);
    await uploadImageBinary(uploadUrl, accessToken, imageBuffers[i]!);
    assetUrns.push(assetUrn);
  }

  return assetUrns;
}

/**
 * Publish a post to LinkedIn.
 * - If carouselImageUrls provided: uploads images as CAROUSEL post
 * - If pdfUrl provided: posts as ARTICLE with link
 * - Otherwise: text-only post
 */
export async function postToLinkedIn(
  accessToken: string,
  authorUrn: string,
  text: string,
  options?: {
    pdfUrl?: string;
    carouselAssetUrns?: string[];
  },
): Promise<LinkedInPostResult> {
  const isCarousel = options?.carouselAssetUrns && options.carouselAssetUrns.length > 0;
  const isArticle = !isCarousel && options?.pdfUrl;

  const media = isCarousel
    ? options!.carouselAssetUrns!.map((assetUrn, index) => ({
        status: 'READY',
        description: { text: `Slide ${index + 1}` },
        media: assetUrn,
        title: { text: `Slide ${index + 1}` },
      }))
    : isArticle
      ? [
          {
            status: 'READY',
            originalUrl: options!.pdfUrl,
          },
        ]
      : [];

  const body: Record<string, unknown> = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: isCarousel ? 'IMAGE' : isArticle ? 'ARTICLE' : 'NONE',
        ...(media.length > 0 && { media }),
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

  const postId = res.headers.get('x-restli-id') || res.headers.get('X-RestLi-Id') || 'unknown';
  return { id: postId };
}

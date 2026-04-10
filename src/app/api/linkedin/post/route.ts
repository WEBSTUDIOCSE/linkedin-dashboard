/**
 * LinkedIn UGC Post Route Handler
 *
 * POST /api/linkedin/post
 * Body: { postId, title, postContent, hashtags, pdfUrl, slideImageUrls }
 *
 * If slideImageUrls: downloads images → uploads to LinkedIn as CAROUSEL
 * Else if pdfUrl: posts as ARTICLE link
 * Else: text-only post
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { postToLinkedIn, uploadCarouselImages } from '@/lib/linkedin';

interface PostRequestBody {
  postId?: string;
  title?: string;
  postContent?: string;
  hashtags?: string[];
  pdfUrl?: string;
  slideImageUrls?: string[];
}

export async function POST(request: NextRequest) {
  const serverUser = await getCurrentUser();
  if (!serverUser) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: PostRequestBody;
  try {
    body = (await request.json()) as PostRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, postContent, hashtags, pdfUrl, slideImageUrls } = body;

  // Load LinkedIn token from Firestore
  getAdminAuth();
  const adminDb = getFirestore();
  const userDoc = await adminDb.collection('users').doc(serverUser.uid).get();
  const userData = userDoc.data();

  const accessToken = userData?.linkedInAccessToken as string | undefined;
  const authorUrn = userData?.linkedInUrn as string | undefined;

  if (!accessToken || !authorUrn) {
    return NextResponse.json(
      { success: false, error: 'LinkedIn account is not connected.' },
      { status: 400 },
    );
  }

  // Build post text
  const parts: string[] = [];
  if (title) parts.push(title);
  if (postContent) parts.push(postContent);
  if (hashtags && hashtags.length > 0) parts.push(hashtags.join(' '));
  const text = parts.join('\n\n');

  try {
    let carouselAssetUrns: string[] | undefined;

    // If we have slide images, download and upload as carousel
    if (slideImageUrls && slideImageUrls.length > 0) {
      // Download each image
      const imageBuffers: Buffer[] = [];
      for (const url of slideImageUrls) {
        const imgRes = await fetch(url);
        if (!imgRes.ok) {
          return NextResponse.json(
            { success: false, error: `Failed to download slide image: ${url}` },
            { status: 500 },
          );
        }
        const arrayBuffer = await imgRes.arrayBuffer();
        imageBuffers.push(Buffer.from(arrayBuffer));
      }

      // Upload images to LinkedIn
      carouselAssetUrns = await uploadCarouselImages(accessToken, authorUrn, imageBuffers);
    }

    const result = await postToLinkedIn(accessToken, authorUrn, text, {
      pdfUrl: !carouselAssetUrns && pdfUrl ? pdfUrl : undefined,
      carouselAssetUrns,
    });

    // Update post status in Firestore
    if (body.postId) {
      await adminDb.collection('posts').doc(body.postId).update({ status: 'published' });
    }

    return NextResponse.json({ success: true, linkedInPostId: result.id });
  } catch (err) {
    console.error('[LinkedIn Post] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to post to LinkedIn';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

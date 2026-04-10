'use client';

import { useState } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PDFViewer from './PDFViewer';
import {
  FileText,
  Linkedin,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export interface Post {
  id: string;
  title: string;
  postContent?: string;
  hashtags?: string[];
  pdfUrl: string;
  slideImageUrls?: string[];
  status: 'draft' | 'published' | 'scheduled' | string;
  createdAt: { toDate: () => Date } | Date | string | null;
}

interface PostCardProps {
  post: Post;
  linkedInConnected: boolean;
}

const STATUS_MAP: Record<
  string,
  { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  published: { label: 'Published', icon: CheckCircle2, variant: 'default' },
  draft: { label: 'Draft', icon: Clock, variant: 'secondary' },
  scheduled: { label: 'Scheduled', icon: Calendar, variant: 'outline' },
  failed: { label: 'Failed', icon: AlertCircle, variant: 'destructive' },
};

function formatDate(createdAt: Post['createdAt']): string {
  if (!createdAt) return '—';
  let date: Date;
  if (typeof createdAt === 'string') {
    date = new Date(createdAt);
  } else if (createdAt instanceof Date) {
    date = createdAt;
  } else if (typeof (createdAt as { toDate?: () => Date }).toDate === 'function') {
    date = (createdAt as { toDate: () => Date }).toDate();
  } else {
    return '—';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PostCard({ post, linkedInConnected }: PostCardProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const statusInfo = STATUS_MAP[post.status] ?? {
    label: post.status,
    icon: Clock,
    variant: 'secondary' as const,
  };
  const StatusIcon = statusInfo.icon;

  const handlePostToLinkedIn = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!linkedInConnected) {
      toast.error('Connect your LinkedIn account first');
      return;
    }
    setPosting(true);
    try {
      const res = await fetch('/api/linkedin/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          title: post.title,
          postContent: post.postContent || '',
          hashtags: post.hashtags || [],
          pdfUrl: post.pdfUrl,
          slideImageUrls: post.slideImageUrls || [],
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Failed to post to LinkedIn');
      } else {
        toast.success('Posted to LinkedIn successfully!');
      }
    } catch {
      toast.error('An error occurred while posting');
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <Card
        className="group cursor-pointer overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-border/60"
        onClick={() => setViewerOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setViewerOpen(true)}
      >
        {/* PDF thumbnail area */}
        <div className="relative bg-muted/40 flex items-center justify-center h-44 border-b border-border/40 overflow-hidden">
          {post.pdfUrl ? (
            <>
              {/* Decorative lines mimicking a PDF page */}
              <div className="absolute inset-4 rounded border border-border/30 bg-background/60 flex flex-col gap-2 p-3 pointer-events-none">
                <div className="h-1.5 w-3/4 rounded-full bg-muted-foreground/15" />
                <div className="h-1.5 w-full rounded-full bg-muted-foreground/10" />
                <div className="h-1.5 w-5/6 rounded-full bg-muted-foreground/10" />
                <div className="h-1.5 w-full rounded-full bg-muted-foreground/10" />
                <div className="h-1.5 w-4/5 rounded-full bg-muted-foreground/10" />
                <div className="mt-1 h-1.5 w-2/3 rounded-full bg-muted-foreground/10" />
                <div className="h-1.5 w-full rounded-full bg-muted-foreground/10" />
              </div>
              <FileText
                className="relative z-10 h-10 w-10 text-[#0A66C2]/70 group-hover:text-[#0A66C2] transition-colors duration-200"
                strokeWidth={1.5}
              />
            </>
          ) : (
            <div className="absolute inset-3 rounded border border-border/30 bg-background/60 p-3 pointer-events-none overflow-hidden">
              <p className="text-[10px] leading-relaxed text-muted-foreground/60 line-clamp-[8]">
                {post.postContent?.substring(0, 200) || 'Text post'}
              </p>
            </div>
          )}
        </div>

        <CardContent className="pt-4 pb-3 px-4">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground group-hover:text-[#0A66C2] transition-colors duration-150">
            {post.title}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{formatDate(post.createdAt)}</span>
          </div>
        </CardContent>

        <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between gap-2">
          <Badge
            variant={statusInfo.variant}
            className="gap-1 text-xs font-medium px-2 py-0.5"
          >
            <StatusIcon className="h-3 w-3" />
            {statusInfo.label}
          </Badge>

          <Button
            size="sm"
            variant={linkedInConnected ? 'default' : 'outline'}
            className={`gap-1.5 text-xs h-7 px-3 shrink-0 ${
              linkedInConnected
                ? 'bg-[#0A66C2] hover:bg-[#004182] text-white border-transparent'
                : 'text-muted-foreground'
            }`}
            onClick={handlePostToLinkedIn}
            disabled={posting}
            title={linkedInConnected ? 'Post to LinkedIn' : 'Connect LinkedIn to post'}
          >
            {posting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Linkedin className="h-3 w-3" />
            )}
            {posting ? 'Posting…' : 'Post'}
          </Button>
        </CardFooter>
      </Card>

      {(viewerOpen && post.pdfUrl) ? (
        <PDFViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          title={post.title}
          pdfUrl={post.pdfUrl}
        />
      ) : (viewerOpen && post.postContent) ? (
        <PDFViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          title={post.title}
          pdfUrl=""
          postContent={post.postContent}
          hashtags={post.hashtags}
        />
      ) : null}
    </>
  );
}

export function PostCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/60">
      <div className="h-44 bg-muted/40 border-b border-border/40" />
      <CardContent className="pt-4 pb-3 px-4">
        <Skeleton className="h-4 w-3/4 mb-1.5" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-24 mt-2" />
      </CardContent>
      <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-md" />
      </CardFooter>
    </Card>
  );
}

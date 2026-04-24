import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const redis = Redis.fromEnv();

const IDEMPOTENT_TTL_MS = 500;

function getIdempotentKey(userId: string, tweetId: string) {
  return `like:toggle:${userId}:${tweetId}`;
}

async function acquireLock(
  userId: string,
  tweetId: string,
): Promise<{ acquired: boolean }> {
  const key = getIdempotentKey(userId, tweetId);

  const result = await redis.set(key, "processing", {
    nx: true,
    px: IDEMPOTENT_TTL_MS,
  });

  return { acquired: result !== null };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id") || undefined;

  const userIdSchema = z.string().cuid();
  const zod = userIdSchema.safeParse(user_id);

  if (!zod.success) {
    return NextResponse.json(
      {
        message: "Invalid request body",
        error: zod.error.formErrors,
      },
      { status: 400 },
    );
  }

  try {
    const tweets = await prisma.tweet.findMany({
      where: {
        likes: {
          some: {
            user_id,
          },
        },
      },

      include: {
        author: true,
        media: true,
        likes: true,
        retweets: true,
        comments: true,
      },
    });

    return NextResponse.json(tweets, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: "Something went wrong",
        error: error.message,
      },
      { status: error.errorCode || 500 },
    );
  }
}

export async function POST(request: Request) {
  const { tweet_id, user_id } = (await request.json()) as {
    tweet_id: string;
    user_id: string;
  };

  const likeSchema = z
    .object({
      tweet_id: z.string().cuid(),
      user_id: z.string().cuid(),
    })
    .strict();

  const zod = likeSchema.safeParse({ tweet_id, user_id });

  if (!zod.success) {
    return NextResponse.json(
      {
        message: "Invalid request body",
        error: zod.error.formErrors,
      },
      { status: 400 },
    );
  }

  try {
    const lockResult = await acquireLock(user_id, tweet_id);

    if (!lockResult.acquired) {
      return NextResponse.json(
        {
          message: "Request is being processed, please try again later",
        },
        { status: 429 },
      );
    }

    const tweet = await prisma.tweet.findUnique({
      where: { id: tweet_id },
      select: { id: true },
    });

    if (!tweet) {
      return NextResponse.json({ message: "Tweet not found" }, { status: 404 });
    }

    const existingLike = await prisma.like.findFirst({
      where: {
        tweet_id,
        user_id,
      },
    });

    if (existingLike) {
      const result = await prisma.$transaction(async (tx) => {
        await tx.like.delete({
          where: { id: existingLike.id },
        });

        const updateResult = await tx.tweet.updateMany({
          where: {
            id: tweet_id,
            favorite_count: { gt: 0 },
          },
          data: {
            favorite_count: {
              decrement: 1,
            },
          },
        });

        return {
          message: "Tweet unliked",
          countUpdated: updateResult.count > 0,
        };
      });

      return NextResponse.json({ message: result.message });
    } else {
      const result = await prisma.$transaction(async (tx) => {
        const newLike = await tx.like.create({
          data: {
            tweet_id,
            user_id,
          },
        });

        await tx.tweet.update({
          where: { id: tweet_id },
          data: {
            favorite_count: {
              increment: 1,
            },
          },
        });

        return { message: "Tweet liked", like: newLike };
      });

      return NextResponse.json({ message: result.message });
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        message: "Something went wrong",
        error: error.message,
      },
      { status: error.errorCode || 500 },
    );
  }
}

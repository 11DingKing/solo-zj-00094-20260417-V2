import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const IDEMPOTENT_TTL_MS = 500;

interface IdempotentCacheEntry {
  result: string;
  timestamp: number;
  processing: boolean;
}

const memoryCache = new Map<string, IdempotentCacheEntry>();

function getMemoryKey(userId: string, tweetId: string) {
  return `${userId}:${tweetId}`;
}

function cleanMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (now - entry.timestamp > IDEMPOTENT_TTL_MS) {
      memoryCache.delete(key);
    }
  }
}

async function checkMemoryCache(
  userId: string,
  tweetId: string,
): Promise<{
  isDuplicate: boolean;
  cachedResult?: string;
  isProcessing: boolean;
}> {
  cleanMemoryCache();

  const key = getMemoryKey(userId, tweetId);
  const entry = memoryCache.get(key);

  if (!entry) {
    return { isDuplicate: false, isProcessing: false };
  }

  const now = Date.now();
  if (now - entry.timestamp > IDEMPOTENT_TTL_MS) {
    memoryCache.delete(key);
    return { isDuplicate: false, isProcessing: false };
  }

  if (entry.processing) {
    return { isDuplicate: true, isProcessing: true };
  }

  return { isDuplicate: true, cachedResult: entry.result, isProcessing: false };
}

function setMemoryProcessing(userId: string, tweetId: string) {
  const key = getMemoryKey(userId, tweetId);
  memoryCache.set(key, {
    result: "",
    timestamp: Date.now(),
    processing: true,
  });
}

function setMemoryResult(userId: string, tweetId: string, result: string) {
  const key = getMemoryKey(userId, tweetId);
  memoryCache.set(key, {
    result,
    timestamp: Date.now(),
    processing: false,
  });
}

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  try {
    if (
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
    ) {
      redis = Redis.fromEnv();
      return redis;
    }
  } catch {
    // Redis not available, fall back to memory cache
  }

  return null;
}

function getRedisKey(userId: string, tweetId: string) {
  return `like:idempotent:${userId}:${tweetId}`;
}

async function checkRedisCache(
  userId: string,
  tweetId: string,
): Promise<{
  isDuplicate: boolean;
  cachedResult?: string;
  isProcessing: boolean;
}> {
  const r = getRedis();
  if (!r) {
    return { isDuplicate: false, isProcessing: false };
  }

  try {
    const key = getRedisKey(userId, tweetId);
    const value = await r.get<string>(key);

    if (!value) {
      return { isDuplicate: false, isProcessing: false };
    }

    if (value === "processing") {
      return { isDuplicate: true, isProcessing: true };
    }

    return { isDuplicate: true, cachedResult: value, isProcessing: false };
  } catch {
    return { isDuplicate: false, isProcessing: false };
  }
}

async function setRedisProcessing(
  userId: string,
  tweetId: string,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;

  try {
    const key = getRedisKey(userId, tweetId);
    const result = await r.set(key, "processing", {
      nx: true,
      px: IDEMPOTENT_TTL_MS,
    });
    return result !== null;
  } catch {
    return false;
  }
}

async function setRedisResult(userId: string, tweetId: string, result: string) {
  const r = getRedis();
  if (!r) return;

  try {
    const key = getRedisKey(userId, tweetId);
    await r.set(key, result, { px: IDEMPOTENT_TTL_MS });
  } catch {
    // Ignore Redis errors
  }
}

async function acquireIdempotentLock(
  userId: string,
  tweetId: string,
): Promise<{ acquired: boolean; cachedResult?: string }> {
  const memoryCheck = await checkMemoryCache(userId, tweetId);
  if (memoryCheck.isDuplicate) {
    if (memoryCheck.isProcessing) {
      return { acquired: false };
    }
    return { acquired: false, cachedResult: memoryCheck.cachedResult };
  }

  const redisCheck = await checkRedisCache(userId, tweetId);
  if (redisCheck.isDuplicate) {
    if (redisCheck.isProcessing) {
      return { acquired: false };
    }
    return { acquired: false, cachedResult: redisCheck.cachedResult };
  }

  setMemoryProcessing(userId, tweetId);
  await setRedisProcessing(userId, tweetId);

  return { acquired: true };
}

async function setIdempotentResult(
  userId: string,
  tweetId: string,
  result: string,
) {
  setMemoryResult(userId, tweetId, result);
  await setRedisResult(userId, tweetId, result);
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
    const idempotentCheck = await acquireIdempotentLock(user_id, tweet_id);

    if (!idempotentCheck.acquired) {
      if (idempotentCheck.cachedResult === "Tweet liked") {
        return NextResponse.json({ message: "Tweet liked" });
      }
      if (idempotentCheck.cachedResult === "Tweet unliked") {
        return NextResponse.json({ message: "Tweet unliked" });
      }
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

    let resultMessage: string;

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

      resultMessage = result.message;
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

      resultMessage = result.message;
    }

    await setIdempotentResult(user_id, tweet_id, resultMessage);
    return NextResponse.json({ message: resultMessage });
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

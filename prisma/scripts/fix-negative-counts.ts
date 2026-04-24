import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting to fix negative counts...");

  const negativeFavoriteCountTweets = await prisma.tweet.findMany({
    where: {
      favorite_count: { lt: 0 },
    },
    select: { id: true, favorite_count: true },
  });

  const negativeRetweetCountTweets = await prisma.tweet.findMany({
    where: {
      retweet_count: { lt: 0 },
    },
    select: { id: true, retweet_count: true },
  });

  console.log(
    `Found ${negativeFavoriteCountTweets.length} tweets with negative favorite_count`,
  );
  console.log(
    `Found ${negativeRetweetCountTweets.length} tweets with negative retweet_count`,
  );

  if (negativeFavoriteCountTweets.length > 0) {
    console.log("Fixing favorite_count...");
    const favoriteResult = await prisma.tweet.updateMany({
      where: {
        favorite_count: { lt: 0 },
      },
      data: {
        favorite_count: 0,
      },
    });
    console.log(`Fixed ${favoriteResult.count} tweets' favorite_count to 0`);
  }

  if (negativeRetweetCountTweets.length > 0) {
    console.log("Fixing retweet_count...");
    const retweetResult = await prisma.tweet.updateMany({
      where: {
        retweet_count: { lt: 0 },
      },
      data: {
        retweet_count: 0,
      },
    });
    console.log(`Fixed ${retweetResult.count} tweets' retweet_count to 0`);
  }

  console.log("Verifying counts with actual records...");

  const allTweets = await prisma.tweet.findMany({
    select: {
      id: true,
      favorite_count: true,
      retweet_count: true,
      _count: {
        select: {
          likes: true,
          retweets: true,
        },
      },
    },
  });

  let mismatchedFavorites = 0;
  let mismatchedRetweets = 0;

  for (const tweet of allTweets) {
    const actualLikes = tweet._count.likes;
    const actualRetweets = tweet._count.retweets;

    if (tweet.favorite_count !== actualLikes) {
      mismatchedFavorites++;
      console.log(
        `Tweet ${tweet.id}: favorite_count=${tweet.favorite_count}, actual likes=${actualLikes}`,
      );
    }

    if (tweet.retweet_count !== actualRetweets) {
      mismatchedRetweets++;
      console.log(
        `Tweet ${tweet.id}: retweet_count=${tweet.retweet_count}, actual retweets=${actualRetweets}`,
      );
    }
  }

  if (mismatchedFavorites > 0 || mismatchedRetweets > 0) {
    console.log(
      `Found ${mismatchedFavorites} tweets with mismatched favorite_count`,
    );
    console.log(
      `Found ${mismatchedRetweets} tweets with mismatched retweet_count`,
    );
    console.log(
      "Consider running a full reconciliation to sync counts with actual records.",
    );
  } else {
    console.log("All counts match actual records!");
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

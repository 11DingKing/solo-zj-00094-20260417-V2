import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const voteSchema = z.object({
      poll_id: z.string().cuid(),
      option_id: z.string().cuid(),
    });

    const zod = voteSchema.safeParse(body);

    if (!zod.success) {
      return NextResponse.json(
        {
          message: "Invalid request body",
          error: zod.error.formErrors,
        },
        { status: 400 },
      );
    }

    const { poll_id, option_id } = zod.data;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: poll_id },
      include: {
        options: true,
        votes: {
          where: { user_id: user.id },
        },
      },
    });

    if (!poll) {
      return NextResponse.json({ message: "Poll not found" }, { status: 404 });
    }

    const now = new Date();
    if (poll.expires_at < now) {
      return NextResponse.json(
        { message: "Poll has expired" },
        { status: 400 },
      );
    }

    const option = poll.options.find((o) => o.id === option_id);
    if (!option) {
      return NextResponse.json(
        { message: "Option not found in this poll" },
        { status: 404 },
      );
    }

    if (poll.votes.length > 0) {
      const existingVote = poll.votes[0];
      return NextResponse.json(
        {
          message: "You have already voted",
          vote: existingVote,
          poll: {
            ...poll,
            totalVotes: poll.options.reduce((sum, o) => sum + o.votes_count, 0),
            isExpired: poll.expires_at < now,
            userVote: existingVote,
          },
        },
        { status: 200 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const vote = await tx.pollVote.create({
        data: {
          poll_id,
          option_id,
          user_id: user.id,
        },
      });

      await tx.pollOption.update({
        where: { id: option_id },
        data: {
          votes_count: {
            increment: 1,
          },
        },
      });

      const updatedPoll = await tx.poll.findUnique({
        where: { id: poll_id },
        include: {
          options: true,
          votes: {
            where: { user_id: user.id },
          },
        },
      });

      return { vote, poll: updatedPoll };
    });

    const totalVotes = result.poll!.options.reduce(
      (sum, o) => sum + o.votes_count,
      0,
    );

    return NextResponse.json(
      {
        message: "Vote cast successfully",
        vote: result.vote,
        poll: {
          ...result.poll,
          totalVotes,
          isExpired: result.poll!.expires_at < now,
          userVote: result.vote,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Poll vote error:", error);
    return NextResponse.json(
      {
        message: "Something went wrong",
        error: error.message,
      },
      { status: error.errorCode || 500 },
    );
  }
}

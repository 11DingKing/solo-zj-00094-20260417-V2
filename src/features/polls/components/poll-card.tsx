"use client";
import type { Poll, PollOption } from "@prisma/client";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";

import { TickIcon } from "@/assets/tick-svg";

import { useVote } from "..";

import styles from "./styles/poll-card.module.scss";

interface PollCardProps {
  poll: Poll & {
    options: PollOption[];
  };
  tweetId?: string;
}

export const PollCard = ({ poll }: PollCardProps) => {
  const { data: session } = useSession();
  const mutation = useVote();

  const [userVoteOptionId, setUserVoteOptionId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const now = new Date();
    setIsExpired(new Date(poll.expires_at) < now);
  }, [poll.expires_at]);

  const totalVotes = poll.options.reduce(
    (sum: number, option: PollOption) => sum + option.votes_count,
    0,
  );

  const handleVote = useCallback(
    async (optionId: string) => {
      if (!session?.user?.id || hasVoted || isExpired) return;

      try {
        const result = await mutation.mutateAsync({
          pollId: poll.id,
          optionId,
        });

        if (result && result.vote) {
          setUserVoteOptionId(result.vote.option_id);
          setHasVoted(true);
        }
      } catch (error) {
        console.error("Vote error:", error);
      }
    },
    [session?.user?.id, hasVoted, isExpired, poll.id, mutation],
  );

  const getPercentage = (votes: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  const showResults = hasVoted || isExpired;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={styles.container}
    >
      <div className={styles.optionsContainer}>
        <AnimatePresence mode="wait">
          {poll.options.map((option: PollOption, index: number) => {
            const isUserVote = userVoteOptionId === option.id;
            const percentage = getPercentage(option.votes_count);

            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                type="button"
                onClick={() => !showResults && handleVote(option.id)}
                disabled={showResults || mutation.isPending}
                className={`${styles.optionButton} ${
                  isUserVote ? styles.optionProgressVoted : ""
                }`}
              >
                {showResults && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className={`${styles.optionProgress} ${
                      isUserVote ? styles.optionProgressVoted : ""
                    }`}
                  />
                )}

                <div className={styles.optionContent}>
                  <span
                    className={`${styles.optionText} ${
                      isUserVote ? styles.optionTextVoted : ""
                    }`}
                  >
                    {isUserVote && <TickIcon />}
                    {option.text}
                  </span>
                  {showResults && (
                    <span className={styles.optionPercentage}>
                      {percentage}%
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <div className={styles.footer}>
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"} ·
        {isExpired
          ? " Final results"
          : ` Expires in ${Math.ceil(
              (new Date(poll.expires_at).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            )} days`}
      </div>
    </motion.div>
  );
};

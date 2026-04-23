import { useMutation, useQueryClient } from "@tanstack/react-query";

import { castVote } from "../api/cast-vote";

export const useVote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pollId,
      optionId,
    }: {
      pollId: string;
      optionId: string;
    }) => {
      return castVote({ pollId, optionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tweets"] });
    },
    onError: (error) => {
      console.log("vote error", error);
    },
  });
};

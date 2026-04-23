import type { Poll, PollOption, PollVote } from "@prisma/client";

import { IUser } from "@/features/profile";

export interface IPoll extends Poll {
  options: IPollOption[];
  votes: IPollVote[];
  tweet?: any;
}

export interface IPollOption extends PollOption {
  poll: IPoll;
  votes: IPollVote[];
}

export interface IPollVote extends PollVote {
  poll: IPoll;
  option: IPollOption;
  user: IUser;
}

export interface IPollWithResults extends IPoll {
  totalVotes: number;
  userVote?: IPollVote | null;
  isExpired: boolean;
}

export interface ICreatePollData {
  options: string[];
  duration: 1 | 3 | 7;
}

import axios from "axios";

export const castVote = async ({
  pollId,
  optionId,
}: {
  pollId: string;
  optionId: string;
}) => {
  try {
    const response = await axios.post("/api/polls", {
      poll_id: pollId,
      option_id: optionId,
    });
    const data = response.data;
    return data;
  } catch (error: any) {
    return error.response?.data || { message: error.message };
  }
};

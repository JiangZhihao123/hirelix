import { z } from "zod";

export const feedbackResponses = ["interview", "hold", "decline", "comment"] as const;
export const feedbackLabels: Record<(typeof feedbackResponses)[number], string> = {
  interview: "Would like to interview",
  hold: "Keep on hold",
  decline: "Not proceeding for this role",
  comment: "Additional feedback",
};
export const recommendationFeedbackContext = z.object({
  recommendation_id: z.uuid(),
  response: z.enum(feedbackResponses),
});
export const recommendationFeedbackInput = z.object({
  request_key: z.uuid(),
  person_id: z.uuid(),
  response: z.enum(feedbackResponses),
  name: z.string().trim().min(1).max(120),
  comment: z.string().trim().max(4000),
}).refine(input => input.response !== "comment" || !!input.comment, "Write your feedback");

import { z } from "zod";
import { roleInput, recordInput } from "./types";

export const recordChangesSchema = z.object({
  source_url: recordInput.shape.source_url.nullable().default(null).describe("Preserve the exact original source URL. Null leaves it unchanged; empty string clears it."),
  title: z.string().min(1).max(300).nullable(),
  content: z.string().min(1).max(100000).nullable(),
  occurred_at: z.union([z.iso.datetime({ offset: true }), z.literal("")]).nullable(),
  occurred_on: z.union([z.iso.date(), z.literal("")]).nullable().default(null),
}).refine(value => Object.values(value).some(item => item !== null), "Specify the record fields to change");
const contactFields = roleInput.shape.client_contact.unwrap().shape;
export const roleChangesSchema = z.object({
  title: roleInput.shape.title.nullable().default(null),
  client_name: roleInput.shape.client_name.nullable().default(null),
  status: roleInput.shape.status.nullable().default(null),
  client_contact: z.object({
    name: contactFields.name.nullable().default(null),
    email: contactFields.email.nullable().default(null),
    cooperation: contactFields.cooperation.nullable().default(null),
    location: contactFields.location.nullable().default(null),
    compensation: contactFields.compensation.nullable().default(null),
  }).nullable().default(null),
});

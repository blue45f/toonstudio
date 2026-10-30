import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_SUBJECT_MAX_LENGTH,
} from "@toonstudio/contracts/customer-support";

export const supportStatusSchema = z.enum(["ai", "waiting", "open", "closed"]);
export const createSupportSchema = z.object({
  subject: z.string().trim().min(2).max(SUPPORT_SUBJECT_MAX_LENGTH),
  mode: z.enum(["ai", "human"]),
}).strict();
export const sendSupportSchema = z.object({
  content: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX_LENGTH),
  clientMessageId: z.string().uuid(),
}).strict();
export const supportParamsSchema = z.object({ id: z.string().uuid() });
export const supportListSchema = z.object({
  status: supportStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict();
export const adminSupportStatusSchema = z.object({ status: z.enum(["open", "closed"]) }).strict();

export class CreateSupportDto extends createZodDto(createSupportSchema) {}
export class SendSupportDto extends createZodDto(sendSupportSchema) {}
export class SupportParamsDto extends createZodDto(supportParamsSchema) {}
export class SupportListDto extends createZodDto(supportListSchema) {}
export class AdminSupportStatusDto extends createZodDto(adminSupportStatusSchema) {}

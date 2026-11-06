import { z } from "zod";
import { orderStatusSchema } from "./marketplace.js";

export const customerOrderStatusEventSchema = z
  .object({
    status: orderStatusSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const customerOrderStatusResponseSchema = z
  .object({
    orderNumber: z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
    status: orderStatusSchema,
    updatedAt: z.iso.datetime(),
    events: z.array(customerOrderStatusEventSchema),
  })
  .strict();

export type CustomerOrderStatusEvent = z.infer<typeof customerOrderStatusEventSchema>;
export type CustomerOrderStatusResponse = z.infer<typeof customerOrderStatusResponseSchema>;

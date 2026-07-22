import { z } from 'zod';

export const shopSchema = z.object({
  name: z.string().min(1, 'Shop name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric and hyphens only'),
  description: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  custom_description: z.string().optional(),
  x_account_id: z.string().optional(),
  instagram_account_id: z.string().optional(),
});

export const shopRegistrationSchema = shopSchema.omit({
  slug: true,
});

export const shopEditSchema = shopSchema.omit({
  slug: true,
});

export const jobPostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  employment_type: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  status: z.enum(['draft', 'open', 'closed', 'archived']),
  application_deadline: z.string().optional().nullable(),
  published_at: z.string().min(1, 'Publishing date is required'),
  shop_id: z.string().uuid().optional(),
});

export const jobApplicationSchema = z.object({
  job_post_id: z.string().uuid(),
  message: z.string().min(5, 'Message must be at least 5 characters').optional(),
});

export const applicationStatusSchema = z.object({
  status: z.enum(['pending', 'reviewing', 'accepted', 'rejected']),
});

export type ShopInput = z.infer<typeof shopSchema>;
export type ShopRegistrationInput = z.infer<typeof shopRegistrationSchema>;
export type ShopEditInput = z.infer<typeof shopEditSchema>;
export type JobPostInput = z.infer<typeof jobPostSchema>;
export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;
export type ApplicationStatusInput = z.infer<typeof applicationStatusSchema>;

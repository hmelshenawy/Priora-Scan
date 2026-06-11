import { z } from 'zod';

const CURRENT_YEAR = new Date().getFullYear();

const vinRefinement = z
  .string()
  .optional()
  .refine(
    (val) => !val || (/^[A-Za-z0-9]+$/.test(val) && val.length >= 3 && val.length <= 25),
    {
      message: 'VIN must be alphanumeric and between 3 and 25 characters.',
    },
  );

const plateRefinement = z
  .string()
  .optional()
  .refine((val) => !val || (val.length >= 1 && val.length <= 20), {
    message: 'Plate number must be between 1 and 20 characters.',
  });

const engineRefinement = z
  .string()
  .optional()
  .refine((val) => !val || (val.length >= 1 && val.length <= 100), {
    message: 'Engine must be between 1 and 100 characters.',
  });

const bodyStyleRefinement = z
  .string()
  .optional()
  .refine((val) => !val || (val.length >= 1 && val.length <= 100), {
    message: 'Body style must be between 1 and 100 characters.',
  });

export const createVehicleSchema = z.object({
  make: z.string().min(1, 'Make is required').max(100, 'Make must be 100 characters or less'),
  model: z.string().min(1, 'Model is required').max(100, 'Model must be 100 characters or less'),
  year: z.coerce
    .number()
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(CURRENT_YEAR + 1, `Year must be ${CURRENT_YEAR + 1} or earlier`),
  vin: vinRefinement,
  plateNumber: plateRefinement,
  engine: engineRefinement,
  bodyStyle: bodyStyleRefinement,
});

export const updateVehicleSchema = z.object({
  make: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  year: z.coerce.number().int().min(1900).max(CURRENT_YEAR + 1).optional(),
  vin: z.union([z.literal(''), vinRefinement]).optional(),
  plateNumber: z.union([z.literal(''), plateRefinement]).optional(),
  engine: z.union([z.literal(''), engineRefinement]).optional(),
  bodyStyle: z.union([z.literal(''), bodyStyleRefinement]).optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

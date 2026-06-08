'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createVehicleSchema,
  updateVehicleSchema,
  CreateVehicleInput,
  UpdateVehicleInput,
} from '../../lib/validators/vehicle.schema';
import { Vehicle } from '../../hooks/use-vehicles';

interface VehicleFormProps {
  mode: 'create' | 'edit';
  vehicle?: Vehicle;
  onSubmit: (data: CreateVehicleInput | UpdateVehicleInput) => void;
  isSubmitting?: boolean;
}

export function VehicleForm({ mode, vehicle, onSubmit, isSubmitting }: VehicleFormProps) {
  const isEdit = mode === 'edit';
  const schema = isEdit ? updateVehicleSchema : createVehicleSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateVehicleInput & UpdateVehicleInput>({
    resolver: zodResolver(schema),
    defaultValues: isEdit
      ? {
          make: vehicle?.make ?? '',
          model: vehicle?.model ?? '',
          year: vehicle?.year ?? new Date().getFullYear(),
          vin: vehicle?.vin ?? '',
          plateNumber: vehicle?.plateNumber ?? '',
        }
      : {
          make: '',
          model: '',
          year: new Date().getFullYear(),
          vin: '',
          plateNumber: '',
        },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <div>
        <label htmlFor="make" className="block text-sm font-medium text-gray-700">
          Make {isEdit ? '' : '*'}
        </label>
        <input
          id="make"
          type="text"
          {...register('make')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          placeholder="e.g. Toyota"
        />
        {errors.make && (
          <p className="mt-1 text-sm text-red-600">{errors.make.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="model" className="block text-sm font-medium text-gray-700">
          Model {isEdit ? '' : '*'}
        </label>
        <input
          id="model"
          type="text"
          {...register('model')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          placeholder="e.g. Corolla"
        />
        {errors.model && (
          <p className="mt-1 text-sm text-red-600">{errors.model.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="year" className="block text-sm font-medium text-gray-700">
          Year {isEdit ? '' : '*'}
        </label>
        <input
          id="year"
          type="number"
          {...register('year', { valueAsNumber: true })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          placeholder="e.g. 2022"
        />
        {errors.year && (
          <p className="mt-1 text-sm text-red-600">{errors.year.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="vin" className="block text-sm font-medium text-gray-700">
          VIN
        </label>
        <input
          id="vin"
          type="text"
          {...register('vin')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          placeholder="Optional"
        />
        {errors.vin && (
          <p className="mt-1 text-sm text-red-600">{errors.vin.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="plateNumber" className="block text-sm font-medium text-gray-700">
          Plate Number
        </label>
        <input
          id="plateNumber"
          type="text"
          {...register('plateNumber')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          placeholder="Optional"
        />
        {errors.plateNumber && (
          <p className="mt-1 text-sm text-red-600">{errors.plateNumber.message}</p>
        )}
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? isEdit
              ? 'Saving...'
              : 'Creating...'
            : isEdit
              ? 'Save Changes'
              : 'Create Vehicle'}
        </button>
      </div>
    </form>
  );
}

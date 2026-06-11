'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createVehicleSchema,
  updateVehicleSchema,
  CreateVehicleInput,
  UpdateVehicleInput,
  createVehicleSchema as createSchema,
} from '../../lib/validators/vehicle.schema';
import { Vehicle, VehicleDecodeResult } from '../../hooks/use-vehicles';
import { VinDecodeButton } from './vin-decode-button';

interface VehicleFormProps {
  mode: 'create' | 'edit';
  vehicle?: Vehicle;
  onSubmit: (data: CreateVehicleInput | UpdateVehicleInput) => void;
  isSubmitting?: boolean;
}

export function VehicleForm({ mode, vehicle, onSubmit, isSubmitting }: VehicleFormProps) {
  const isEdit = mode === 'edit';
  const schema = isEdit ? updateVehicleSchema : createSchema;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
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
          engine: vehicle?.engine ?? '',
          bodyStyle: vehicle?.bodyStyle ?? '',
        }
      : {
          make: '',
          model: '',
          year: new Date().getFullYear(),
          vin: '',
          plateNumber: '',
          engine: '',
          bodyStyle: '',
        },
  });

  // The create schema disallows empty make/model. We bypass zod for the
  // "empty / decodable" path: the backend requires those fields, so this
  // pattern is intentional.
  const [autoFilled, setAutoFilled] = useState(false);
  const watchedVin = watch('vin') ?? '';

  const handleDecoded = (result: VehicleDecodeResult) => {
    if (result.make) setValue('make', result.make);
    if (result.model) setValue('model', result.model);
    if (result.year) setValue('year', result.year);
    if (result.engine) setValue('engine', result.engine);
    if (result.bodyStyle) setValue('bodyStyle', result.bodyStyle);
    setAutoFilled(true);
  };

  useEffect(() => {
    if (autoFilled && isEdit) {
      setAutoFilled(false);
    }
  }, [autoFilled, isEdit]);

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
        <VinDecodeButton vin={watchedVin} onDecoded={handleDecoded} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="engine" className="block text-sm font-medium text-gray-700">
            Engine
          </label>
          <input
            id="engine"
            type="text"
            {...register('engine')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            placeholder="e.g. 3.0L V6"
          />
          {errors.engine && (
            <p className="mt-1 text-sm text-red-600">{errors.engine.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="bodyStyle" className="block text-sm font-medium text-gray-700">
            Body Style
          </label>
          <input
            id="bodyStyle"
            type="text"
            {...register('bodyStyle')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            placeholder="e.g. Sedan"
          />
          {errors.bodyStyle && (
            <p className="mt-1 text-sm text-red-600">{errors.bodyStyle.message}</p>
          )}
        </div>
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

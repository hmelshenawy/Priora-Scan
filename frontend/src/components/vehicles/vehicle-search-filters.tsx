'use client';

import { useState, FormEvent } from 'react';

interface Filters {
  search: string;
  make: string;
  model: string;
  year: string;
}

interface VehicleSearchFiltersProps {
  onSearch: (filters: Filters) => void;
}

export function VehicleSearchFilters({ onSearch }: VehicleSearchFiltersProps) {
  const [filters, setFilters] = useState<Filters>({
    search: '',
    make: '',
    model: '',
    year: '',
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  const handleReset = () => {
    const empty = { search: '', make: '', model: '', year: '' };
    setFilters(empty);
    onSearch(empty);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <input
        type="text"
        placeholder="Search..."
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        type="text"
        placeholder="Make"
        value={filters.make}
        onChange={(e) => setFilters({ ...filters, make: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        type="text"
        placeholder="Model"
        value={filters.model}
        onChange={(e) => setFilters({ ...filters, model: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        type="number"
        placeholder="Year"
        value={filters.year}
        onChange={(e) => setFilters({ ...filters, year: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

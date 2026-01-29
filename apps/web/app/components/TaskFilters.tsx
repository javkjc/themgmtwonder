'use client';

import { useState } from 'react';
import { type Filter, type ScheduleFilter, type SortDir, type DateFilter } from '../hooks/useTodos';

type TaskFiltersProps = {
  filter: Filter;
  scheduleFilter: ScheduleFilter;
  sortDir: SortDir;
  dateFilter: DateFilter;
  customDateRange: { start: string; end: string } | null;
  onFilterChange: (filter: Filter) => void;
  onScheduleFilterChange: (scheduleFilter: ScheduleFilter) => void;
  onSortDirChange: (sortDir: SortDir) => void;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onCustomDateRangeChange: (range: { start: string; end: string } | null) => void;
};

type FilterButtonProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 13,
        borderRadius: 6,
        border: active ? 'none' : '1px solid #e2e8f0',
        background: active ? '#3b82f6' : 'white',
        color: active ? 'white' : '#64748b',
        cursor: 'pointer',
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </button>
  );
}

export default function TaskFilters({
  filter,
  scheduleFilter,
  sortDir,
  dateFilter,
  customDateRange,
  onFilterChange,
  onScheduleFilterChange,
  onSortDirChange,
  onDateFilterChange,
  onCustomDateRangeChange,
}: TaskFiltersProps) {
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(customDateRange?.start || '');
  const [tempEndDate, setTempEndDate] = useState(customDateRange?.end || '');

  const handleDateFilterChange = (newFilter: DateFilter) => {
    if (newFilter === 'custom') {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      onCustomDateRangeChange(null);
    }
    onDateFilterChange(newFilter);
  };

  const applyCustomRange = () => {
    if (tempStartDate || tempEndDate) {
      onCustomDateRangeChange({ start: tempStartDate, end: tempEndDate });
    }
    setShowCustomRange(false);
  };

  const clearCustomRange = () => {
    setTempStartDate('');
    setTempEndDate('');
    onCustomDateRangeChange(null);
    onDateFilterChange('all');
    setShowCustomRange(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Status:</span>
          <FilterButton active={filter === 'all'} onClick={() => onFilterChange('all')}>
            All
          </FilterButton>
          <FilterButton active={filter === 'active'} onClick={() => onFilterChange('active')}>
            Active
          </FilterButton>
          <FilterButton active={filter === 'done'} onClick={() => onFilterChange('done')}>
            Done
          </FilterButton>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Schedule:</span>
          <FilterButton active={scheduleFilter === 'all'} onClick={() => onScheduleFilterChange('all')}>
            All
          </FilterButton>
          <FilterButton active={scheduleFilter === 'scheduled'} onClick={() => onScheduleFilterChange('scheduled')}>
            Scheduled
          </FilterButton>
          <FilterButton active={scheduleFilter === 'unscheduled'} onClick={() => onScheduleFilterChange('unscheduled')}>
            Unscheduled
          </FilterButton>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Sort:</span>
          <FilterButton active={sortDir === 'desc'} onClick={() => onSortDirChange('desc')}>
            Newest
          </FilterButton>
          <FilterButton active={sortDir === 'asc'} onClick={() => onSortDirChange('asc')}>
            Oldest
          </FilterButton>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Added:</span>
          <FilterButton active={dateFilter === 'all'} onClick={() => handleDateFilterChange('all')}>
            All Time
          </FilterButton>
          <FilterButton active={dateFilter === 'today'} onClick={() => handleDateFilterChange('today')}>
            Today
          </FilterButton>
          <FilterButton active={dateFilter === 'this_week'} onClick={() => handleDateFilterChange('this_week')}>
            This Week
          </FilterButton>
          <FilterButton active={dateFilter === 'custom'} onClick={() => handleDateFilterChange('custom')}>
            Custom
          </FilterButton>
        </div>

        {customDateRange && dateFilter === 'custom' && (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {customDateRange.start || 'Any'} - {customDateRange.end || 'Any'}
          </span>
        )}
      </div>

      {/* Custom Date Range Picker */}
      {showCustomRange && (
        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: 12,
          background: '#f8fafc',
          borderRadius: 8,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#64748b' }}>From:</label>
            <input
              type="date"
              value={tempStartDate}
              onChange={(e) => setTempStartDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #e2e8f0',
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#64748b' }}>To:</label>
            <input
              type="date"
              value={tempEndDate}
              onChange={(e) => setTempEndDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #e2e8f0',
                fontSize: 13,
              }}
            />
          </div>
          <button
            onClick={applyCustomRange}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              borderRadius: 4,
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
          <button
            onClick={clearCustomRange}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

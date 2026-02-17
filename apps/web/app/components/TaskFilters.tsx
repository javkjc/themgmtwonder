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
        borderRadius: 4,
        border: active ? 'none' : '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? '#ffffff' : 'var(--text-muted)',
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
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Status:</span>
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
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Schedule:</span>
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
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Sort:</span>
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
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Added:</span>
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
          background: 'var(--surface-secondary)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>From:</label>
            <input
              type="date"
              value={tempStartDate}
              onChange={(e) => setTempStartDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>To:</label>
            <input
              type="date"
              value={tempEndDate}
              onChange={(e) => setTempEndDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
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
              background: 'var(--accent)',
              color: '#ffffff',
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
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-muted)',
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

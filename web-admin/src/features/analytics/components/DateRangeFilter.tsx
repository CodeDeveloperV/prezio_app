import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { MenuItem, Stack, TextField } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { es } from 'date-fns/locale';

import { DATE_RANGE_PRESET_LABELS, DATE_RANGE_PRESET_OPTIONS, resolvePresetRange } from '../constants';

import type { DateRange, DateRangePreset } from '../constants';

export interface DateRangeFilterProps {
  preset: DateRangePreset;
  range: DateRange;
  onChange: (preset: DateRangePreset, range: DateRange) => void;
}

export function DateRangeFilter({ preset, range, onChange }: DateRangeFilterProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Rango"
          size="small"
          select
          sx={{ minWidth: 180 }}
          value={preset}
          onChange={(e) => {
            const nextPreset = e.target.value as DateRangePreset;
            onChange(nextPreset, resolvePresetRange(nextPreset, range));
          }}
        >
          {DATE_RANGE_PRESET_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {DATE_RANGE_PRESET_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        {preset === 'custom' && (
          <>
            <DatePicker
              label="Desde"
              value={range.from}
              onChange={(date) => date && onChange('custom', { ...range, from: date })}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
            />
            <DatePicker
              label="Hasta"
              value={range.to}
              onChange={(date) => date && onChange('custom', { ...range, to: date })}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
            />
          </>
        )}
      </Stack>
    </LocalizationProvider>
  );
}

import { MenuItem, TextField } from '@mui/material';

import type { StoreBranch } from '@prezio/shared-types';

export interface BranchFilterProps {
  branches: StoreBranch[];
  /** Empty array means "all branches accessible to the current member". */
  value: number[];
  onChange: (branchIds: number[]) => void;
}

/** Single-select branch scope filter. `branches` must already be pre-restricted to the
 * current member's accessible set (ORGANIZATION_ADMIN: every branch; MANAGER/EMPLOYEE:
 * only their assigned branches) -- this component never widens that scope. */
export function BranchFilter({ branches, value, onChange }: BranchFilterProps) {
  const selected = value.length === 1 ? value[0] : 'all';

  return (
    <TextField
      label="Sucursal"
      size="small"
      select
      sx={{ minWidth: 180 }}
      value={selected}
      onChange={(e) => onChange(e.target.value === 'all' ? [] : [Number(e.target.value)])}
    >
      <MenuItem value="all">Todas las sucursales</MenuItem>
      {branches.map((branch) => (
        <MenuItem key={branch.id} value={branch.id}>
          {branch.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

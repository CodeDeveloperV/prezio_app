import { Box, Typography } from '@mui/material';

/** Placeholder for nav destinations whose real screen ships in a later Epic 10 phase. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600 }} gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Esta sección estará disponible próximamente.
      </Typography>
    </Box>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';

export function AppRouter() {
  return (
    <Routes>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

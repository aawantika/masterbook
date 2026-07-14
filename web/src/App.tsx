import { Route, Routes } from 'react-router-dom';
import { SearchPage } from './pages/SearchPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { ImportManualPage } from './pages/ImportManualPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SearchPage />} />
      <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      <Route path="/import" element={<ImportManualPage />} />
    </Routes>
  );
}

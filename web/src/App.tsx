import { Route, Routes } from 'react-router-dom';
import { CookbookShell } from './CookbookShell';
import { BrowsePage } from './pages/BrowsePage';
import { AddRecipePage } from './pages/AddRecipePage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';

export function App() {
  return (
    <Routes>
      <Route element={<CookbookShell />}>
        <Route index element={<BrowsePage />} />
        <Route path="add" element={<AddRecipePage />} />
        <Route path="recipes/:id" element={<RecipeDetailPage />} />
      </Route>
    </Routes>
  );
}

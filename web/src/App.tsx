import { Route, Routes } from 'react-router-dom';
import { CookbookShell } from './CookbookShell';
import { RequireAuth } from './auth/RequireAuth';
import { BrowsePage } from './pages/BrowsePage';
import { AddRecipePage } from './pages/AddRecipePage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { ActivityPage } from './pages/ActivityPage';
import { EpubLibraryPage } from './pages/EpubLibraryPage';
import { EpubReaderPage } from './pages/EpubReaderPage';
import { LoginPage } from './pages/LoginPage';
import { AdminUsersPage } from './pages/AdminUsersPage';

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <CookbookShell />
          </RequireAuth>
        }
      >
        <Route index element={<BrowsePage />} />
        <Route path="add" element={<AddRecipePage />} />
        <Route path="recipes/:id" element={<RecipeDetailPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="epub" element={<EpubLibraryPage />} />
        <Route path="epub/:id" element={<EpubReaderPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
      </Route>
    </Routes>
  );
}

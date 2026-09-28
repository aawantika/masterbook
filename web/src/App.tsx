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
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AdminPage } from './pages/AdminPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminStatsPage } from './pages/AdminStatsPage';
import { ProfilePage } from './pages/ProfilePage';

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
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
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/stats" element={<AdminStatsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}

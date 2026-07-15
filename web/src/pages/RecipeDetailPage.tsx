import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import { RecipeDetailPanel } from '../components/RecipeDetailPanel';
import { CookingLogPanel } from '../components/CookingLogPanel';

export function RecipeDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { bumpReload } = useOutletContext<ShellContext>();
  const recipeId = Number(id);

  if (!id || !Number.isInteger(recipeId)) {
    return <div className="muted">Invalid recipe.</div>;
  }

  return (
    <>
      <RecipeDetailPanel
        recipeId={recipeId}
        onDeleted={() => {
          bumpReload();
          navigate('/');
        }}
        onChanged={bumpReload}
      />
      <CookingLogPanel recipeId={recipeId} onChanged={bumpReload} />
    </>
  );
}

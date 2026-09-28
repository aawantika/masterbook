import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import { RecipeDetailPanel } from '../components/RecipeDetailPanel';
import { CookingLogPanel } from '../components/CookingLogPanel';

export function RecipeDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { bumpReload } = useOutletContext<ShellContext>();
  const recipeId = Number(id);
  // Hides the cooking log below while the edit form is showing in place of
  // the normal detail view -- RecipeDetailPanel owns the actual editing
  // state, this just mirrors it up so this component can decide.
  const [editing, setEditing] = useState(false);

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
        onEditingChange={setEditing}
      />
      {!editing && <CookingLogPanel recipeId={recipeId} onChanged={bumpReload} />}
    </>
  );
}

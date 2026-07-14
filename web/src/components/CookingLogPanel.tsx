import { useEffect, useState } from 'react';
import { addAttempt, deleteAttempt, getRecipe } from '../api/client';
import { RecipeDetail } from '../api/types';
import { CookingLogList } from './CookingLogList';

type CookingLogPanelProps = {
  recipeId: number | null;
  onChanged: () => void;
};

export function CookingLogPanel({ recipeId, onChanged }: CookingLogPanelProps) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);

  const load = async () => {
    if (recipeId == null) {
      setRecipe(null);
      return;
    }
    setRecipe(await getRecipe(recipeId));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  if (recipeId == null) {
    return <div className="shell-pane-placeholder muted">Select a recipe to see its cooking log.</div>;
  }

  if (!recipe) {
    return <div className="muted">Loading...</div>;
  }

  return (
    <div>
      <CookingLogList
        attempts={recipe.attempts}
        onAddAttempt={async (attemptedAt, rating, notes) => {
          await addAttempt(recipe.id, attemptedAt, rating, notes);
          load();
          onChanged();
        }}
        onDeleteAttempt={async (attemptId) => {
          await deleteAttempt(attemptId);
          load();
          onChanged();
        }}
      />
    </div>
  );
}

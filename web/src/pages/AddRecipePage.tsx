import { useNavigate, useOutletContext } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import { ImportPanel } from '../components/ImportPanel';

export function AddRecipePage() {
  const navigate = useNavigate();
  const { bumpReload } = useOutletContext<ShellContext>();

  return (
    <ImportPanel
      onCreated={(id) => {
        bumpReload();
        navigate(`/recipes/${id}`);
      }}
      onCancel={() => navigate('/')}
    />
  );
}

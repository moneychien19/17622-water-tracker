import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { RedirectIfAuthed, RequireAuth } from './components/RequireAuth';
import { Dashboard } from './pages/Dashboard';
import { Groups } from './pages/Groups';
import { GroupSettings } from './pages/GroupSettings';
import { Invitations } from './pages/Invitations';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { PlantDetail } from './pages/PlantDetail';
import { Register } from './pages/Register';

export function App() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId/settings" element={<GroupSettings />} />
          <Route path="/invitations" element={<Invitations />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

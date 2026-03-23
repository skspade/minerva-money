import { BrowserRouter, Routes, Route } from 'react-router';
import Layout from './components/Layout';
import AccountsPage from './pages/AccountsPage';
import TransactionsPage from './pages/TransactionsPage';
import CategoriesPage from './pages/CategoriesPage';
import RulesPage from './pages/RulesPage';
import TransfersPage from './pages/TransfersPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AccountsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="transfers" element={<TransfersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

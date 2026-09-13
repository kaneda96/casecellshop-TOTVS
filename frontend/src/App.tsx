import { useEffect, useState } from 'react';
import { Product } from './types';
import { fetchProducts } from './api';
import { ProductList } from './components/ProductList';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadProducts() {
    try {
      const data = await fetchProducts();
      setProducts(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar os produtos. O backend está rodando?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-dark bg-dark mb-4">
        <div className="container">
          <span className="navbar-brand mb-0 h1">📱 CaseCellShop</span>
          <span className="text-white-50 small d-none d-sm-inline">Mini checkout de demonstração</span>
        </div>
      </nav>

      <main className="container pb-5">
        {loading && (
          <div className="d-flex align-items-center gap-2 text-secondary">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Carregando produtos...
          </div>
        )}

        {loadError && (
          <div className="alert alert-danger" role="alert">
            {loadError}
          </div>
        )}

        {!loading && !loadError && <ProductList products={products} onStockChange={loadProducts} />}
      </main>
    </div>
  );
}

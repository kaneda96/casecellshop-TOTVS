import { Product } from '../types';
import { ProductCard } from './ProductCard';

interface Props {
  products: Product[];
  onStockChange: () => void;
}

export function ProductList({ products, onStockChange }: Props) {
  if (products.length === 0) {
    return <p className="text-muted">Nenhum produto disponível no momento.</p>;
  }

  return (
    <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4">
      {products.map((product) => (
        <div className="col" key={product.id}>
          <ProductCard product={product} onStockChange={onStockChange} />
        </div>
      ))}
    </div>
  );
}

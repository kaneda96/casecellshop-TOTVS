import { Product } from '../module/stock/product.interface';

// Fábrica de dados iniciais: cada chamada devolve um Map novo, para que
// cada instância da aplicação (ou cada teste) comece com um estado limpo,
// sem estado global compartilhado escondido em um módulo.
export function seedProducts(): Map<string, Product> {
  return new Map<string, Product>([
    ['cap-001', { id: 'cap-001', name: 'Capinha iPhone 15 - Silicone Preta', price: 4990, stock: 5, reserved: 0 }],
    ['cap-002', { id: 'cap-002', name: 'Capinha Samsung S24 - Transparente', price: 3990, stock: 2, reserved: 0 }],
    ['cap-003', { id: 'cap-003', name: 'Capinha iPhone 14 - Couro Marrom', price: 6990, stock: 0, reserved: 0 }],
    ['cap-004', { id: 'cap-004', name: 'Capinha Motorola Edge - Antichoque', price: 2990, stock: 1, reserved: 0 }],
  ]);
}

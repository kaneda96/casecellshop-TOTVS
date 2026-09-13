export interface Product {
  id: string;
  name: string;
  price: number; // em centavos
  stock: number; // quantidade que realmente existe
  reserved: number; // quantidade comprometida em pedidos em processamento
}

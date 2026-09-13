import { useRef, useState } from 'react';
import { Product } from '../types';
import { ApiRequestError, createOrder, fetchOrder, formatPrice } from '../api';

type UiState =
  | { kind: 'idle' }
  | { kind: 'processing'; label: string }
  | { kind: 'success'; orderId: string }
  | { kind: 'error'; message: string; retryable: boolean };

interface Props {
  product: Product;
  onStockChange: () => void; // pede ao pai para recarregar a lista de produtos
}

function generateIdempotencyKey(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProductCard({ product, onStockChange }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [ui, setUi] = useState<UiState>({ kind: 'idle' });
  const idempotencyKeyRef = useRef<string | null>(null);

  const isSoldOut = product.available <= 0;
  const isBusy = ui.kind === 'processing';

  async function pollOrderUntilSettled(orderId: string) {
    const start = Date.now();
    const maxWaitMs = 15000;

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const order = await fetchOrder(orderId);
        if (order.status === 'CONFIRMED') {
          setUi({ kind: 'success', orderId: order.orderId });
          onStockChange();
          return;
        }
        if (order.status === 'FAILED_TEMPORARY') {
          setUi({
            kind: 'error',
            message: order.message || 'Falha temporária ao confirmar o pedido no ERP.',
            retryable: true,
          });
          onStockChange();
          return;
        }
        // ainda PENDING: continua no loop
      } catch {
        // erro de rede pontual ao consultar status: tenta de novo no próximo ciclo
      }
    }

    setUi({
      kind: 'error',
      message: 'Seu pedido ainda está sendo processado. Consulte novamente em instantes.',
      retryable: true,
    });
  }

  async function handleBuy(reuseKey = false) {
    if (isBusy) return; // trava contra múltiplos cliques

    if (!reuseKey || !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = idempotencyKeyRef.current;

    setUi({ kind: 'processing', label: 'Enviando pedido...' });

    try {
      const { status, body } = await createOrder(product.id, quantity, idempotencyKey);

      if (status === 201) {
        setUi({ kind: 'success', orderId: body.orderId });
        onStockChange();
        return;
      }

      if (status === 202) {
        setUi({ kind: 'processing', label: 'Confirmando com o ERP...' });
        await pollOrderUntilSettled(body.orderId);
        return;
      }

      setUi({ kind: 'success', orderId: body.orderId });
      onStockChange();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.errorCode === 'INSUFFICIENT_STOCK') {
          setUi({ kind: 'error', message: 'Estoque insuficiente para essa quantidade.', retryable: false });
          onStockChange();
          return;
        }
        if (err.errorCode === 'VALIDATION_ERROR') {
          setUi({ kind: 'error', message: err.message, retryable: false });
          return;
        }
        if (err.errorCode === 'ERP_UNAVAILABLE') {
          setUi({ kind: 'error', message: 'Falha temporária ao processar o pagamento. Tente novamente.', retryable: true });
          return;
        }
        setUi({ kind: 'error', message: err.message || 'Erro inesperado.', retryable: true });
        return;
      }

      // Falha de rede genuína (ex: backend fora do ar): reutilizar a mesma
      // Idempotency-Key no "tentar novamente" evita criar um pedido duplicado
      // caso a primeira requisição tenha, na verdade, chegado ao servidor.
      setUi({ kind: 'error', message: 'Não foi possível conectar ao servidor.', retryable: true });
    }
  }

  return (
    <div className="card h-100 shadow-sm">
      <div className="card-body d-flex flex-column">
        <h5 className="card-title">{product.name}</h5>
        <p className="card-text fw-semibold mb-1">{formatPrice(product.price)}</p>

        <span className={`badge rounded-pill align-self-start mb-3 ${isSoldOut ? 'text-bg-danger' : 'text-bg-success'}`}>
          {isSoldOut ? 'Sem estoque' : `${product.available} em estoque`}
        </span>

        <div className="mt-auto">
          <div className="input-group input-group-sm mb-2">
            <span className="input-group-text">Qtd.</span>
            <input
              type="number"
              className="form-control"
              min={1}
              max={Math.max(1, product.available)}
              value={quantity}
              disabled={isSoldOut || isBusy}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>

          <button
            className="btn btn-primary w-100"
            disabled={isSoldOut || isBusy}
            onClick={() => handleBuy(false)}
          >
            {isBusy && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />}
            {isBusy ? ui.label : 'Comprar'}
          </button>

          {ui.kind === 'success' && (
            <div className="alert alert-success mt-3 mb-0 py-2 small" role="alert">
              Pedido confirmado! (id: {ui.orderId.slice(0, 8)})
            </div>
          )}

          {ui.kind === 'error' && (
            <div className="alert alert-danger mt-3 mb-0 py-2 small" role="alert">
              <p className="mb-2">{ui.message}</p>
              {ui.retryable && (
                <button className="btn btn-outline-danger btn-sm" onClick={() => handleBuy(true)}>
                  Tentar novamente
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

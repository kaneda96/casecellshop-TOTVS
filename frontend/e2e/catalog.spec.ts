import { expect, test } from '@playwright/test';
import { listProducts } from './helpers/api';
import { CheckoutPage } from './helpers/checkout-page';

/**
 * Normaliza o espaço não separável (U+00A0) que o `Intl` insere entre "R$" e o
 * valor, para poder comparar com o texto do DOM sem depender desse detalhe.
 */
function formatBrl(cents: number): string {
  return (cents / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

test.describe('Catálogo de produtos (backend real)', () => {
  test('renderiza um card por produto da API, com o preço formatado', async ({ page, request }) => {
    const products = await listProducts(request);
    const checkout = new CheckoutPage(page);

    await checkout.goto();
    await checkout.waitForLoaded();

    await expect(page.locator('.card')).toHaveCount(products.length);

    for (const product of products) {
      const card = checkout.card(product.name);
      await expect(card, `card de "${product.name}"`).toBeVisible();

      const cardText = (await card.innerText()).replace(/\u00a0/g, ' ');
      expect(cardText, `preço de "${product.name}"`).toContain(formatBrl(product.price));
    }
  });

  test('formata o preço no padrão monetário pt-BR', async ({ page, request }) => {
    const [first] = await listProducts(request);
    const checkout = new CheckoutPage(page);

    await checkout.goto();
    await checkout.waitForLoaded();

    const cardText = (await checkout.card(first.name).innerText()).replace(/\u00a0/g, ' ');
    expect(cardText).toMatch(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/);
  });

  test('mostra a quantidade disponível quando há estoque', async ({ page, request }) => {
    const inStock = (await listProducts(request)).find((p) => p.available > 0);
    test.skip(!inStock, 'Nenhum produto com estoque no backend.');

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoaded();

    await expect(checkout.stockBadge(inStock!.name)).toHaveText(`${inStock!.available} em estoque`);
    await expect(checkout.buyButton(inStock!.name)).toBeEnabled();
  });

  test('produto esgotado: badge "Sem estoque" e compra desabilitada', async ({ page, request }) => {
    const soldOut = (await listProducts(request)).find((p) => p.available === 0);
    test.skip(!soldOut, 'Nenhum produto esgotado no catálogo do backend.');

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.waitForLoaded();

    await expect(checkout.stockBadge(soldOut!.name)).toHaveText('Sem estoque');
    await expect(checkout.buyButton(soldOut!.name)).toBeDisabled();
    await expect(checkout.quantityInput(soldOut!.name)).toBeDisabled();
  });
});

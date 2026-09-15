import { expect, Locator, Page } from '@playwright/test';

export type PurchaseOutcome = 'success' | 'error';

/**
 * Page Object da tela de checkout: centraliza os seletores (classes do
 * Bootstrap usadas em `ProductCard.tsx`) para que uma mudança de markup
 * exija editar um único arquivo.
 */
export class CheckoutPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.locator('nav.navbar')).toContainText('CaseCellShop');
  }

  /** Aguarda o fim do "Carregando produtos..." e o primeiro card na tela. */
  async waitForLoaded(): Promise<void> {
    await expect(this.page.getByText('Carregando produtos...')).toBeHidden();
    await expect(this.page.locator('.card').first()).toBeVisible();
  }

  async waitForLoadError(): Promise<void> {
    await expect(this.page.getByRole('alert')).toBeVisible();
  }

  card(productName: string): Locator {
    return this.page
      .locator('.card')
      .filter({ has: this.page.getByRole('heading', { name: productName, exact: true }) });
  }

  stockBadge(productName: string): Locator {
    return this.card(productName).locator('.badge');
  }

  quantityInput(productName: string): Locator {
    return this.card(productName).getByRole('spinbutton');
  }

  /**
   * Botão de compra pelo CSS (`.btn-primary`) e não pelo texto: durante o
   * processamento o rótulo muda para "Enviando pedido...", e o locator precisa
   * continuar válido nesse estado.
   */
  buyButton(productName: string): Locator {
    return this.card(productName).locator('button.btn-primary');
  }

  retryButton(productName: string): Locator {
    return this.card(productName).getByRole('button', { name: 'Tentar novamente' });
  }

  successAlert(productName: string): Locator {
    return this.card(productName).locator('.alert-success');
  }

  errorAlert(productName: string): Locator {
    return this.card(productName).locator('.alert-danger');
  }

  async setQuantity(productName: string, quantity: number): Promise<void> {
    await this.quantityInput(productName).fill(String(quantity));
  }

  async clickBuy(productName: string): Promise<void> {
    await this.buyButton(productName).click();
  }

  /**
   * Espera a tentativa de compra sair do estado "processing" — ou seja, o
   * alerta de sucesso ou o de erro aparecer. O timeout é generoso porque o
   * fluxo 202 faz polling do pedido a cada 1,2s por até 15s.
   */
  async waitForSettled(productName: string, timeout = 45_000): Promise<PurchaseOutcome> {
    const success = this.successAlert(productName);
    const error = this.errorAlert(productName);
    await expect(success.or(error).first()).toBeVisible({ timeout });
    return (await success.isVisible()) ? 'success' : 'error';
  }

  /**
   * Compra uma unidade e repete até confirmar.
   *
   * O simulador de ERP do backend é aleatório (15% de falha transitória), então
   * um único clique não é determinístico. Em vez de usar o botão "Tentar
   * novamente" — que reaproveita a mesma Idempotency-Key, e o backend responde
   * o mesmo erro para sempre —, recarregamos a página para gerar uma chave nova
   * e tentamos de novo. A probabilidade de falhar 5 vezes seguidas é ~0,008%.
   */
  async purchaseUntilConfirmed(productName: string, quantity = 1, maxAttempts = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await this.page.reload();
        await this.waitForLoaded();
      }

      await expect(
        this.stockBadge(productName),
        `"${productName}" precisa ter estoque para o teste de compra`
      ).toContainText('em estoque');

      await this.setQuantity(productName, quantity);
      await this.clickBuy(productName);

      if ((await this.waitForSettled(productName)) === 'success') return;
    }

    throw new Error(
      `Não foi possível confirmar a compra de "${productName}" em ${maxAttempts} tentativas ` +
        '(o simulador de ERP do backend é aleatório).'
    );
  }
}

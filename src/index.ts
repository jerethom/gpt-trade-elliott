import * as talib from "talib";
import * as ccxt from "ccxt";

class VaguesElliottTrader {
  private exchange: ccxt.Exchange;
  private symbol: string;
  private interval: string;
  private stopLossPercentage: number;
  private balance: { [currency: string]: number };
  private orderId: string | null;

  constructor(apiKey: string, secret: string, symbol: string, interval: string, stopLossPercentage: number) {
    this.exchange = new ccxt.binance({
      apiKey: apiKey,
      secret: secret,
    });
    this.symbol = symbol;
    this.interval = interval;
    this.stopLossPercentage = stopLossPercentage;
    this.balance = {};
    this.orderId = null;
  }

  private async fetchBalance(): Promise<void> {
    const balanceData = await this.exchange.fetchBalance();
    this.balance = balanceData.total;
  }

  private async placeBuyOrder(amount: number): Promise<void> {
    const order = await this.exchange.createMarketBuyOrder(this.symbol, amount);
    this.orderId = order.id;
  }

  private async placeSellOrder(amount: number): Promise<void> {
    const order = await this.exchange.createMarketSellOrder(this.symbol, amount);
    this.orderId = order.id;
  }

  private async placeStopLossOrder(stopLossPrice: number, amount: number): Promise<void> {
    const order = await this.exchange.createOrder(this.symbol, "stop", "sell", amount, stopLossPrice);
    this.orderId = order.id;
  }

  private async cancelOrder(): Promise<void> {
    if (this.orderId) {
      await this.exchange.cancelOrder(this.orderId, this.symbol);
      this.orderId = null;
    }
  }

  public async run(): Promise<void> {
    await this.fetchBalance();

    const baseCurrency = this.symbol.split("/")[0];
    const quoteCurrency = this.symbol.split("/")[1];
    const baseBalance = this.balance[baseCurrency] || 0;
    const quoteBalance = this.balance[quoteCurrency] || 0;

    const ohlcv = await this.exchange.fetchOHLCV(this.symbol, this.interval);
    const closePrices = ohlcv.map((x) => x[4]);

    const waveCounts = talib.abstract.WAVES(closePrices, 5);

    const wave3 = waveCounts[waveCounts.length - 3];
    const wave5 = waveCounts[waveCounts.length - 1];
    const lastPrice = closePrices[closePrices.length - 1];

    if (wave3 < 0 && wave5 > 0 && quoteBalance > 0) {
      console.log("Achat");

      const buyAmount = quoteBalance / lastPrice;
      await this.placeBuyOrder(buyAmount);

      const stopLossPrice = lastPrice * (1 - this.stopLossPercentage);
      console.log(`Prix Stop-Loss: ${stopLossPrice}`);

      await this.placeStopLossOrder(stopLossPrice, baseBalance);
    } else if (wave3 > 0 && wave5 < 0 && baseBalance > 0) {
      console.log("Vente");
      await this.cancelOrder(); // Annuler l'ordre stop-loss précédent

      await this.placeSellOrder(baseBalance);
    } else {
      console.log("Attente");
      // Attendre la prochaine opportunité
    }
  }
}

(async () => {
  const apiKey = "your_api_key";
  const secret = "your_secret_key";
  const symbol = "BTC/USDT";
  const interval = "1h";
  const stopLossPercentage = 0.03; // 3%

  const trader = new VaguesElliottTrader(apiKey, secret, symbol, interval, stopLossPercentage);

// Exécutez le bot toutes les heures
  await trader.run();
  setInterval(async () => {
    await trader.run();
  }, 60 * 60 * 1000);
})();

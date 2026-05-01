import { transakConfig } from "../config";

export type OfframpSessionRequest = {
  recipientAddress: `0x${string}`;
  musdAmount: string; // human units
  country?: string;
};

export type OfframpSession = {
  sessionUrl: string;
  provider: "transak";
  env: string;
};

/**
 * Build a Transak widget URL. Uses the STAGING base by default.
 * See https://docs.transak.com/docs/hosted-widget-quick-start for full params.
 */
export function buildOfframpSession(req: OfframpSessionRequest): OfframpSession {
  const base =
    transakConfig.env === "PRODUCTION"
      ? "https://global.transak.com"
      : "https://global-stg.transak.com";

  const params = new URLSearchParams({
    apiKey: transakConfig.apiKey,
    productsAvailed: "SELL",
    cryptoCurrencyCode: "MUSD",
    defaultCryptoAmount: req.musdAmount,
    walletAddress: req.recipientAddress,
    disableWalletAddressForm: "true",
    themeColor: "F7931A",
  });
  if (req.country) params.set("defaultFiatCurrency", countryToFiat(req.country));

  return {
    sessionUrl: `${base}/?${params.toString()}`,
    provider: "transak",
    env: transakConfig.env,
  };
}

function countryToFiat(country: string): string {
  const map: Record<string, string> = {
    NG: "NGN",
    KE: "KES",
    GH: "GHS",
    ZA: "ZAR",
    IN: "INR",
    PH: "PHP",
    MX: "MXN",
    BR: "BRL",
    US: "USD",
    GB: "GBP",
  };
  return map[country.toUpperCase()] || "USD";
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { serverConfig, addresses } from "./config";
import { remittanceRouter } from "./routes/remittance";
import { collateralRouter } from "./routes/collateral";
import { offrampRouter } from "./routes/offramp";
import { notifyRouter } from "./routes/notify";
import { poolRouter } from "./routes/pool";
import { startChainWatcher } from "./services/chainWatcher";

const app = express();
app.use(helmet());
app.use(cors({ origin: serverConfig.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, addresses });
});

app.use("/api/remittance", remittanceRouter);
app.use("/api/collateral", collateralRouter);
app.use("/api/offramp", offrampRouter);
app.use("/api/notify", notifyRouter);
app.use("/api/pool", poolRouter);

app.listen(serverConfig.port, () => {
  console.log(`[api] listening on :${serverConfig.port}`);
  startChainWatcher().catch((err) => console.error("[watcher] fatal", err));
});

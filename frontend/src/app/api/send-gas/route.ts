import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const GAS_AMOUNT = parseEther("0.00005"); // ~$0.15 — covers dozens of Base txs

// Lazy-init clients (env vars unavailable at build time)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _clients: any = null;

function clients() {
  if (!_clients) {
    if (!process.env.PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY not configured");
    }
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    const rpcUrl =
      process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL!;
    _clients = {
      pub: createPublicClient({ chain: base, transport: http(rpcUrl) }),
      wallet: createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
      }),
    };
  }
  return _clients;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const { pub, wallet } = clients();

    // Skip if user already has enough ETH for gas
    const ethBalance = await pub.getBalance({ address: address as `0x${string}` });
    if (ethBalance > GAS_AMOUNT) {
      return NextResponse.json({ hash: null, skipped: true });
    }

    // Send gas and wait for confirmation (~2s on Base)
    const hash = await wallet.sendTransaction({
      to: address as `0x${string}`,
      value: GAS_AMOUNT,
    });

    await pub.waitForTransactionReceipt({ hash });

    return NextResponse.json({ hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send gas";
    console.error("send-gas error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

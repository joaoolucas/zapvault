"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How It Works" },
  { id: "architecture", label: "Architecture" },
  { id: "deposit-flow", label: "Deposit Flow" },
  { id: "withdraw-flow", label: "Withdraw Flow" },
  { id: "ai-keeper", label: "AI Keeper" },
  { id: "ens-strategy", label: "ENS Strategy" },
  { id: "smart-contracts", label: "Smart Contracts" },
  { id: "supported-chains", label: "Supported Chains" },
  { id: "tech-stack", label: "Tech Stack" },
];

function useActiveSection() {
  const [active, setActive] = useState(sections[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return active;
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="font-serif text-3xl font-bold text-foreground tracking-tight mb-6 scroll-mt-24"
    >
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-6 ${className}`}>
      {children}
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground mb-1">{title}</div>
        <p className="text-sm text-muted leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-surface border border-border rounded-lg px-4 py-3 text-xs text-foreground font-mono overflow-x-auto">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  const active = useActiveSection();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <div className="px-12 pt-16 pb-40">
        {/* Page title */}
        <div className="max-w-4xl mx-auto mb-16">
          <p className="font-serif text-xs text-muted uppercase tracking-[4px] mb-4">
            Documentation
          </p>
          <h1 className="font-serif text-5xl font-bold text-foreground tracking-tighter leading-[0.9] mb-4">
            How ZapVault<br />
            <span className="italic font-normal">works</span>
          </h1>
          <p className="text-sm text-muted leading-relaxed max-w-md">
            Everything you need to know about depositing, withdrawing, and managing
            concentrated liquidity through ZapVault.
          </p>
        </div>

        {/* Grid: sidebar + content */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-12">
          {/* Sticky sidebar TOC */}
          <nav className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-4">
                Contents
              </p>
              <ul className="space-y-1">
                {sections.map(({ id, label }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className={`block px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                        active === id
                          ? "bg-surface text-foreground font-medium"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Content */}
          <div className="space-y-20">
            {/* 1. Overview */}
            <section id="overview">
              <SectionHeading id="overview">Overview</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                ZapVault is a cross-chain automated liquidity provision protocol built on
                Uniswap v4. It lets you deposit any token from any EVM chain and automatically
                provisions concentrated ETH/USDC liquidity with AI-managed rebalancing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Cross-Chain
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Deposit from Ethereum, Arbitrum, Polygon, or Base. LI.FI bridges and swaps
                    your tokens into USDC on Base automatically.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    AI-Managed
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    An AI keeper powered by Claude Opus 4.6 monitors positions and rebalances
                    when price moves outside your configured threshold.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    One Click
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    A single deposit transaction handles token approval, bridging, swapping,
                    and LP provision. No manual position management needed.
                  </p>
                </Card>
              </div>
            </section>

            {/* 2. How It Works */}
            <section id="how-it-works">
              <SectionHeading id="how-it-works">How It Works</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                ZapVault follows a four-step flow from deposit to continuous management.
              </p>
              <Card>
                <div className="space-y-6">
                  <Step
                    n={1}
                    title="Deposit"
                    desc="User deposits USDC (or any token via LI.FI cross-chain bridge). The router transfers USDC and calls the vault."
                  />
                  <Step
                    n={2}
                    title="Split & Provision"
                    desc="The vault reads the Chainlink ETH/USD oracle to center a tick range, calculates the optimal ETH/USDC split, swaps via the Uniswap v4 pool, and provisions concentrated liquidity."
                  />
                  <Step
                    n={3}
                    title="Monitor"
                    desc="The AI keeper runs on a cron schedule, checking each position's needsRebalance() status against the user's configured threshold."
                  />
                  <Step
                    n={4}
                    title="Rebalance"
                    desc="When price drifts beyond the threshold, the keeper calls rebalance() — removing the old position, re-centering the range on the current oracle price, and re-provisioning liquidity."
                  />
                </div>
              </Card>
            </section>

            {/* 3. Architecture */}
            <section id="architecture">
              <SectionHeading id="architecture">Architecture</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                ZapVault uses a standalone vault architecture — no Uniswap v4 hook is needed.
                The vault directly calls the PoolManager to manage liquidity on any existing pool.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    IUnlockCallback
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    The vault implements <code className="text-foreground bg-surface px-1 rounded">IUnlockCallback</code>.
                    It calls <code className="text-foreground bg-surface px-1 rounded">poolManager.unlock()</code> which
                    triggers the callback, where all pool operations (swap, modifyLiquidity) happen atomically.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Flash Accounting
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Uniswap v4 uses flash accounting — all token balances must net to zero within a single
                    unlock callback. Positive deltas can be taken, negative deltas must be settled.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    No Hook Required
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Any contract can call <code className="text-foreground bg-surface px-1 rounded">poolManager.unlock()</code> and
                    <code className="text-foreground bg-surface px-1 rounded"> modifyLiquidity()</code> on
                    any pool. ZapVault works with the existing hookless ETH/USDC pool on Base.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Oracle-Based Ranging
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Chainlink ETH/USD price feeds center the LP range. The pool&apos;s sqrtPrice is used
                    for liquidity calculations, while the oracle determines range boundaries.
                  </p>
                </Card>
              </div>
              <Card className="bg-surface">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-3">
                  Contract Flow
                </p>
                <CodeBlock>{`User → ZapVaultRouter.deposit()
  → USDC.transferFrom(user, vault)
  → ZapVault.deposit()
    → poolManager.unlock(data)
      → unlockCallback()
        → swap (USDC → ETH for half)
        → modifyLiquidity (provision LP)
        → settle / take (flash accounting)`}</CodeBlock>
              </Card>
            </section>

            {/* 4. Deposit Flow */}
            <section id="deposit-flow">
              <SectionHeading id="deposit-flow">Deposit Flow</SectionHeading>
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Base Direct Deposit
                  </h3>
                  <p className="text-sm text-muted leading-relaxed mb-4">
                    When depositing USDC directly from Base, the frontend calls the router&apos;s
                    <code className="text-foreground bg-surface px-1 rounded mx-1">depositWithAmount()</code>
                    function after an ERC-20 approval.
                  </p>
                  <Card>
                    <div className="space-y-4">
                      <Step n={1} title="Approve USDC" desc="User approves the ZapVaultRouter to spend their USDC." />
                      <Step n={2} title="Call depositWithAmount()" desc="Router transfers USDC from user to vault, then calls vault.deposit() with the user's config (range, rebalance threshold, slippage)." />
                      <Step n={3} title="Vault provisions LP" desc="Inside the unlock callback, the vault swaps a portion of USDC to ETH and provisions concentrated liquidity centered on the oracle price." />
                    </div>
                  </Card>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Cross-Chain via LI.FI
                  </h3>
                  <p className="text-sm text-muted leading-relaxed mb-4">
                    From other chains, LI.FI handles bridging and swapping. The final step calls the
                    router&apos;s <code className="text-foreground bg-surface px-1 rounded mx-1">deposit()</code>
                    function directly — it&apos;s LI.FI Composer-compatible.
                  </p>
                  <Card>
                    <div className="space-y-4">
                      <Step n={1} title="Select source chain & token" desc="User picks any EVM chain (Ethereum, Arbitrum, Polygon) and any token." />
                      <Step n={2} title="LI.FI bridges to Base" desc="LI.FI routes the swap and bridge to deliver USDC on Base to the router contract." />
                      <Step n={3} title="Router deposits" desc="The Composer call invokes deposit(user, amount, ...) which uses transferFrom to move USDC into the vault and provision LP." />
                    </div>
                  </Card>
                </div>
              </div>
            </section>

            {/* 5. Withdraw Flow */}
            <section id="withdraw-flow">
              <SectionHeading id="withdraw-flow">Withdraw Flow</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                Withdrawals remove the user&apos;s entire LP position, swap all ETH back to USDC in the
                pool, and send USDC-only to the user. This simplifies cross-chain bridging on exit.
              </p>
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Base Direct Withdraw
                  </h3>
                  <Card>
                    <div className="space-y-4">
                      <Step n={1} title="Call withdraw()" desc="User calls vault.withdraw() directly. No approval needed — the vault owns the LP." />
                      <Step n={2} title="Remove liquidity" desc="Inside the unlock callback, the vault removes all liquidity from the position." />
                      <Step n={3} title="Swap ETH → USDC" desc="The ETH portion is swapped back to USDC in the same pool, within the same callback." />
                      <Step n={4} title="Send USDC to user" desc="All USDC is transferred to the user's wallet. Position data is cleared." />
                    </div>
                  </Card>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Cross-Chain Withdraw
                  </h3>
                  <p className="text-sm text-muted leading-relaxed mb-4">
                    After receiving USDC on Base, users can bridge back to their origin chain using
                    LI.FI or any bridge of their choice.
                  </p>
                </div>
              </div>
            </section>

            {/* 6. AI Keeper */}
            <section id="ai-keeper">
              <SectionHeading id="ai-keeper">AI Keeper</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                The AI keeper is a cron job powered by Claude Opus 4.6 that monitors all active
                positions and triggers rebalances when needed.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Decision Logic
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    The keeper calls <code className="text-foreground bg-surface px-1 rounded">needsRebalance(user)</code> for
                    each active position. This checks whether the current pool tick has drifted beyond
                    the user&apos;s configured <code className="text-foreground bg-surface px-1 rounded">rebalanceThreshold</code> (in
                    basis points) relative to the position&apos;s range.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Rebalance Execution
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    When rebalance is triggered, the vault removes the existing liquidity position,
                    re-reads the oracle for a new center price, and provisions a fresh concentrated
                    LP position with the same range width.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Cron Schedule
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    The keeper runs periodically, iterating through all depositors. It batches
                    rebalance calls to minimize gas costs and avoid redundant transactions.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Fallback Behavior
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    If the keeper fails or is unavailable, positions remain active in the pool —
                    they simply won&apos;t be rebalanced until the keeper resumes. Users can always
                    withdraw at any time regardless of keeper status.
                  </p>
                </Card>
              </div>
            </section>

            {/* 7. ENS Strategy */}
            <section id="ens-strategy">
              <SectionHeading id="ens-strategy">ENS Strategy</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                Users with an ENS name can store their LP strategy as on-chain text records.
                Anyone can follow a strategist&apos;s config when depositing.
              </p>
              <Card className="mb-6">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-4">
                  Text Record Keys
                </p>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <code className="text-xs font-mono bg-surface px-2 py-1 rounded text-foreground flex-shrink-0">
                      vault.range
                    </code>
                    <p className="text-[12px] text-muted leading-relaxed">
                      Total tick width of the LP range (e.g. <code className="text-foreground bg-surface px-1 rounded">1200</code> = &plusmn;600
                      ticks). Wider ranges reduce impermanent loss, narrower ranges earn higher fees.
                      Default: <code className="text-foreground bg-surface px-1 rounded">600</code>.
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <code className="text-xs font-mono bg-surface px-2 py-1 rounded text-foreground flex-shrink-0">
                      vault.rebalance
                    </code>
                    <p className="text-[12px] text-muted leading-relaxed">
                      Price movement threshold in basis points that triggers a rebalance (e.g.
                      <code className="text-foreground bg-surface px-1 rounded">500</code> = 5%).
                      Default: <code className="text-foreground bg-surface px-1 rounded">500</code>.
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <code className="text-xs font-mono bg-surface px-2 py-1 rounded text-foreground flex-shrink-0">
                      vault.slippage
                    </code>
                    <p className="text-[12px] text-muted leading-relaxed">
                      Maximum slippage tolerance in basis points for swaps during deposit and
                      rebalance (e.g. <code className="text-foreground bg-surface px-1 rounded">100</code> = 1%).
                      Default: <code className="text-foreground bg-surface px-1 rounded">50</code>.
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="bg-surface">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-3">
                  Following a Strategist
                </p>
                <p className="text-[12px] text-muted leading-relaxed">
                  When depositing, enter any ENS name (e.g. <code className="text-foreground bg-surface px-1 rounded">vitalik.eth</code>)
                  to auto-fill their published strategy. The frontend reads the three text records
                  and applies them to your deposit config. You can override any value before confirming.
                </p>
              </Card>
            </section>

            {/* 8. Smart Contracts */}
            <section id="smart-contracts">
              <SectionHeading id="smart-contracts">Smart Contracts</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                All contracts are deployed on Base mainnet. The vault uses Solidity 0.8.26 with
                Cancun EVM and <code className="text-foreground bg-surface px-1 rounded">via_ir=true</code>.
              </p>
              <Card className="mb-6 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-[11px] font-semibold text-foreground uppercase tracking-widest">Contract</th>
                      <th className="text-left py-2 text-[11px] font-semibold text-foreground uppercase tracking-widest">Address</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted font-mono">
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-sans text-foreground font-medium">ZapVault</td>
                      <td className="py-2.5">0xc77d3CCFba9354db99972D11d994676d55709d5C</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-sans text-foreground font-medium">ZapVaultRouter</td>
                      <td className="py-2.5">0x3F75D8E28A148380B186AcedcDE476F8E1CFDd78</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-sans text-foreground font-medium">PoolManager (v4)</td>
                      <td className="py-2.5">0x498581fF718922c3f8e6A244956aF099B2652b2b</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-sans text-foreground font-medium">USDC</td>
                      <td className="py-2.5">0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-sans text-foreground font-medium">Chainlink ETH/USD</td>
                      <td className="py-2.5">0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70</td>
                    </tr>
                  </tbody>
                </table>
              </Card>
              <h3 className="text-sm font-semibold text-foreground mb-3">Key Functions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <p className="text-[11px] font-semibold text-foreground mb-2">ZapVault</p>
                  <div className="space-y-1.5 text-[12px] text-muted font-mono">
                    <div>deposit(user, usdcAmount, config)</div>
                    <div>withdraw()</div>
                    <div>rebalance(user)</div>
                    <div>needsRebalance(user) → bool</div>
                    <div>getPosition(user) → UserPosition</div>
                    <div>getConfig(user) → UserConfig</div>
                  </div>
                </Card>
                <Card>
                  <p className="text-[11px] font-semibold text-foreground mb-2">ZapVaultRouter</p>
                  <div className="space-y-1.5 text-[12px] text-muted font-mono">
                    <div>depositWithAmount(amount, range, threshold, slippage)</div>
                    <div>deposit(user, amount, range, threshold, slippage)</div>
                  </div>
                  <p className="text-[11px] text-muted mt-3 font-sans">
                    The <code className="text-foreground bg-surface px-1 rounded">deposit()</code> function
                    is LI.FI Composer-compatible — it accepts an explicit user address so the Composer
                    contract can deposit on behalf of the bridging user.
                  </p>
                </Card>
              </div>
            </section>

            {/* 9. Supported Chains */}
            <section id="supported-chains">
              <SectionHeading id="supported-chains">Supported Chains</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                ZapVault accepts deposits from any EVM chain supported by LI.FI.
                The vault and LP positions live on Base.
              </p>
              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-[11px] font-semibold text-foreground uppercase tracking-widest">Chain</th>
                      <th className="text-left py-2 pr-4 text-[11px] font-semibold text-foreground uppercase tracking-widest">Chain ID</th>
                      <th className="text-left py-2 pr-4 text-[11px] font-semibold text-foreground uppercase tracking-widest">Role</th>
                      <th className="text-left py-2 text-[11px] font-semibold text-foreground uppercase tracking-widest">USDC</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium text-foreground">Base</td>
                      <td className="py-2.5 pr-4 font-mono">8453</td>
                      <td className="py-2.5 pr-4">Vault + LP</td>
                      <td className="py-2.5 font-mono text-[11px]">0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium text-foreground">Ethereum</td>
                      <td className="py-2.5 pr-4 font-mono">1</td>
                      <td className="py-2.5 pr-4">Deposit source</td>
                      <td className="py-2.5 font-mono text-[11px]">0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium text-foreground">Arbitrum</td>
                      <td className="py-2.5 pr-4 font-mono">42161</td>
                      <td className="py-2.5 pr-4">Deposit source</td>
                      <td className="py-2.5 font-mono text-[11px]">0xaf88d065e77c8cC2239327C5EDb3A432268e5831</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-foreground">Polygon</td>
                      <td className="py-2.5 pr-4 font-mono">137</td>
                      <td className="py-2.5 pr-4">Deposit source</td>
                      <td className="py-2.5 font-mono text-[11px]">0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359</td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            </section>

            {/* 10. Tech Stack */}
            <section id="tech-stack">
              <SectionHeading id="tech-stack">Tech Stack</SectionHeading>
              <p className="text-sm text-muted leading-relaxed mb-6">
                ZapVault is built on battle-tested protocols and modern tooling.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Uniswap v4
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Singleton PoolManager with flash accounting. ZapVault uses modifyLiquidity
                    for concentrated LP and the built-in swap for token conversion.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    LI.FI
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Cross-chain bridge and DEX aggregator. The router&apos;s deposit() function is
                    Composer-compatible, enabling seamless cross-chain deposits.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Chainlink
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    ETH/USD price oracle on Base for centering LP ranges. The vault reads the latest
                    price to determine optimal tick boundaries.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    ENS
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Text records for on-chain strategy storage. Three keys (vault.range, vault.rebalance,
                    vault.slippage) let users publish and share LP strategies.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Claude Opus 4.6
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    AI keeper that monitors positions and triggers rebalances. Runs as a cron job
                    with on-chain read/write capabilities.
                  </p>
                </Card>
                <Card>
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">
                    Frontend
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Next.js 16 with wagmi v3, RainbowKit, and Tailwind CSS. Supports wallet
                    connection, ENS resolution, and cross-chain deposit flows.
                  </p>
                </Card>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

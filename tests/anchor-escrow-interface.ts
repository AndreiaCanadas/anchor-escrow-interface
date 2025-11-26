import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrowInterface } from "../target/types/anchor_escrow_interface";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { randomBytes } from "crypto";
import {
  createMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
// import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { BN } from "bn.js";

describe("anchor-escrow-interface", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();
  const connection = provider.connection;

  const program = anchor.workspace.anchorEscrowInterface as Program<AnchorEscrowInterface>;

  const tokenProgram = TOKEN_PROGRAM_ID;
  const token2022Program = TOKEN_2022_PROGRAM_ID;

  // Initialize constants
  const seed1 = new anchor.BN(randomBytes(8));
  const seed2 = new anchor.BN(randomBytes(8));
  const amountReceive1 = new anchor.BN(1e9);
  const amountReceive2 = new anchor.BN(2e9);
  const amountTransfer1 = new anchor.BN(3e9);
  const amountTransfer2 = new anchor.BN(4e9);

  // Generate keypairs
  const maker = Keypair.generate();
  const taker = Keypair.generate();

  // Declare Mints and ATA accounts
  let mintA: PublicKey;
  let mintB: PublicKey;
  let mintB22: PublicKey;
  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;
  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;
  let makerAtaB22: PublicKey;
  let takerAtaB22: PublicKey;
  let vault1: PublicKey;
  let vault2: PublicKey;

  // Find the PDA accounts
  const escrow1 = PublicKey.findProgramAddressSync([
    Buffer.from("escrow"), 
    maker.publicKey.toBuffer(), 
    seed1.toArrayLike(Buffer, "le", 8),
  ], program.programId)[0];
  const escrow2 = PublicKey.findProgramAddressSync([
    Buffer.from("escrow"), 
    maker.publicKey.toBuffer(), 
    seed2.toArrayLike(Buffer, "le", 8),
  ], program.programId)[0];

  it("Airdrop SOL to maker and taker", async () => {
    const tx = await connection.requestAirdrop(maker.publicKey, LAMPORTS_PER_SOL * 1);
    await connection.confirmTransaction(tx);
    const tx2 = await connection.requestAirdrop(taker.publicKey, LAMPORTS_PER_SOL * 1);
    await connection.confirmTransaction(tx2);
    console.log("\n--------------------------------");
    console.log("Airdropped SOL to maker and taker");
    console.log("Maker balance (SOL):", (await connection.getBalance(maker.publicKey)) / LAMPORTS_PER_SOL);
    console.log("Taker balance (SOL):", (await connection.getBalance(taker.publicKey)) / LAMPORTS_PER_SOL);
  });

  it("Initialize Tokens and Mint Tokens", async () => {
    mintA = await createMint(
      connection, 
      provider.wallet.payer, 
      provider.publicKey, 
      null, 
      9, 
      Keypair.generate(), 
      {commitment: "confirmed"}, 
      tokenProgram
    );
    mintB = await createMint(
      connection, 
      provider.wallet.payer, 
      provider.publicKey, 
      null, 
      9, 
      Keypair.generate(), 
      {commitment: "confirmed"}, 
      tokenProgram
    );
    mintB22 = await createMint(
      connection, 
      provider.wallet.payer, 
      provider.publicKey, 
      null, 
      9, 
      Keypair.generate(), 
      {commitment: "confirmed"}, 
      token2022Program
    );
    
    makerAtaB = getAssociatedTokenAddressSync(mintB, maker.publicKey, false, tokenProgram);
    takerAtaA = getAssociatedTokenAddressSync(mintA, taker.publicKey, false, tokenProgram);
    makerAtaB22 = getAssociatedTokenAddressSync(mintB22, maker.publicKey, false, token2022Program);
    
    makerAtaA = (await getOrCreateAssociatedTokenAccount(
      connection, 
      provider.wallet.payer,
      mintA,
      maker.publicKey,
      false,
      "confirmed",
      {commitment: "confirmed"},
      tokenProgram
    )).address;
    takerAtaB = (await getOrCreateAssociatedTokenAccount(
      connection, 
      provider.wallet.payer,
      mintB,
      taker.publicKey,
      false,
      "confirmed",
      {commitment: "confirmed"},
      tokenProgram
    )).address;
    takerAtaB22 = (await getOrCreateAssociatedTokenAccount(
      connection, 
      provider.wallet.payer,
      mintB22,
      taker.publicKey,
      false,
      "confirmed",
      {commitment: "confirmed"},
      token2022Program
    )).address;

    await mintTo(
      connection,
      maker,
      mintA,
      makerAtaA,
      provider.wallet.payer,
      10_000_000_000,
      undefined,
      {commitment: "confirmed"},
      tokenProgram
    );
    await mintTo(
      connection,
      taker,
      mintB,
      takerAtaB,
      provider.wallet.payer,
      10_000_000_000,
      undefined,
      {commitment: "confirmed"},
      tokenProgram
    );
    await mintTo(
      connection,
      taker,
      mintB22,
      takerAtaB22,
      provider.wallet.payer,
      10_000_000_000,
      undefined,
      {commitment: "confirmed"},
      token2022Program
    );

    console.log("\n--------------------------------");
    console.log("Mint A:", mintA.toBase58());
    console.log("Mint B:", mintB.toBase58());
    console.log("Mint B22:", mintB22.toBase58());
    console.log("Maker Mint A balance:", (await connection.getTokenAccountBalance(makerAtaA)).value.amount);
    console.log("Taker Mint B balance:", (await connection.getTokenAccountBalance(takerAtaB)).value.amount);
    console.log("Taker Mint B22 balance:", (await connection.getTokenAccountBalance(takerAtaB22)).value.amount);
  });

  it("Make Escrow with Mint A and Mint B", async () => {

    vault1 = getAssociatedTokenAddressSync(mintA, escrow1, true);

    const tx = await program.methods
    .make(seed1, amountReceive1, amountTransfer1)
    .accountsPartial({
      maker: maker.publicKey,
      mintA: mintA,
      mintB: mintB,
      makerAtaA,
      vault: vault1,
      escrow: escrow1,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([maker])
    .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Make Escrow with Mint A and Mint B22", async () => {

    vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

    const tx = await program.methods
    .make(seed2, amountReceive2, amountTransfer2)
    .accountsPartial({
      maker: maker.publicKey,
      mintA: mintA,
      mintB: mintB22,
      makerAtaA,
      vault: vault2,
      escrow: escrow2,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([maker])
    .rpc();
    console.log("Your transaction signature", tx);
  });

  xit("Take Escrow with Mint A and Mint B (option method)", async () => {

    const tx = await program.methods
    .take()
    .accountsPartial({
      maker: maker.publicKey,
      taker: taker.publicKey,
      mintA: mintA,
      mintB: mintB,
      vault: vault1,
      makerAtaB,
      makerAtaBOption: null,
      takerAtaB,
      takerAtaBOption: null,
      takerAtaA,
      escrow: escrow1,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: tokenProgram,
      tokenProgramOption: token2022Program,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([taker])
    .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Take Escrow with Mint A and Mint B (same token program)", async () => {
    const tx = await program.methods
    .takeSameProg()
    .accountsPartial({
      maker: maker.publicKey,
      taker: taker.publicKey,
      mintA: mintA,
      mintB: mintB,
      vault: vault1,
      makerAtaB,
      takerAtaB,
      takerAtaA,
      escrow: escrow1,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([taker])
    .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Take Escrow with Mint A and Mint B22 (different token program)", async () => {
    const tx = await program.methods
    .takeDifProg()
    .accountsPartial({
      maker: maker.publicKey,
      taker: taker.publicKey,
      mintA: mintA,
      mintB: mintB22,
      vault: vault2,
      makerAtaB: makerAtaB22,
      takerAtaB: takerAtaB22,
      takerAtaA,
      escrow: escrow2,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: tokenProgram,
      tokenProgram2: token2022Program,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([taker])
    .rpc();
    console.log("Your transaction signature", tx);
  });

});

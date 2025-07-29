import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrowInterface } from "../target/types/anchor_escrow_interface";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { randomBytes } from "crypto";
import {
  createMint,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";

describe("anchor-escrow-interface", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();
  const connection = provider.connection;

  const program = anchor.workspace.anchorEscrowInterface as Program<AnchorEscrowInterface>;

  const tokenProgram = TOKEN_PROGRAM_ID;
  const token2022Program = TOKEN_2022_PROGRAM_ID;

  // Define the wallet accounts
  const maker = provider.wallet as anchor.Wallet;
  const taker = Keypair.generate();

  // Initialize constants
  const seed = new anchor.BN(randomBytes(8));
  const amountReceive = new anchor.BN(1e9);
  const amountTransfer = new anchor.BN(3e9);

  // Define the mint accounts (will be initialized later)
  let mintA = anchor.web3.PublicKey;  // To be created with SPL token program
  let mintB = anchor.web3.PublicKey;  // To be created with SPL token program
  let mintC = anchor.web3.PublicKey;  // To be created with SPL token 2022 program

  // Define the ATA accounts (will be initialized later)
  let makerAtaA = anchor.web3.PublicKey;
  let makerAtaB = anchor.web3.PublicKey;
  let makerAtaC = anchor.web3.PublicKey;
  let takerAtaA = anchor.web3.PublicKey;
  let takerAtaB = anchor.web3.PublicKey;
  let takerAtaC = anchor.web3.PublicKey;

  // Define the vault account
  let vault = anchor.web3.PublicKey;

  // Define the escrow account
  const escrow = PublicKey.findProgramAddressSync([
    Buffer.from("escrow"), 
    maker.publicKey.toBuffer(), 
    seed.toArrayLike(Buffer, "le", 8),
  ], program.programId)[0];

  it("Airdrop SOL to taker", async () => {
    const tx = await connection.requestAirdrop(taker.publicKey, LAMPORTS_PER_SOL * 1);
    await connection.confirmTransaction(tx);
    console.log("\n--------------------------------");
    console.log("Airdropped SOL to taker");
    console.log("Taker balance (SOL):", (await connection.getBalance(taker.publicKey)) / LAMPORTS_PER_SOL);
  });

  it("Initialize mints and ATAs", async () => {
    mintA = await createMint(connection, maker.payer, provider.publicKey, null, 9, Keypair.generate(), {commitment: "confirmed"}, tokenProgram);
    mintB = await createMint(connection, maker.payer, provider.publicKey, null, 9);
    mintC = await createMint(connection, maker.payer, provider.publicKey, null, 9);

    makerAtaA = getAssociatedTokenAddressSync(mintA, maker.publicKey, false, tokenProgram);
    makerAtaB = getAssociatedTokenAddressSync(mintB, maker.publicKey, false, tokenProgram);
    makerAtaC = getAssociatedTokenAddressSync(mintC, maker.publicKey, false, token2022Program);

    takerAtaA = getAssociatedTokenAddressSync(mintA, taker.publicKey, false, tokenProgram);
    takerAtaB = getAssociatedTokenAddressSync(mintB, taker.publicKey, false, tokenProgram);
    takerAtaC = getAssociatedTokenAddressSync(mintC, taker.publicKey, false, token2022Program);
    
    console.log("\n--------------------------------");
    console.log("Mint A:", mintA);
    console.log("Mint B:", mintB);
    console.log("Mint A balance:", (await connection.getTokenAccountBalance(makerAtaA)).value.amount);
    console.log("Mint B balance:", (await connection.getTokenAccountBalance(makerAtaB)).value.amount);
  });

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
